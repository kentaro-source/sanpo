// One-off analysis: compute haversine leg distances for every African segment.
import { readFileSync } from 'node:fs';

const citiesSrc = readFileSync('src/data/cities.ts', 'utf8');
const capitalsSrc = readFileSync('src/data/capitals.ts', 'utf8');
const segSrc = readFileSync('src/data/segmentMeta.ts', 'utf8');

// crude object parser: find { id: 'X', ... lat: N, lng: M, ... }
function parseCoords(src) {
  const map = new Map();
  const re = /id:\s*'([^']+)'[\s\S]*?lat:\s*(-?[\d.]+)[\s\S]*?lng:\s*(-?[\d.]+)/g;
  let m;
  while ((m = re.exec(src))) {
    // Guard: only accept if the matched window is short (one object)
    if (m[0].length < 600) map.set(m[1], [parseFloat(m[2]), parseFloat(m[3])]);
  }
  return map;
}

const coords = new Map([...parseCoords(capitalsSrc), ...parseCoords(citiesSrc)]);

function hav(a, b) {
  const R = 6371;
  const toR = (d) => (d * Math.PI) / 180;
  const dLat = toR(b[0] - a[0]);
  const dLng = toR(b[1] - a[1]);
  const lat1 = toR(a[0]);
  const lat2 = toR(b[0]);
  const x =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(x));
}

// Parse segment blocks. We only need from/to/routeType/seaSegments/waypointCityIds.
// Split on "{" entries inside the array, naive but works for this file.
const AFRICA = new Set([
  'EG','LY','TN','DZ','MA','MR','ML','NE','TD','SD','SS','ER','DJ','ET','SO',
  'KE','UG','RW','BI','TZ','KM','MG','MU','SC','MZ','MW','ZM','ZW','BW','NA',
  'ZA','SZ','LS','AO','CD','CG','GA','GQ','CM','CF','NG','BJ','TG','GH','CI',
  'BF','LR','SL','GN','GW','GM','SN','CV','ST',
]);

// Extract each segment object literal
const segBlocks = [];
const blockRe = /\{\s*fromCapitalId:\s*'([A-Z]{2})',\s*toCapitalId:\s*'([A-Z]{2})',([\s\S]*?)\n  \},/g;
let bm;
while ((bm = blockRe.exec(segSrc))) {
  const from = bm[1];
  const to = bm[2];
  const body = bm[3];
  const routeType = (body.match(/routeType:\s*'([^']+)'/) || [])[1] || 'land';
  const wpMatch = body.match(/waypointCityIds:\s*\[([\s\S]*?)\]/);
  const waypoints = wpMatch
    ? [...wpMatch[1].matchAll(/'([^']+)'/g)].map((x) => x[1])
    : [];
  const seaMatch = body.match(/seaSegments:\s*\[([\s\S]*?)\],/);
  const seaPairs = [];
  if (seaMatch) {
    const pr = /\[(\d+),\s*(\d+)\]/g;
    let pm;
    while ((pm = pr.exec(seaMatch[1]))) seaPairs.push([+pm[1], +pm[2]]);
  }
  segBlocks.push({ from, to, routeType, waypoints, seaPairs });
}

const isSea = (seg, i) =>
  seg.routeType === 'sea' || seg.seaPairs.some(([a, b]) => a === i && b === i + 1);

let totalAfrican = 0;
for (const seg of segBlocks) {
  if (!AFRICA.has(seg.from) && !AFRICA.has(seg.to)) continue;
  // Only African-internal: both endpoints African (EG..ST). The ST->RU and
  // AZ->EG jumps touch Africa but are mixed/fantasy; skip per scope (handled
  // as sea anyway).
  totalAfrican++;
  const chain = [seg.from, ...seg.waypoints, seg.to];
  const missing = chain.filter((id) => !coords.has(id));
  const longLegs = [];
  for (let i = 0; i < chain.length - 1; i++) {
    const a = coords.get(chain[i]);
    const b = coords.get(chain[i + 1]);
    if (!a || !b) {
      longLegs.push(`  [${i}] ${chain[i]}->${chain[i + 1]}  MISSING COORDS`);
      continue;
    }
    const d = hav(a, b);
    const sea = isSea(seg, i);
    if (d > 220 && !sea) {
      longLegs.push(`  [${i}] ${chain[i]} -> ${chain[i + 1]}  = ${d.toFixed(0)} km${sea ? ' (SEA)' : ''}`);
    }
  }
  if (longLegs.length || missing.length) {
    console.log(`\n### ${seg.from} -> ${seg.to}  (${seg.routeType})  chain=${chain.length}`);
    if (missing.length) console.log('  MISSING:', missing.join(', '));
    longLegs.forEach((l) => console.log(l));
  }
}
console.log(`\nTotal African segments scanned: ${totalAfrican}`);
