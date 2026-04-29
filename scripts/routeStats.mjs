// Quick stats on the route
// Reimplements geo + generateRoute to avoid TS compilation
import { readFileSync } from 'node:fs';

const EARTH_RADIUS_KM = 6371;
const toRad = (d) => (d * Math.PI) / 180;
const haversine = (lat1, lng1, lat2, lng2) => {
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return EARTH_RADIUS_KM * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
};

// Parse capitals.ts using regex (simple but works for this format)
const text = readFileSync(new URL('../src/data/capitals.ts', import.meta.url), 'utf8');
const re = /\{\s*id:\s*'([^']+)',[^}]*?nameJa:\s*'([^']+)'[^}]*?countryJa:\s*'([^']+)'[^}]*?lat:\s*([-\d.]+)[^}]*?lng:\s*([-\d.]+)/g;

const capitals = [];
let m;
while ((m = re.exec(text)) !== null) {
  capitals.push({
    id: m[1], nameJa: m[2], countryJa: m[3],
    lat: parseFloat(m[4]), lng: parseFloat(m[5]),
  });
}

console.log('Parsed capitals:', capitals.length);

let total = 0;
let max = { km: 0, label: '' };
let totalSquares = 0;
const SQ = (km) => Math.max(5, Math.min(40, Math.round(km / 150)));

for (let i = 0; i < capitals.length; i++) {
  const a = capitals[i];
  const b = capitals[(i + 1) % capitals.length];
  const km = haversine(a.lat, a.lng, b.lat, b.lng);
  total += km;
  totalSquares += SQ(km);
  if (km > max.km) max = { km, label: `${a.nameJa} → ${b.nameJa}` };
}

console.log('Total distance:', Math.round(total).toLocaleString(), 'km');
console.log('Equator (4万km) ratio:', (total / 40075).toFixed(2), 'times');
console.log('Total squares:', totalSquares);
console.log('Avg km / square:', (total / totalSquares).toFixed(1), 'km');
console.log('Longest segment:', max.label, '=', Math.round(max.km).toLocaleString(), 'km');
