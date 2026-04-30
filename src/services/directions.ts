/// <reference types="google.maps" />

/**
 * Google Maps Directions API wrapper.
 * Used to compute real road polylines for land segments.
 *
 * Cache: results stored in localStorage to minimize API calls.
 */

const CACHE_KEY = 'sanpo-directions-cache-v1';
const CACHE_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

interface CacheEntry {
  path: google.maps.LatLngLiteral[];
  timestamp: number;
}

interface Cache {
  [key: string]: CacheEntry;
}

function loadCache(): Cache {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    if (!raw) return {};
    return JSON.parse(raw) as Cache;
  } catch {
    return {};
  }
}

function saveCache(cache: Cache): void {
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify(cache));
  } catch {
    // Quota exceeded - clear and retry
    try {
      localStorage.removeItem(CACHE_KEY);
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
 * Get a road-following polyline for a segment.
 * Returns null on API failure (caller should fall back to straight line).
 */
export async function getRoadPolyline(
  origin: google.maps.LatLngLiteral,
  destination: google.maps.LatLngLiteral,
  waypoints: google.maps.LatLngLiteral[] = [],
): Promise<google.maps.LatLngLiteral[] | null> {
  const cacheKey = makeCacheKey(origin, destination, waypoints);
  const cache = loadCache();
  const cached = cache[cacheKey];
  if (cached && Date.now() - cached.timestamp < CACHE_TTL_MS) {
    return cached.path;
  }

  try {
    const service = getService();
    const result = await new Promise<google.maps.DirectionsResult>(
      (resolve, reject) => {
        service.route(
          {
            origin,
            destination,
            waypoints: waypoints.map((w) => ({ location: w, stopover: false })),
            travelMode: google.maps.TravelMode.DRIVING,
            optimizeWaypoints: false,
          },
          (res, status) => {
            if (status === 'OK' && res) {
              resolve(res);
            } else {
              reject(new Error(`Directions failed: ${status}`));
            }
          },
        );
      },
    );

    // Extract path from all legs
    const path: google.maps.LatLngLiteral[] = [];
    for (const leg of result.routes[0].legs) {
      for (const step of leg.steps) {
        for (const point of step.path) {
          path.push({ lat: point.lat(), lng: point.lng() });
        }
      }
    }

    // Cache result
    cache[cacheKey] = { path, timestamp: Date.now() };
    saveCache(cache);

    return path;
  } catch (e) {
    console.warn('Directions API error:', e);
    return null;
  }
}

/** Clear all cached polylines (e.g., when route data changes). */
export function clearDirectionsCache(): void {
  try {
    localStorage.removeItem(CACHE_KEY);
  } catch {
    // ignore
  }
}
