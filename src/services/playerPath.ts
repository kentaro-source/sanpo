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

export function setStopKm(
  kind: 'capital' | 'city',
  id: string,
  km: number,
): void {
  if (kind === 'capital') capitalKmOverrides.set(id, km);
  else cityKmOverrides.set(id, km);
}

export function getCapitalKm(id: string, fallback: number): number {
  const v = capitalKmOverrides.get(id);
  return v != null ? v : fallback;
}

export function getCityKm(id: string, fallback: number): number {
  const v = cityKmOverrides.get(id);
  return v != null ? v : fallback;
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

export function snappedPositionAtKm(km: number): SnappedPosition | null {
  return snapFromSegmentCache(km) ?? snapFromWindowPath(km);
}
