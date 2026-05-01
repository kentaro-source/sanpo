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
  if (!path) return null;

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
