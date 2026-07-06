import { readFileSync, writeFileSync } from 'node:fs';

const d = JSON.parse(readFileSync('scripts/_polys.json', 'utf8'));
const fmt = (arr) => arr.map(([la, ln]) => `[${la},${ln}]`).join(', ');

const ts = `/// <reference types="google.maps" />
/**
 * Manual road/bridge polylines for legs Google Directions refuses to route.
 *
 * The Hong Kong / Macau SAR border crossings all return ZERO_RESULTS from the
 * Directions API (verified live on-device, both DRIVING and WALKING) — Google
 * will not produce any route crossing into/out of HK or Macau, the same
 * limitation it has across the Korea peninsula. Without these the legs render
 * as ugly straight chords across the Pearl River estuary.
 *
 * Each polyline traces the REAL crossing: the on-land approaches are genuine
 * Google road polylines (fetched within each territory, where routing works),
 * spliced with the actual bridge geometry —
 *   深圳→香港   : 深圳湾公路大橋 (Shenzhen Bay Bridge)
 *   香港→マカオ : 港珠澳大橋 (HK–Zhuhai–Macau Bridge) + Macau internal roads
 *   マカオ→珠海 : 拱北口岸 (Gongbei) crossing
 *
 * Keyed by "olat,olng>dlat,dlng" rounded to 3dp (matching the city coords in
 * cities.ts). getManualLegPath also matches the reversed direction.
 */

type LL = google.maps.LatLngLiteral;

const PATHS: Record<string, [number, number][]> = {
  // 深圳 → 香港 (深圳湾公路大橋)
  '22.543,114.058>22.319,114.169': [${fmt(d.shenzhenHK)}],
  // 香港 → マカオ (港珠澳大橋 + マカオ市内)
  '22.319,114.169>22.199,113.544': [${fmt(d.hkMacau)}],
  // マカオ → 珠海 (拱北口岸)
  '22.199,113.544>22.271,113.577': [${fmt(d.macauZhuhai)}],
};

function keyFor(o: LL, d: LL): string {
  return \`\${o.lat.toFixed(3)},\${o.lng.toFixed(3)}>\${d.lat.toFixed(3)},\${d.lng.toFixed(3)}\`;
}

/**
 * Real-route polyline for a cross-border leg Google won't route, else null.
 * Matches either travel direction (reversed automatically).
 */
export function getManualLegPath(origin: LL, destination: LL): LL[] | null {
  const fwd = PATHS[keyFor(origin, destination)];
  if (fwd) return fwd.map(([lat, lng]) => ({ lat, lng }));
  const rev = PATHS[keyFor(destination, origin)];
  if (rev) return rev.map(([lat, lng]) => ({ lat, lng })).reverse();
  return null;
}
`;

writeFileSync('src/data/manualLegPaths.ts', ts);
console.log(
  'wrote src/data/manualLegPaths.ts',
  'szhk=' + d.shenzhenHK.length,
  'hkmo=' + d.hkMacau.length,
  'mozh=' + d.macauZhuhai.length,
);
