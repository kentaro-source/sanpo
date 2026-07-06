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
    const raw = localStorage.getItem(CACHE_KEY);
    memCache = raw ? (JSON.parse(raw) as Cache) : {};
  } catch {
    memCache = {};
  }
  return memCache;
}

function saveCache(cache: Cache): void {
  memCache = cache;
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify(cache));
  } catch {
    // Quota exceeded - clear and retry
    try {
      localStorage.removeItem(CACHE_KEY);
      memCache = {};
    } catch {
      // ignore
    }
  }
}

function makeCacheKey(
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
  return null;
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

  const existing = inFlight.get(cacheKey);
  if (existing) return existing;

  const job = fetchRoadPolyline(origin, destination, waypoints, cacheKey)
    .finally(() => {
      inFlight.delete(cacheKey);
    });
  inFlight.set(cacheKey, job);
  return job;
}

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
  ): Promise<google.maps.LatLngLiteral[] | null> => {
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
                reject(new Error(`Directions ${travelMode} failed: ${status}`));
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
      return path;
    } catch (e) {
      console.warn('Directions API error:', e);
      return null;
    }
  };

  let path = await tryRoute(google.maps.TravelMode.WALKING);
  if (!path) {
    // Walking router rejects routes longer than a few hundred km. Retry
    // with driving so the polyline at least follows real roads.
    path = await tryRoute(google.maps.TravelMode.DRIVING);
  }

  // Cache the outcome either way — successes for 30 days, failures for
  // 7 (FAIL_TTL_MS) so unroutable pairs stop costing two API calls per
  // launch.
  cache[cacheKey] = { path, timestamp: Date.now() };
  saveCache(cache);
  return path;
}

/** Clear all cached polylines (e.g., when route data changes). */
export function clearDirectionsCache(): void {
  try {
    localStorage.removeItem(CACHE_KEY);
  } catch {
    // ignore
  }
}
