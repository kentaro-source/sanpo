/**
 * Precompute real road distances for each segment via the Google Directions
 * HTTP API, save them to src/data/segmentDistances.ts. generateRoute.ts then
 * uses real distance instead of great-circle, giving accurate square counts
 * (e.g. Tokyo→Seoul jumps from 11 squares to ~15 once Miyazaki/Nagasaki/
 * Fukuoka driving distance is reflected).
 *
 * Usage:
 *   npx tsx scripts/precompute-distances.ts
 *
 * Idempotent: cached results are reused. Delete the file or pass --force to
 * regenerate.
 *
 * Sea segments (per segmentMeta.seaSegments) are still computed via haversine
 * since Directions has no marine routing. Mixed segments compute each
 * sub-segment with the appropriate method.
 */

import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { capitals } from '../src/data/capitals';
import { cities } from '../src/data/cities';
import { segmentClassifications } from '../src/data/segmentMeta';

const __dirname = dirname(fileURLToPath(import.meta.url));

// API key - read from .env.local
function loadApiKey(): string {
  const envPath = resolve(__dirname, '..', '.env.local');
  if (!existsSync(envPath)) {
    throw new Error('.env.local not found. Set VITE_GOOGLE_MAPS_API_KEY first.');
  }
  const content = readFileSync(envPath, 'utf8');
  const match = content.match(/VITE_GOOGLE_MAPS_API_KEY=(.+)/);
  if (!match) throw new Error('VITE_GOOGLE_MAPS_API_KEY missing in .env.local');
  return match[1].trim();
}

const API_KEY = loadApiKey();
const FORCE = process.argv.includes('--force');

type LL = { lat: number; lng: number };

function haversineKm(a: LL, b: LL): number {
  const R = 6371;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

async function directionsKm(origin: LL, destination: LL): Promise<number | null> {
  const url = new URL('https://maps.googleapis.com/maps/api/directions/json');
  url.searchParams.set('origin', `${origin.lat},${origin.lng}`);
  url.searchParams.set('destination', `${destination.lat},${destination.lng}`);
  url.searchParams.set('key', API_KEY);
  // The web API key has referrer restrictions; the Directions HTTP API
  // honors the Referer header for that check.
  const res = await fetch(url.toString(), {
    headers: { Referer: 'https://kentaro-source.github.io/' },
  });
  if (!res.ok) {
    console.warn(`  ! HTTP ${res.status} for ${origin.lat},${origin.lng}→${destination.lat},${destination.lng}`);
    return null;
  }
  const data = (await res.json()) as {
    status: string;
    routes?: Array<{ legs?: Array<{ distance?: { value?: number } }> }>;
  };
  if (data.status !== 'OK') {
    console.warn(`  ! ${data.status} for ${origin.lat},${origin.lng}→${destination.lat},${destination.lng}`);
    return null;
  }
  const meters = data.routes?.[0]?.legs?.[0]?.distance?.value ?? 0;
  return meters / 1000;
}

interface SegmentDistance {
  fromCapitalId: string;
  toCapitalId: string;
  km: number;
  source: 'directions' | 'directions+sea' | 'haversine' | 'haversine+waypoints';
}

async function computeSegmentDistance(
  fromId: string,
  toId: string,
): Promise<SegmentDistance> {
  const from = capitals.find((c) => c.id === fromId);
  const to = capitals.find((c) => c.id === toId);
  if (!from || !to) throw new Error(`Capital not found: ${fromId} or ${toId}`);

  const meta = segmentClassifications.find(
    (s) => s.fromCapitalId === fromId && s.toCapitalId === toId,
  );

  // Unclassified: fall back to great-circle.
  if (!meta) {
    return {
      fromCapitalId: fromId,
      toCapitalId: toId,
      km: haversineKm(from, to),
      source: 'haversine',
    };
  }

  const wpCities = (meta.waypointCityIds ?? [])
    .map((cid) => cities.find((c) => c.id === cid))
    .filter((c): c is NonNullable<typeof c> => !!c);
  const points: LL[] = [
    { lat: from.lat, lng: from.lng },
    ...wpCities.map((c) => ({ lat: c.lat, lng: c.lng })),
    { lat: to.lat, lng: to.lng },
  ];

  if (meta.routeType === 'sea' || meta.routeType === 'fantasy') {
    let total = 0;
    for (let i = 0; i < points.length - 1; i++) total += haversineKm(points[i], points[i + 1]);
    return {
      fromCapitalId: fromId,
      toCapitalId: toId,
      km: total,
      source: 'haversine+waypoints',
    };
  }

  // land or mixed: use Directions per sub-pair, except for explicit sea sub-segments
  const seaSet = new Set((meta.seaSegments ?? []).map(([a, b]) => `${a}-${b}`));
  let total = 0;
  let hadSea = false;
  for (let i = 0; i < points.length - 1; i++) {
    const isSea = seaSet.has(`${i}-${i + 1}`);
    if (isSea) {
      hadSea = true;
      total += haversineKm(points[i], points[i + 1]);
      continue;
    }
    const km = await directionsKm(points[i], points[i + 1]);
    if (km == null) {
      // Directions failed for this sub-pair — fall back to haversine for it.
      total += haversineKm(points[i], points[i + 1]);
    } else {
      total += km;
    }
    // Light pacing — Directions allows a generous QPS but no need to hammer.
    await new Promise((r) => setTimeout(r, 60));
  }
  return {
    fromCapitalId: fromId,
    toCapitalId: toId,
    km: total,
    source: hadSea ? 'directions+sea' : 'directions',
  };
}

async function main() {
  const outPath = resolve(__dirname, '..', 'src', 'data', 'segmentDistances.ts');
  const existing: Record<string, SegmentDistance> = {};
  if (!FORCE && existsSync(outPath)) {
    // Best-effort parse of previous run to skip already-computed segments.
    const txt = readFileSync(outPath, 'utf8');
    const m = txt.match(/=\s*({[\s\S]*});/);
    if (m) {
      try {
        // eslint-disable-next-line @typescript-eslint/no-implied-eval, no-new-func
        const parsed = new Function(`return ${m[1]}`)() as Record<string, SegmentDistance>;
        Object.assign(existing, parsed);
      } catch {
        // ignore
      }
    }
  }

  const out: Record<string, SegmentDistance> = {};
  for (let i = 0; i < capitals.length; i++) {
    const from = capitals[i];
    const to = capitals[(i + 1) % capitals.length];
    const key = `${from.id}-${to.id}`;
    if (existing[key] && !FORCE) {
      out[key] = existing[key];
      continue;
    }
    process.stdout.write(`[${i + 1}/${capitals.length}] ${from.id}→${to.id} ... `);
    try {
      const d = await computeSegmentDistance(from.id, to.id);
      out[key] = d;
      console.log(`${d.km.toFixed(0)}km (${d.source})`);
    } catch (e) {
      console.warn(`failed: ${(e as Error).message}`);
      // Fallback: haversine straight line
      out[key] = {
        fromCapitalId: from.id,
        toCapitalId: to.id,
        km: haversineKm(from, to),
        source: 'haversine',
      };
    }
  }

  const banner = `// AUTO-GENERATED by scripts/precompute-distances.ts. Do not edit by hand.\n// Run: npx tsx scripts/precompute-distances.ts\n`;
  const body = `export interface SegmentDistance {\n  fromCapitalId: string;\n  toCapitalId: string;\n  km: number;\n  source: 'directions' | 'directions+sea' | 'haversine' | 'haversine+waypoints';\n}\n\nexport const segmentDistances: Record<string, SegmentDistance> = ${JSON.stringify(
    out,
    null,
    2,
  )};\n`;
  writeFileSync(outPath, banner + body);
  console.log(`\nWrote ${outPath} (${Object.keys(out).length} segments)`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
