/**
 * Resolve the player's km-position to an actual road-snapped lat/lng.
 *
 * Two strategies, both light:
 *   1. (preferred) Segment-direct cache lookup. Identify the segment
 *      containing `km`, read its cached Directions polyline (the same
 *      cache MapView populates), walk the polyline to compute lat/lng
 *      at the relative offset from segment start. No API call, no
 *      window-wide build wait — just one cache hit + a linear walk
 *      of a few hundred polyline points.
 *   2. (fallback) MapView's pushed window path via setBuiltPath, used
 *      if the per-segment cache isn't populated yet.
 *
 * Returns null when neither is available; callers fall back to
 * positionAtKm (squares-coarse but always available).
 */

import { routeData } from '../data';
import { cities } from '../data/cities';
import { segmentClassifications } from '../data/segmentMeta';
import { positionAtKm } from '../data/generateRoute';
import { getCachedPolyline } from './directions';

export interface SnappedPosition {
  lat: number;
  lng: number;
}

interface BuiltPath {
  allPoints: SnappedPosition[];
  cumKm: number[];
}

let windowPath: BuiltPath | null = null;

export function setBuiltPath(path: BuiltPath | null): void {
  windowPath = path;
}

/**
 * Snap-cumulative km overrides for capitals/cities within MapView's
 * built window. Lets ShareToX / upcomingStops use the same km values
 * as the actual rendered polyline, fixing the "湖西市にいるのに浜松は
 * これから" mismatch caused by squares-coarse × 1.4 vs real road km
 * divergence. Out-of-window stops keep the original routeData km.
 */
const capitalKmOverrides = new Map<string, number>();
const cityKmOverrides = new Map<string, number>();
// React subscribers (useGame) so useMemo re-runs when overrides update.
const overrideListeners = new Set<() => void>();

export function subscribeOverrides(cb: () => void): () => void {
  overrideListeners.add(cb);
  return () => overrideListeners.delete(cb);
}

function notifyOverrideListeners(): void {
  overrideListeners.forEach((cb) => {
    try {
      cb();
    } catch {
      // ignore listener errors
    }
  });
}

export function setStopKm(
  kind: 'capital' | 'city',
  id: string,
  km: number,
): void {
  const map = kind === 'capital' ? capitalKmOverrides : cityKmOverrides;
  const prev = map.get(id);
  if (prev === km) return; // no-op: don't notify if unchanged
  map.set(id, km);
  notifyOverrideListeners();
}

// Scale unified to RAW routeData km. The snap-cumulative override is now
// IGNORED for all km lookups: distanceKm accumulates in raw km (KM_PER_STEP)
// and the player marker is positioned by raw routeData, so crossing/stop/
// distance logic must use the SAME raw km — otherwise the marker sits at one
// place (raw) while crossings fire at another (snap), which is exactly the
// dual-scale bug that warped the player and re-credited already-passed
// cities. Displayed "○○まで Nkm" is now raw (great-circle × road factor),
// consistent everywhere. The override map is still written by MapView but
// never read (harmless).
export function getCapitalKm(_id: string, fallback: number): number {
  return fallback;
}

export function getCityKm(_id: string, fallback: number): number {
  return fallback;
}

/** Haversine km between two lat/lng — used to walk the cached polyline. */
function kmBetween(a: SnappedPosition, b: SnappedPosition): number {
  const R = 6371;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.sin(dLng / 2) ** 2 * Math.cos(lat1) * Math.cos(lat2);
  return 2 * R * Math.asin(Math.sqrt(h));
}

function snapFromSegmentCache(km: number): SnappedPosition | null {
  // Identify the containing segment by capital km bookends.
  const caps = routeData.capitals;
  const capDist = routeData.capitalDistances;
  let segIdx = -1;
  let segStartKm = 0;
  for (let i = 0; i < caps.length - 1; i++) {
    const fromKm = capDist[caps[i].id];
    const toKm = capDist[caps[i + 1].id];
    if (fromKm == null || toKm == null) continue;
    if (km >= fromKm && km <= toKm) {
      segIdx = i;
      segStartKm = fromKm;
      break;
    }
  }
  if (segIdx < 0) return null;

  const fromCap = caps[segIdx];
  const toCap = caps[segIdx + 1];
  const meta = segmentClassifications.find(
    (m) => m.fromCapitalId === fromCap.id && m.toCapitalId === toCap.id,
  );
  // Only land/mixed segments produce a road-snapped polyline; sea /
  // fantasy use straight lines, no snap improvement available.
  if (!meta || (meta.routeType !== 'land' && meta.routeType !== 'mixed')) {
    return null;
  }

  const origin = { lat: fromCap.lat, lng: fromCap.lng };
  const destination = { lat: toCap.lat, lng: toCap.lng };
  const waypoints: SnappedPosition[] = [];
  for (const cityId of meta.waypointCityIds ?? []) {
    const city = cities.find((c) => c.id === cityId);
    if (city) waypoints.push({ lat: city.lat, lng: city.lng });
  }

  const polyline = getCachedPolyline(origin, destination, waypoints);
  if (!polyline || polyline.length < 2) return null;

  // Walk along the polyline accumulating distance until the requested
  // offset from segment start is reached.
  const targetOffset = Math.max(0, km - segStartKm);
  let traveled = 0;
  for (let i = 1; i < polyline.length; i++) {
    const a = polyline[i - 1];
    const b = polyline[i];
    const step = kmBetween(a, b);
    if (traveled + step >= targetOffset) {
      const f = step > 0 ? (targetOffset - traveled) / step : 0;
      return {
        lat: a.lat + (b.lat - a.lat) * f,
        lng: a.lng + (b.lng - a.lng) * f,
      };
    }
    traveled += step;
  }
  return polyline[polyline.length - 1];
}

function snapFromWindowPath(km: number): SnappedPosition | null {
  if (!windowPath || windowPath.cumKm.length < 2) return null;
  const { allPoints, cumKm } = windowPath;
  const lo = cumKm[0];
  const hi = cumKm[cumKm.length - 1];
  if (km < lo - 0.001 || km > hi + 0.001) return null;
  let idx = -1;
  for (let i = 0; i < cumKm.length; i++) {
    if (cumKm[i] >= km) {
      idx = i;
      break;
    }
  }
  if (idx === 0) return allPoints[0];
  if (idx === -1) return allPoints[allPoints.length - 1];
  const a = allPoints[idx - 1];
  const b = allPoints[idx];
  const segKm = cumKm[idx] - cumKm[idx - 1];
  const frac = segKm > 0 ? (km - cumKm[idx - 1]) / segKm : 0;
  const f = Math.max(0, Math.min(1, frac));
  return {
    lat: a.lat + (b.lat - a.lat) * f,
    lng: a.lng + (b.lng - a.lng) * f,
  };
}

// ── Marker-matched positioning (anchor on EVERY stop, map onto built path) ──
// This mirrors MapView's markerOnBuiltPath/projectOntoPath EXACTLY so that
// ShareToX's start/current location agrees with the on-map player marker.
//
// Why this is needed: the old snapFromWindowPath used the built path's
// cumulative km as the km axis. On device the Directions cache is near-empty,
// so MapView builds the path with straight-line fallbacks (bug: 陸路で直線),
// which COMPRESSES China's arc length — km 18,218 then maps onto Davao/PH on
// that path even though the player is in Guangdong/China. The marker never had
// this problem because it anchors on each stop's real lat/lng (raw km),
// decoupling from the path's arc-length scale. ShareToX must do the same.

let stopAnchorsCache: { km: number; lat: number; lng: number }[] | null = null;
function getStopAnchors(): { km: number; lat: number; lng: number }[] {
  if (stopAnchorsCache) return stopAnchorsCache;
  const list: { km: number; lat: number; lng: number }[] = [];
  for (const cap of routeData.capitals) {
    const km = routeData.capitalDistances[cap.id];
    if (km != null) list.push({ km, lat: cap.lat, lng: cap.lng });
  }
  const wpIds = new Set<string>();
  for (const seg of segmentClassifications) {
    for (const cid of seg.waypointCityIds ?? []) wpIds.add(cid);
  }
  for (const c of cities) {
    if (!wpIds.has(c.id)) continue;
    const km = routeData.cityDistances?.[c.id];
    if (km != null) list.push({ km, lat: c.lat, lng: c.lng });
  }
  list.sort((p, q) => p.km - q.km);
  stopAnchorsCache = list;
  return list;
}

/**
 * Nearest path point to an anchor, but only when the path really passes
 * near it — an unbounded search "matches" an anchor to the far end of a
 * partial path, which put the map on Manila while the player was on Bali
 * (see the same guard in MapView's markerOnBuiltPath). Stops are vertices
 * of the real path, so a genuine match is well inside 0.5° (~55 km).
 */
const ANCHOR_TOLERANCE_DEG = 0.5;

function nearestIdx(pts: SnappedPosition[], lat: number, lng: number): number {
  let bi = -1;
  let bd = Infinity;
  for (let i = 0; i < pts.length; i += 1) {
    const dl = pts[i].lat - lat;
    const dg = pts[i].lng - lng;
    const d = dl * dl + dg * dg;
    if (d < bd) {
      bd = d;
      bi = i;
    }
  }
  return bd <= ANCHOR_TOLERANCE_DEG * ANCHOR_TOLERANCE_DEG ? bi : -1;
}

function markerOnBuilt(
  built: BuiltPath,
  distanceKm: number,
  anchors: { km: number; lat: number; lng: number }[],
): SnappedPosition | null {
  const { allPoints, cumKm } = built;
  const n = anchors.length;
  if (n < 2 || distanceKm < anchors[0].km || distanceKm > anchors[n - 1].km) {
    return null;
  }
  let lo = 0;
  let hi = n - 1;
  while (lo < hi - 1) {
    const mid = (lo + hi) >> 1;
    if (anchors[mid].km <= distanceKm) lo = mid;
    else hi = mid;
  }
  const a = anchors[lo];
  const b = anchors[hi];
  if (b.km <= a.km) return null;
  const ia = nearestIdx(allPoints, a.lat, a.lng);
  const ib = nearestIdx(allPoints, b.lat, b.lng);
  if (ia < 0 || ib < 0 || ia >= ib) return null;
  const f = (distanceKm - a.km) / (b.km - a.km);
  const targetArc = cumKm[ia] + f * (cumKm[ib] - cumKm[ia]);
  for (let i = ia + 1; i <= ib; i += 1) {
    if (cumKm[i] >= targetArc) {
      const seg = cumKm[i] - cumKm[i - 1];
      const t =
        seg > 0 ? Math.max(0, Math.min(1, (targetArc - cumKm[i - 1]) / seg)) : 0;
      return {
        lat: allPoints[i - 1].lat + (allPoints[i].lat - allPoints[i - 1].lat) * t,
        lng: allPoints[i - 1].lng + (allPoints[i].lng - allPoints[i - 1].lng) * t,
      };
    }
  }
  const last = allPoints[ib];
  return { lat: last.lat, lng: last.lng };
}

function projectOnto(
  pts: SnappedPosition[],
  target: SnappedPosition,
): SnappedPosition {
  let bestD = Infinity;
  let bestLat = pts[0].lat;
  let bestLng = pts[0].lng;
  for (let i = 0; i < pts.length - 1; i += 1) {
    const ax = pts[i].lat;
    const ay = pts[i].lng;
    const dx = pts[i + 1].lat - ax;
    const dy = pts[i + 1].lng - ay;
    const lenSq = dx * dx + dy * dy;
    let t =
      lenSq > 0 ? ((target.lat - ax) * dx + (target.lng - ay) * dy) / lenSq : 0;
    if (t < 0) t = 0;
    else if (t > 1) t = 1;
    const px = ax + t * dx;
    const py = ay + t * dy;
    const ddx = target.lat - px;
    const ddy = target.lng - py;
    const d = ddx * ddx + ddy * ddy;
    if (d < bestD) {
      bestD = d;
      bestLat = px;
      bestLng = py;
    }
  }
  return { lat: bestLat, lng: bestLng };
}

/**
 * Player road position IDENTICAL to MapView's on-map marker: anchor `km` to
 * every route stop's raw km and map onto the built road path. Returns null
 * when MapView hasn't pushed a built window yet (caller falls back to the raw
 * positionAtKm, which is on the same raw scale as the stops → correct country
 * regardless).
 */
export function markerPositionAtKm(km: number): SnappedPosition | null {
  if (!windowPath || windowPath.allPoints.length < 2) return null;
  const anchors = getStopAnchors();
  const m = markerOnBuilt(windowPath, km, anchors);
  if (m) return m;
  // Same fallback the marker uses: project the raw position onto the path.
  return projectOnto(windowPath.allPoints, positionAtKm(routeData, km));
}

export function snappedPositionAtKm(km: number): SnappedPosition | null {
  // Prefer the marker-matched position so ShareToX agrees with the on-map
  // marker. snapFromSegmentCache (real road, when a per-segment polyline is
  // cached) and the legacy window-path snap remain as fallbacks.
  return (
    markerPositionAtKm(km) ?? snapFromSegmentCache(km) ?? snapFromWindowPath(km)
  );
}
