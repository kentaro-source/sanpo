/**
 * Reverse-geocoding wrapper around google.maps.Geocoder. Two-layer cache
 * (in-memory Map + localStorage) keyed by lat/lng rounded to 3 decimals
 * (~110m resolution) so that re-opening the share dialog at roughly the
 * same position returns instantly without re-billing the API.
 *
 * Falls back to null on any error (missing API, status != OK, network)
 * so callers can swap in a route-local fallback (nearest predefined city)
 * without crashing the share UI.
 */

export interface GeocodeResult {
  /** Human-readable place label, e.g. "横浜市中区" or "Hamamatsu". */
  name: string;
  /** ISO 3166-1 alpha-2 country code, for flag emoji rendering. */
  cc: string;
}

type GoogleNs = {
  maps?: {
    Geocoder?: new () => {
      geocode: (req: {
        location: { lat: number; lng: number };
        language?: string;
      }) => Promise<{ results: GoogleGeocodeResult[] }>;
    };
  };
};

interface GoogleGeocodeResult {
  formatted_address: string;
  address_components: Array<{
    short_name: string;
    long_name: string;
    types: string[];
  }>;
}

const STORAGE_KEY = 'sanpo-geocode-cache-v1';
const memCache = new Map<string, GeocodeResult>();
let diskLoaded = false;

function key(lat: number, lng: number): string {
  return `${lat.toFixed(3)},${lng.toFixed(3)}`;
}

function loadDiskCache(): void {
  if (diskLoaded) return;
  diskLoaded = true;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return;
    const parsed = JSON.parse(raw) as Record<string, GeocodeResult>;
    for (const [k, v] of Object.entries(parsed)) {
      if (v && typeof v.name === 'string' && typeof v.cc === 'string') {
        memCache.set(k, v);
      }
    }
  } catch {
    // ignore
  }
}

function saveDiskCache(): void {
  try {
    const obj: Record<string, GeocodeResult> = {};
    for (const [k, v] of memCache.entries()) obj[k] = v;
    localStorage.setItem(STORAGE_KEY, JSON.stringify(obj));
  } catch {
    // quota etc., ignore
  }
}

/**
 * Pick a short label from a Geocoder result. Stay at the locality
 * (city / 区) level — sublocality detail (neighborhood / chome name)
 * was too granular for X posts: rural points returned obscure names
 * like "向笠新屋" that nobody recognizes, and the inconsistency between
 * dense urban neighborhoods and rural micro-areas was jarring. City
 * name alone reads cleanly: "世田谷区", "磐田市", "Hamamatsu".
 */
function pickLabel(result: GoogleGeocodeResult): GeocodeResult {
  const getLong = (type: string): string | undefined =>
    result.address_components.find((c) => c.types.includes(type))?.long_name;
  const getShort = (type: string): string | undefined =>
    result.address_components.find((c) => c.types.includes(type))?.short_name;
  const cc = (getShort('country') ?? '').toUpperCase();
  const locality = getLong('locality');
  const adminLvl2 = getLong('administrative_area_level_2');
  const adminLvl1 = getLong('administrative_area_level_1');

  if (locality) return { name: locality, cc };
  if (adminLvl2) return { name: adminLvl2, cc };
  if (adminLvl1) return { name: adminLvl1, cc };
  const first = result.formatted_address.split(',')[0]?.trim();
  return { name: first || '?', cc };
}

export function reverseGeocodeCached(
  lat: number,
  lng: number,
): GeocodeResult | null {
  loadDiskCache();
  return memCache.get(key(lat, lng)) ?? null;
}

export async function reverseGeocode(
  lat: number,
  lng: number,
): Promise<GeocodeResult | null> {
  loadDiskCache();
  const k = key(lat, lng);
  const hit = memCache.get(k);
  if (hit) return hit;

  const g = (window as unknown as { google?: GoogleNs }).google;
  const Geocoder = g?.maps?.Geocoder;
  if (!Geocoder) return null;

  try {
    const geocoder = new Geocoder();
    const { results } = await geocoder.geocode({
      location: { lat, lng },
      language: 'ja',
    });
    if (!results.length) return null;
    const label = pickLabel(results[0]);
    memCache.set(k, label);
    saveDiskCache();
    return label;
  } catch {
    return null;
  }
}
