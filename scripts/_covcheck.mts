import { readdirSync, existsSync } from 'node:fs';
import { segmentClassifications } from '../src/data/segmentMeta';
import { cities } from '../src/data/cities';
import { routeData } from '../src/data/index';
import { chunkRanges, seaSetFor } from '../src/services/routeChunks';

const dir = 'public/route-geometry';
const have = new Set(
  existsSync(dir)
    ? readdirSync(dir).filter((f) => f.endsWith('.json')).map((f) => f.replace(/\.json$/, ''))
    : [],
);

const missing: string[] = [];
const allSeaNoFileNeeded: string[] = [];
let needFile = 0;

for (const seg of segmentClassifications) {
  const key = `${seg.fromCapitalId}-${seg.toCapitalId}`;
  if (seg.routeType !== 'land' && seg.routeType !== 'mixed') continue;

  const fromCap = routeData.capitals.find((c) => c.id === seg.fromCapitalId);
  const toCap = routeData.capitals.find((c) => c.id === seg.toCapitalId);
  if (!fromCap || !toCap) continue;
  let n = 2;
  for (const cid of seg.waypointCityIds ?? []) {
    if (cities.find((c) => c.id === cid)) n += 1;
  }
  // A file is only required when the segment has at least one ROAD chunk.
  const roadChunks = chunkRanges(n, seaSetFor(seg)).filter((r) => r.kind === 'road');
  if (roadChunks.length === 0) {
    allSeaNoFileNeeded.push(key);
    continue;
  }
  needFile += 1;
  if (!have.has(key)) missing.push(key);
}

console.log(
  JSON.stringify(
    {
      segmentsNeedingAFile: needFile,
      generated: have.size,
      allSeaSegmentsNeedingNothing: allSeaNoFileNeeded.length,
      missing,
      coverageComplete: missing.length === 0,
    },
    null,
    2,
  ),
);
