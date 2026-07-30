/**
 * Only the field this module needs. Kept structural rather than importing
 * SegmentClassification so the offline generator can pass a plain object.
 */
interface HasSeaSegments {
  seaSegments?: [number, number][];
}

/**
 * How a segment's stop list is split into Directions requests.
 *
 * Extracted from MapView so the offline geometry generator produces the
 * EXACT same chunk boundaries — and therefore the exact same Directions
 * cache keys — as the runtime. If the two ever diverged, every generated
 * entry would miss at runtime and the app would silently fall back to
 * live API calls (the thing the generator exists to avoid).
 */
export interface ChunkRange {
  /** 'sea' = drawn straight (or via a manual leg path); 'road' = Directions. */
  kind: 'sea' | 'road';
  /** Index of the first stop in `points`. */
  i: number;
  /** Index of the last stop in `points` (sea legs are always i+1). */
  j: number;
}

/**
 * The Directions API caps a request at ~25 stops, so a road run is at most
 * 24 legs (origin + 23 intermediate waypoints + destination).
 */
export const MAX_LEGS_PER_CHUNK = 24;

/** `seaSegments` as a lookup set of "i-j" keys. */
export function seaSetFor(seg: HasSeaSegments): Set<string> {
  return new Set(
    (seg.seaSegments ?? []).map(([a, b]: [number, number]) => `${a}-${b}`),
  );
}

/**
 * Split `pointCount` stops into consecutive ranges: every sea leg is its
 * own range, and runs of land legs are grouped up to MAX_LEGS_PER_CHUNK.
 */
export function chunkRanges(
  pointCount: number,
  seaSet: Set<string>,
  maxLegs: number = MAX_LEGS_PER_CHUNK,
): ChunkRange[] {
  const out: ChunkRange[] = [];
  let i = 0;
  while (i < pointCount - 1) {
    if (seaSet.has(`${i}-${i + 1}`)) {
      out.push({ kind: 'sea', i, j: i + 1 });
      i += 1;
      continue;
    }
    let j = i;
    while (j < pointCount - 1 && !seaSet.has(`${j}-${j + 1}`) && j - i < maxLegs) {
      j += 1;
    }
    out.push({ kind: 'road', i, j });
    i = j;
  }
  return out;
}
