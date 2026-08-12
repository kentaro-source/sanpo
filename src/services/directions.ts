/// <reference types="google.maps" />

/**
 * Google Maps Directions API wrapper.
 * Used to compute real road polylines for land segments.
 *
 * Cache: results stored in localStorage to minimize API calls.
 */

// Cache version bumped to v2 because we switched from DRIVING to WALKING-
// preferred routing — previous cached paths are driving routes and shouldn't
// be reused.
import { decodePath } from '../utils/polyline';

const CACHE_KEY = 'sanpo-directions-cache-v2';
const CACHE_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days
// Failures are ALSO cached (path: null), with a shorter TTL. Without
// this, pairs that can never route — every North-Korea pair (Google
// has no NK road data), closed land borders, etc. — re-fire the
// Directions API on every single launch, twice each (WALKING then
// DRIVING fallback), serially. ~9 NK pairs × 2 modes × network RTT
// was the bulk of the "route takes a minute to appear" launch lag.
const FAIL_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

interface CacheEntry {
  /** null = the API failed for both modes (negative cache). */
  path: google.maps.LatLngLiteral[] | null;
  timestamp: number;
}

interface Cache {
  [key: string]: CacheEntry;
}

// In-memory mirror of the on-disk cache. Re-parsing the localStorage
// JSON on every getRoadPolyline / getCachedPolyline call is expensive
// once the cache grows past a few hundred KB; load once and keep it.
let memCache: Cache | null = null;

function loadCache(): Cache {
  if (memCache) return memCache;
  try {
    // One-time cleanup: an old build persisted the built window path
    // under this key (~1.5M chars on the user's device). Nothing reads
    // it anymore, but it permanently ate ~30% of the localStorage
    // quota and pushed directions-cache writes into QuotaExceededError.
    // Same pattern as geocode.ts removing 'sanpo-geocode-cache-v1'.
    localStorage.removeItem('sanpo-snapped-path-v1');
  } catch {
    // ignore
  }
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    memCache = raw ? (JSON.parse(raw) as Cache) : {};
    purgeLegacyEntriesOnce(memCache);
  } catch {
    memCache = {};
  }
  return memCache;
}

/**
 * One-time cleanup of entries written by the pre-fix cache logic.
 *
 * Two kinds of garbage were found on the device (2026-07-30):
 *  - 103 negative entries. The old code negative-cached ANY failure for 7
 *    days, including transient ones (OVER_QUERY_LIMIT during a launch
 *    burst), which freezes perfectly routable legs into straight lines for
 *    a week. New code only negative-caches permanent statuses, but the
 *    already-written ones would still suppress fetches — so drop them.
 *  - One 2.25 MB unsimplified path (pre-simplification format), which alone
 *    ate a third of the localStorage quota.
 *
 * Valid, reasonably-sized road paths are KEPT: they are correct and
 * re-fetching them would spend quota for nothing. Uses its own flag key
 * (never reuse an old cleanup key) and only touches derived cache data —
 * no game progress is involved.
 */
const PURGE_FLAG_KEY = 'sanpo-dircache-purge-v1';
const LEGACY_OVERSIZE_POINTS = 25000;

function purgeLegacyEntriesOnce(cache: Cache): void {
  try {
    if (localStorage.getItem(PURGE_FLAG_KEY)) return;
  } catch {
    return;
  }
  let dropped = 0;
  for (const [k, v] of Object.entries(cache)) {
    if (!v || !v.path || v.path.length > LEGACY_OVERSIZE_POINTS) {
      delete cache[k];
      dropped += 1;
    }
  }
  try {
    localStorage.setItem(PURGE_FLAG_KEY, '1');
    if (dropped > 0) {
      localStorage.setItem(CACHE_KEY, JSON.stringify(cache));
      console.info(`[directions] purged ${dropped} legacy cache entries`);
    }
  } catch {
    // Flag write failed — worst case the purge runs again next launch.
  }
}

function saveCache(cache: Cache): void {
  memCache = cache;
  // QuotaExceeded recovery: evict the OLDEST entries and retry, instead
  // of dropping the whole cache. The old clear-everything handler was
  // the root cause of "device cache never accumulates": one oversized
  // write (a single unsimplified WALKING chunk could exceed the whole
  // ~5MB WebView quota by itself) nuked every previously cached leg,
  // so on-device routes re-fetched from scratch every launch and drew
  // straight lines while (re)loading.
  for (let attempt = 0; attempt < 12; attempt += 1) {
    try {
      localStorage.setItem(CACHE_KEY, JSON.stringify(cache));
      return;
    } catch {
      const keys = Object.keys(cache);
      if (keys.length === 0) break;
      keys.sort((a, b) => (cache[a].timestamp ?? 0) - (cache[b].timestamp ?? 0));
      // Drop the oldest ~20% (at least 1) and retry.
      const drop = Math.max(1, Math.floor(keys.length / 5));
      for (let i = 0; i < drop && i < keys.length; i += 1) {
        delete cache[keys[i]];
      }
    }
  }
  // Still failing with an empty (or undroppable) cache — give up on
  // persisting this round; the in-memory copy stays usable.
}

/**
 * Iterative Douglas-Peucker simplification (same ~10 m tolerance the
 * map rendering uses). Directions WALKING paths carry a vertex every
 * ~10 m — a single ≤25-stop chunk reached 138k points / 5.5M JSON
 * chars, which alone exceeds the Android WebView localStorage quota.
 * Simplifying BEFORE caching keeps a whole-world cache well under
 * quota with no visible quality loss (MapView re-simplifies at the
 * same epsilon anyway).
 */
const SIMPLIFY_EPS_DEG = 0.0001;

export function simplifyForCache(
  pts: google.maps.LatLngLiteral[],
): google.maps.LatLngLiteral[] {
  if (pts.length < 3) return pts;
  const perpDist = (
    p: google.maps.LatLngLiteral,
    a: google.maps.LatLngLiteral,
    b: google.maps.LatLngLiteral,
  ): number => {
    const dx = b.lat - a.lat;
    const dy = b.lng - a.lng;
    const lenSq = dx * dx + dy * dy;
    if (lenSq === 0) {
      const ddx = p.lat - a.lat;
      const ddy = p.lng - a.lng;
      return Math.sqrt(ddx * ddx + ddy * ddy);
    }
    const t = ((p.lat - a.lat) * dx + (p.lng - a.lng) * dy) / lenSq;
    const px = a.lat + t * dx;
    const py = a.lng + t * dy;
    const ddx = p.lat - px;
    const ddy = p.lng - py;
    return Math.sqrt(ddx * ddx + ddy * ddy);
  };
  const keep = new Uint8Array(pts.length);
  keep[0] = 1;
  keep[pts.length - 1] = 1;
  const stack: [number, number][] = [[0, pts.length - 1]];
  while (stack.length > 0) {
    const [start, end] = stack.pop()!;
    if (end - start < 2) continue;
    let maxD = 0;
    let maxI = -1;
    const a = pts[start];
    const b = pts[end];
    for (let i = start + 1; i < end; i += 1) {
      const d = perpDist(pts[i], a, b);
      if (d > maxD) {
        maxD = d;
        maxI = i;
      }
    }
    if (maxD > SIMPLIFY_EPS_DEG && maxI > -1) {
      keep[maxI] = 1;
      stack.push([start, maxI]);
      stack.push([maxI, end]);
    }
  }
  const out: google.maps.LatLngLiteral[] = [];
  // 5 decimals ≈ 1 m — full doubles ("-8.123456789012345") were ~45
  // JSON chars per point; rounding cuts the cache another ~30%.
  const round5 = (n: number) => Math.round(n * 1e5) / 1e5;
  for (let i = 0; i < pts.length; i += 1) {
    if (keep[i]) out.push({ lat: round5(pts[i].lat), lng: round5(pts[i].lng) });
  }
  return out;
}

export function makeCacheKey(
  origin: google.maps.LatLngLiteral,
  destination: google.maps.LatLngLiteral,
  waypoints: google.maps.LatLngLiteral[],
): string {
  const round = (n: number) => Math.round(n * 1000) / 1000;
  const parts = [origin, ...waypoints, destination]
    .map((p) => `${round(p.lat)},${round(p.lng)}`)
    .join('|');
  return parts;
}

/**
 * Road geometry generated ahead of time and shipped as static data
 * (public/route-geometry/<FROM>-<TO>.json), keyed by the SAME cache key
 * as live requests and stored as an encoded polyline.
 *
 * Purpose: the route is static, so every device re-deriving it from the
 * Directions API is pure waste — it cost real money (each launch
 * re-fetching burned the monthly free quota) and it was the reason routes
 * rendered as straight lines while loading. A hit here means no API call
 * at all.
 *
 * Staleness is impossible by construction: the key contains every stop
 * coordinate, so editing a route changes the key, misses the store, and
 * falls through to a live request.
 */
const precomputed = new Map<string, string>();

export function registerPrecomputedPaths(entries: Record<string, string>): void {
  for (const [k, v] of Object.entries(entries)) {
    if (typeof v === 'string' && v.length > 0) precomputed.set(k, v);
  }
}

/**
 * Decoded precomputed paths, kept in a SEPARATE map from the localStorage
 * cache.
 *
 * The first version put them into memCache, which looked harmless but
 * memCache is exactly what saveCache() persists — so one unrelated live
 * fetch would write the whole 2.1 MB of bundled geometry into localStorage,
 * re-creating the quota pressure the simplification fix removed. It also
 * made "localStorage stayed empty" useless as evidence that no API call
 * happened (observed on device: 9 entries / 1 MB after a cold start that
 * should have been fully served from the bundle).
 */
const decodedPrecomputed = new Map<string, google.maps.LatLngLiteral[]>();

function takePrecomputed(cacheKey: string): google.maps.LatLngLiteral[] | null {
  const already = decodedPrecomputed.get(cacheKey);
  if (already) return already;
  const enc = precomputed.get(cacheKey);
  if (!enc) return null;
  const path = decodePath(enc);
  if (path.length < 2) return null;
  decodedPrecomputed.set(cacheKey, path);
  return path;
}

let directionsService: google.maps.DirectionsService | null = null;

function getService(): google.maps.DirectionsService {
  if (!directionsService) {
    directionsService = new google.maps.DirectionsService();
  }
  return directionsService;
}

/**
 * Synchronous cache-only lookup. Returns a cached polyline if one
 * exists for this exact origin/dest/waypoints combo, else null.
 * Used by ShareToX / playerPath to snap-locate the player without
 * waiting on MapView's async Directions API build.
 */
export function getCachedPolyline(
  origin: google.maps.LatLngLiteral,
  destination: google.maps.LatLngLiteral,
  waypoints: google.maps.LatLngLiteral[] = [],
): google.maps.LatLngLiteral[] | null {
  const cacheKey = makeCacheKey(origin, destination, waypoints);
  const cache = loadCache();
  const cached = cache[cacheKey];
  if (cached && cached.path && Date.now() - cached.timestamp < CACHE_TTL_MS) {
    return cached.path;
  }
  return takePrecomputed(cacheKey);
}

/**
 * In-flight request dedupe. At launch the route window can get built
 * more than once concurrently (effect re-runs / double mount); without
 * this each build fired its own WALKING+DRIVING calls for the SAME
 * pair — visible in logs as every Directions error appearing twice.
 * Concurrent callers now share one promise; the result lands in the
 * localStorage cache once.
 */
const inFlight = new Map<
  string,
  Promise<google.maps.LatLngLiteral[] | null>
>();

/**
 * Get a road-following polyline for a segment.
 * Returns null on API failure (caller should fall back to straight line).
 */
export function getRoadPolyline(
  origin: google.maps.LatLngLiteral,
  destination: google.maps.LatLngLiteral,
  waypoints: google.maps.LatLngLiteral[] = [],
): Promise<google.maps.LatLngLiteral[] | null> {
  const cacheKey = makeCacheKey(origin, destination, waypoints);
  const cache = loadCache();
  const cached = cache[cacheKey];
  if (cached) {
    const age = Date.now() - cached.timestamp;
    if (cached.path && age < CACHE_TTL_MS) return Promise.resolve(cached.path);
    // Negative cache hit: this pair failed both WALKING and DRIVING
    // recently (NK roads, closed borders…). Don't re-fire the API —
    // the caller falls back to a straight line, same as last time.
    if (!cached.path && age < FAIL_TTL_MS) return Promise.resolve(null);
  }

  // Shipped geometry — no network, no quota.
  const pre = takePrecomputed(cacheKey);
  if (pre) return Promise.resolve(pre);

  const existing = inFlight.get(cacheKey);
  if (existing) return existing;

  const job = fetchRoadPolyline(origin, destination, waypoints, cacheKey)
    .finally(() => {
      inFlight.delete(cacheKey);
    });
  inFlight.set(cacheKey, job);
  return job;
}

/**
 * Failure statuses that mean "this pair can never route" — safe to
 * negative-cache for FAIL_TTL_MS. Everything else (OVER_QUERY_LIMIT
 * rate limiting, UNKNOWN_ERROR, network hiccups, REQUEST_DENIED key
 * problems) is transient: caching those for 7 days froze perfectly
 * routable legs into straight lines after one bad launch burst.
 */
const PERMANENT_FAIL_STATUSES = new Set([
  'ZERO_RESULTS',
  'NOT_FOUND',
  'MAX_WAYPOINTS_EXCEEDED',
  'MAX_ROUTE_LENGTH_EXCEEDED',
  'INVALID_REQUEST',
]);

async function fetchRoadPolyline(
  origin: google.maps.LatLngLiteral,
  destination: google.maps.LatLngLiteral,
  waypoints: google.maps.LatLngLiteral[],
  cacheKey: string,
): Promise<google.maps.LatLngLiteral[] | null> {
  const cache = loadCache();

  // Try walking first (fits the "歩いて世界一周" theme), then fall back to
  // driving for long inter-city legs the walking router refuses to compute.
  const tryRoute = async (
    travelMode: google.maps.TravelMode,
  ): Promise<{ path: google.maps.LatLngLiteral[] | null; status: string }> => {
    try {
      const service = getService();
      const result = await new Promise<google.maps.DirectionsResult>(
        (resolve, reject) => {
          service.route(
            {
              origin,
              destination,
              waypoints: waypoints.map((w) => ({ location: w, stopover: false })),
              travelMode,
              optimizeWaypoints: false,
            },
            (res, status) => {
              if (status === 'OK' && res) {
                resolve(res);
              } else {
                reject(new Error(String(status)));
              }
            },
          );
        },
      );
      const path: google.maps.LatLngLiteral[] = [];
      for (const leg of result.routes[0].legs) {
        for (const step of leg.steps) {
          for (const point of step.path) {
            path.push({ lat: point.lat(), lng: point.lng() });
          }
        }
      }
      return { path, status: 'OK' };
    } catch (e) {
      const status = e instanceof Error ? e.message : String(e);
      console.warn(`Directions ${travelMode} failed:`, status);
      return { path: null, status };
    }
  };

  const walking = await tryRoute(google.maps.TravelMode.WALKING);
  let path = walking.path;
  let driving: { path: google.maps.LatLngLiteral[] | null; status: string } | null =
    null;
  if (!path) {
    // Walking router rejects routes longer than a few hundred km. Retry
    // with driving so the polyline at least follows real roads.
    driving = await tryRoute(google.maps.TravelMode.DRIVING);
    path = driving.path;
  }

  if (path) {
    // Simplify BEFORE caching — raw WALKING paths are ~1 vertex/10m and
    // a single chunk's JSON could exceed the WebView's entire quota.
    const simplified = simplifyForCache(path);
    cache[cacheKey] = { path: simplified, timestamp: Date.now() };
    saveCache(cache);
    return simplified;
  }

  // Negative-cache ONLY when both modes failed permanently; a transient
  // failure must retry next launch instead of straight-lining for 7 days.
  const permanentFailure =
    PERMANENT_FAIL_STATUSES.has(walking.status) &&
    driving != null &&
    PERMANENT_FAIL_STATUSES.has(driving.status);
  if (permanentFailure) {
    cache[cacheKey] = { path: null, timestamp: Date.now() };
    saveCache(cache);
  }
  return null;
}

/** Clear all cached polylines (e.g., when route data changes). */
export function clearDirectionsCache(): void {
  try {
    localStorage.removeItem(CACHE_KEY);
  } catch {
    // ignore
  }
}
