import { routeData } from '../src/data/index';
import { cities } from '../src/data/cities';
import { segmentClassifications } from '../src/data/segmentMeta';
import { haversineDistance } from '../src/utils/geo';

const targets = [
  ['ID', 'TL'],
  ['TL', 'SG'],
  ['SG', 'MY'],
];

for (const [from, to] of targets) {
  const seg = segmentClassifications.find(
    (s) => s.fromCapitalId === from && s.toCapitalId === to,
  );
  if (!seg) continue;
  const fromCap = routeData.capitals.find((c) => c.id === from)!;
  const toCap = routeData.capitals.find((c) => c.id === to)!;
  const pts: { name: string; lat: number; lng: number }[] = [
    { name: fromCap.nameJa, lat: fromCap.lat, lng: fromCap.lng },
  ];
  for (const cid of seg.waypointCityIds ?? []) {
    const c = cities.find((x) => x.id === cid);
    if (c) pts.push({ name: c.nameJa, lat: c.lat, lng: c.lng });
  }
  pts.push({ name: toCap.nameJa, lat: toCap.lat, lng: toCap.lng });

  const seaSet = new Set((seg.seaSegments ?? []).map(([a, b]) => `${a}-${b}`));
  console.log(`\n=== ${from}→${to} (${seg.routeType}) 全${pts.length}地点 ===`);
  for (let i = 0; i < pts.length - 1; i++) {
    const d = haversineDistance(pts[i].lat, pts[i].lng, pts[i + 1].lat, pts[i + 1].lng);
    const sea = seaSet.has(`${i}-${i + 1}`);
    const flag = d > 500 ? ' ★遠い' : '';
    console.log(
      `  [${i}→${i + 1}] ${pts[i].name} → ${pts[i + 1].name}: ${Math.round(d)}km ${sea ? '(海/直線)' : '(陸路)'}${flag}`,
    );
  }
}
