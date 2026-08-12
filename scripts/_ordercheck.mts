/**
 * Route ordering verification.
 *
 * Checks that every stop's km increases along the intended path. A stop whose
 * km lands out of order shows up in the app as "next: X, then Y" with Y
 * physically before X.
 *
 * Also flags cities referenced as a waypoint by more than one segment:
 * cityDistances is a single id→km map, so the last assignment wins and the
 * other segment's ordering silently breaks.
 */
import { routeData } from '../src/data/index';
import { cities } from '../src/data/cities';
import { segmentClassifications } from '../src/data/segmentMeta';

const problems: string[] = [];

// 1. Cities used as a waypoint in more than one segment.
const usedBy = new Map<string, string[]>();
for (const seg of segmentClassifications) {
  for (const cid of seg.waypointCityIds ?? []) {
    const key = `${seg.fromCapitalId}-${seg.toCapitalId}`;
    usedBy.set(cid, [...(usedBy.get(cid) ?? []), key]);
  }
}
const dupes = [...usedBy.entries()].filter(([, segs]) => segs.length > 1);
if (dupes.length) {
  problems.push('■ 複数セグメントで参照されている都市 (km が上書きされる):');
  for (const [cid, segs] of dupes) {
    const c = cities.find((x) => x.id === cid);
    problems.push(`   ${cid} (${c?.nameJa ?? '?'}) ← ${segs.join(' , ')}`);
  }
}

// 2. Per-segment monotonicity: capital(from) < waypoints… < capital(to).
for (const seg of segmentClassifications) {
  const key = `${seg.fromCapitalId}-${seg.toCapitalId}`;
  const fromKm = routeData.capitalDistances[seg.fromCapitalId];
  const toKm = routeData.capitalDistances[seg.toCapitalId];
  if (fromKm == null || toKm == null) continue;

  const chain: { name: string; km: number }[] = [
    { name: `🏛${seg.fromCapitalId}`, km: fromKm },
  ];
  for (const cid of seg.waypointCityIds ?? []) {
    const km = routeData.cityDistances[cid];
    const c = cities.find((x) => x.id === cid);
    if (km == null) {
      problems.push(`■ ${key}: waypoint ${cid} の km が未解決`);
      continue;
    }
    chain.push({ name: c?.nameJa ?? cid, km });
  }
  // The last segment wraps back to the first capital (km 0) — skip its end.
  const isWrap = toKm < fromKm;
  if (!isWrap) chain.push({ name: `🏛${seg.toCapitalId}`, km: toKm });

  for (let i = 0; i < chain.length - 1; i++) {
    if (chain[i + 1].km < chain[i].km) {
      problems.push(
        `■ ${key}: 順序が逆 — ${chain[i].name}(${Math.round(chain[i].km)}km) の次が ${chain[i + 1].name}(${Math.round(chain[i + 1].km)}km)`,
      );
    }
  }
}

// 3. seaSegments index sanity. The pairs are indices into
//    [origin, ...waypoints, destination]. Densifying a segment shifts every
//    index, and stale pairs silently draw a LAND leg as a straight sea line
//    (found in MM→BD and IN→LK). Flag out-of-range pairs, and short legs
//    marked as sea (a real sea leg is rarely < 60 km).
import { haversineDistance } from '../src/utils/geo';
for (const seg of segmentClassifications) {
  const key = `${seg.fromCapitalId}-${seg.toCapitalId}`;
  const pairs = seg.seaSegments ?? [];
  if (pairs.length === 0) continue;
  const fromCap = routeData.capitals.find((c) => c.id === seg.fromCapitalId);
  const toCap = routeData.capitals.find((c) => c.id === seg.toCapitalId);
  if (!fromCap || !toCap) continue;
  const pts: { name: string; lat: number; lng: number }[] = [
    { name: seg.fromCapitalId, lat: fromCap.lat, lng: fromCap.lng },
  ];
  for (const cid of seg.waypointCityIds ?? []) {
    const c = cities.find((x) => x.id === cid);
    if (c) pts.push({ name: c.nameJa, lat: c.lat, lng: c.lng });
  }
  pts.push({ name: seg.toCapitalId, lat: toCap.lat, lng: toCap.lng });

  for (const [a, b] of pairs) {
    if (a < 0 || b >= pts.length || b !== a + 1) {
      problems.push(`■ ${key}: seaSegments [${a},${b}] が範囲外/不正 (地点数 ${pts.length})`);
      continue;
    }
    const d = haversineDistance(pts[a].lat, pts[a].lng, pts[b].lat, pts[b].lng);
    if (d < 60) {
      problems.push(
        `■ ${key}: seaSegments [${a},${b}] = ${pts[a].name}→${pts[b].name} が ${Math.round(d)}km — 陸路を海として直線描画している疑い`,
      );
    }
  }
}

console.log(problems.length ? problems.join('\n') : '順序の問題は検出されませんでした');
console.log(`\n(検査: ${segmentClassifications.length} セグメント / 重複参照都市 ${dupes.length} 件)`);
