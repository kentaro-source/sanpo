/**
 * Module-level shared store for the road-snapped player path.
 *
 * MapView builds a Directions-API polyline for the visible window of
 * segments (covers a few hundred km around the player). The polyline
 * is much closer to actual roads than the squares-interpolated path
 * exposed by `positionAtKm()` (which drifts into the sea between
 * sparse waypoints). Other consumers (e.g. ShareToX, reverse
 * geocoding) need the same snapped lat/lng for accuracy, so MapView
 * pushes the built path here and others read from it.
 *
 * Falls back to null when no path has been built yet (e.g. immediately
 * after app start, before MapView's async Directions calls finish).
 * Callers should fall back to positionAtKm in that case.
 */

export interface SnappedPosition {
  lat: number;
  lng: number;
}

interface BuiltPath {
  allPoints: SnappedPosition[];
  cumKm: number[];
}

let current: BuiltPath | null = null;

export function setBuiltPath(path: BuiltPath | null): void {
  current = path;
}

/**
 * Return the actual road-snapped lat/lng for the given cumulative km,
 * or null if (a) no path is built yet, or (b) the requested km lies
 * outside the currently-built window.
 */
export function snappedPositionAtKm(km: number): SnappedPosition | null {
  if (!current || current.cumKm.length < 2) return null;
  const { allPoints, cumKm } = current;
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
