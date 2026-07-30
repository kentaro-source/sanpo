import { registerPrecomputedPaths } from './directions';

/**
 * Loads pre-generated road geometry for a route segment.
 *
 * Files live at `public/route-geometry/<FROM>-<TO>.json` and map the
 * Directions cache key → encoded polyline. They are produced offline (see
 * scripts/gen-route-geometry) so devices never have to derive the route
 * from the Directions API: that re-derivation was burning the monthly free
 * quota on every launch and was why routes rendered as straight lines
 * while loading.
 *
 * In the APK these files ship inside the app (public/ is bundled), so the
 * lookup is a local read and works offline. In the PWA they are fetched
 * once per segment and then served by the service worker cache.
 *
 * A missing or partial file is not an error — `getRoadPolyline` simply
 * falls through to a live request, exactly as before.
 */

const settled = new Set<string>();
const inFlight = new Map<string, Promise<void>>();

export function segmentGeometryKey(fromId: string, toId: string): string {
  return `${fromId}-${toId}`;
}

export function preloadSegmentGeometry(
  fromId: string,
  toId: string,
): Promise<void> {
  const key = segmentGeometryKey(fromId, toId);
  if (settled.has(key)) return Promise.resolve();
  const existing = inFlight.get(key);
  if (existing) return existing;

  const job = (async () => {
    try {
      const base = import.meta.env.BASE_URL ?? '/';
      const res = await fetch(`${base}route-geometry/${key}.json`, {
        cache: 'force-cache',
      });
      if (res.ok) {
        const data = (await res.json()) as Record<string, string>;
        registerPrecomputedPaths(data);
      }
    } catch {
      // Offline / not generated yet → live Directions fallback.
    }
    // Mark settled even on failure: a 404 must not be re-requested on
    // every polyline rebuild (that would be one wasted fetch per step).
    settled.add(key);
  })().finally(() => {
    inFlight.delete(key);
  });

  inFlight.set(key, job);
  return job;
}
