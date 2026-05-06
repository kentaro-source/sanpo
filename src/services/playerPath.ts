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

const STORAGE_KEY = 'sanpo-snapped-path-v1';
let current: BuiltPath | null = null;
let loadedFromDisk = false;

/**
 * Lazy-load any persisted path on first read so first-paint of
 * ShareToX doesn't have to wait for MapView's async Directions build
 * (which can take seconds-to-minutes on a fresh visible window).
 * MapView still overwrites with a fresh build when ready.
 */
function ensureLoaded(): void {
  if (loadedFromDisk) return;
  loadedFromDisk = true;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return;
    const parsed = JSON.parse(raw) as BuiltPath;
    if (
      parsed &&
      Array.isArray(parsed.allPoints) &&
      Array.isArray(parsed.cumKm) &&
      parsed.allPoints.length === parsed.cumKm.length &&
      parsed.allPoints.length > 1
    ) {
      current = parsed;
    }
  } catch {
    // ignore
  }
}

export function setBuiltPath(path: BuiltPath | null): void {
  current = path;
  loadedFromDisk = true;
  try {
    if (path) localStorage.setItem(STORAGE_KEY, JSON.stringify(path));
    else localStorage.removeItem(STORAGE_KEY);
  } catch {
    // quota or unavailable — ignore, in-memory still works
  }
}

/**
 * Return the actual road-snapped lat/lng for the given cumulative km,
 * or null if (a) no path is built yet, or (b) the requested km lies
 * outside the currently-built window.
 */
export function snappedPositionAtKm(km: number): SnappedPosition | null {
  ensureLoaded();
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
