import type { Capital, RouteData, Segment, Square } from '../types';
import { haversineDistance, interpolate } from '../utils/geo';
import { cities } from './cities';
import { segmentClassifications } from './segmentMeta';
import { segmentDistances } from './segmentDistances';

function calculateSquareCount(distanceKm: number): number {
  // 150km = 1マス, 最小5マス, 最大40マス → 合計約3,000マス
  return Math.max(5, Math.min(40, Math.round(distanceKm / 150)));
}

/** Sum great-circle distances along origin → waypoints → destination. */
function pathDistanceKm(
  origin: { lat: number; lng: number },
  destination: { lat: number; lng: number },
  waypoints: { lat: number; lng: number }[],
): number {
  const points = [origin, ...waypoints, destination];
  let total = 0;
  for (let i = 0; i < points.length - 1; i++) {
    total += haversineDistance(
      points[i].lat,
      points[i].lng,
      points[i + 1].lat,
      points[i + 1].lng,
    );
  }
  return total;
}

/** Interpolate a position at fractional distance along a multi-point path. */
function interpolateAlongPath(
  points: { lat: number; lng: number }[],
  fraction: number,
): [number, number] {
  if (points.length === 1) return [points[0].lat, points[0].lng];
  const distances: number[] = [];
  let total = 0;
  for (let i = 0; i < points.length - 1; i++) {
    const d = haversineDistance(
      points[i].lat,
      points[i].lng,
      points[i + 1].lat,
      points[i + 1].lng,
    );
    distances.push(d);
    total += d;
  }
  if (total === 0) return [points[0].lat, points[0].lng];

  let remaining = fraction * total;
  for (let i = 0; i < distances.length; i++) {
    if (remaining <= distances[i] || i === distances.length - 1) {
      const f = distances[i] === 0 ? 0 : remaining / distances[i];
      return interpolate(
        points[i].lat,
        points[i].lng,
        points[i + 1].lat,
        points[i + 1].lng,
        Math.min(1, f),
      );
    }
    remaining -= distances[i];
  }
  const last = points[points.length - 1];
  return [last.lat, last.lng];
}

export function generateRoute(capitals: Capital[]): RouteData {
  const segments: Segment[] = [];
  const squares: Square[] = [];
  const capitalDistances: Record<string, number> = {};
  const cityDistances: Record<string, number> = {};
  let squareIndex = 0;
  let totalDistanceKm = 0;

  for (let i = 0; i < capitals.length; i++) {
    const from = capitals[i];
    const to = capitals[(i + 1) % capitals.length]; // last connects back to first

    // Use waypoint-aware path length when the segment has classified waypoints,
    // so a route like Tokyo→宮崎→長崎→福岡→Busan→Seoul gets the right square
    // count instead of the misleading direct Tokyo–Seoul straight line.
    const seg = segmentClassifications.find(
      (s) => s.fromCapitalId === from.id && s.toCapitalId === to.id,
    );
    const waypointPoints = (seg?.waypointCityIds ?? [])
      .map((cid) => cities.find((c) => c.id === cid))
      .filter((c): c is NonNullable<typeof c> => !!c)
      .map((c) => ({ lat: c.lat, lng: c.lng }));

    // Prefer the precomputed real-road distance (Directions API) if we have
    // it — that's what makes "Tokyo→宮崎→長崎→福岡→Seoul" a properly long
    // multi-day chunk instead of a misleadingly short straight line.
    // Until precompute populates the table, scale up land/mixed great-circle
    // by 1.4× to approximate road overhead (still rough, but closer than
    // raw straight lines and gives waypoint cities room to breathe).
    const precomputedKm = segmentDistances[`${from.id}-${to.id}`]?.km;
    const isRoadHeavy =
      seg?.routeType === 'land' || seg?.routeType === 'mixed';
    const roadFactor = isRoadHeavy && !precomputedKm ? 1.4 : 1.0;
    const baseDistanceKm = precomputedKm
      ?? (waypointPoints.length > 0
        ? pathDistanceKm(from, to, waypointPoints)
        : haversineDistance(from.lat, from.lng, to.lat, to.lng));
    const distanceKm = baseDistanceKm * roadFactor;
    const squareCount = calculateSquareCount(distanceKm);

    totalDistanceKm += distanceKm;

    const segment: Segment = {
      fromCapitalId: from.id,
      toCapitalId: to.id,
      distanceKm,
      squareCount,
      startSquareIndex: squareIndex,
    };
    segments.push(segment);

    const segmentStartKm = totalDistanceKm - distanceKm;
    const kmPerSquare = distanceKm / squareCount;

    // First square is the capital itself
    squares.push({
      index: squareIndex,
      lat: from.lat,
      lng: from.lng,
      segmentIndex: i,
      localIndex: 0,
      isCapital: true,
      capitalId: from.id,
      cumulativeKm: segmentStartKm,
    });
    capitalDistances[from.id] = segmentStartKm;
    squareIndex++;

    // Compute the path-fractional position of each waypoint city, then mark
    // the closest square index for that segment. Used to surface "next stop"
    // info and (later) drive city-visit bonus.
    const fullPath = [from, ...waypointPoints, to];
    const segLengths: number[] = [];
    let pathTotal = 0;
    for (let k = 0; k < fullPath.length - 1; k++) {
      const d = haversineDistance(
        fullPath[k].lat,
        fullPath[k].lng,
        fullPath[k + 1].lat,
        fullPath[k + 1].lng,
      );
      segLengths.push(d);
      pathTotal += d;
    }
    // For each waypoint city, fractional distance along the path = sum of
    // leg lengths up to and including that waypoint divided by total.
    const wpCityIds = seg?.waypointCityIds ?? [];
    const cityFractions = new Map<number, string>(); // localIndex → cityId
    if (pathTotal > 0 && wpCityIds.length === waypointPoints.length) {
      let acc = 0;
      for (let k = 0; k < wpCityIds.length; k++) {
        acc += segLengths[k]; // origin → waypoint k (waypoint k is fullPath[k+1])
        const f = acc / pathTotal;
        // Map fractional position to the nearest intermediate square
        // (localIndex 1..squareCount-1). j/squareCount is its fraction.
        const localIdx = Math.max(
          1,
          Math.min(squareCount - 1, Math.round(f * squareCount)),
        );
        // If two waypoints would land on the same square (very dense),
        // bump the second one forward to keep them distinct.
        let chosen = localIdx;
        while (cityFractions.has(chosen) && chosen < squareCount - 1) chosen++;
        cityFractions.set(chosen, wpCityIds[k]);
      }
    }

    // Intermediate squares: interpolate along the full waypoint path so
    // squares follow the visible polyline rather than a Tokyo–Seoul straight line.
    for (let j = 1; j < squareCount; j++) {
      const fraction = j / squareCount;
      const [lat, lng] = interpolateAlongPath(fullPath, fraction);
      const cityId = cityFractions.get(j);
      const cumulativeKm = segmentStartKm + j * kmPerSquare;
      squares.push({
        index: squareIndex,
        lat,
        lng,
        segmentIndex: i,
        localIndex: j,
        isCapital: false,
        cityId,
        cumulativeKm,
      });
      if (cityId) cityDistances[cityId] = cumulativeKm;
      squareIndex++;
    }
  }

  return {
    capitals,
    segments,
    squares,
    totalSquares: squares.length,
    totalDistanceKm,
    capitalDistances,
    cityDistances,
  };
}

/**
 * Interpolate a {lat, lng} position at a given km along the route.
 * Used by MapView to place the player marker continuously.
 */
export function positionAtKm(
  route: RouteData,
  km: number,
): { lat: number; lng: number } {
  const total = route.totalDistanceKm;
  if (total <= 0) return { lat: route.squares[0].lat, lng: route.squares[0].lng };
  // Wrap around for laps.
  let target = km % total;
  if (target < 0) target += total;

  const squares = route.squares;
  // Binary search for the square whose cumulativeKm is just <= target.
  let lo = 0;
  let hi = squares.length - 1;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (squares[mid].cumulativeKm <= target) lo = mid;
    else hi = mid - 1;
  }
  const a = squares[lo];
  const b = squares[lo + 1] ?? squares[0];
  const segLenKm = (b.cumulativeKm > a.cumulativeKm
    ? b.cumulativeKm
    : total) - a.cumulativeKm;
  const f = segLenKm > 0 ? (target - a.cumulativeKm) / segLenKm : 0;
  return {
    lat: a.lat + (b.lat - a.lat) * f,
    lng: a.lng + (b.lng - a.lng) * f,
  };
}

/** Find the square index containing (or just before) a given km. */
export function squareIndexAtKm(route: RouteData, km: number): number {
  const total = route.totalDistanceKm;
  let target = km % total;
  if (target < 0) target += total;
  const squares = route.squares;
  let lo = 0;
  let hi = squares.length - 1;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (squares[mid].cumulativeKm <= target) lo = mid;
    else hi = mid - 1;
  }
  return lo;
}
