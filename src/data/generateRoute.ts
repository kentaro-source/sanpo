import type { Capital, RouteData, Segment, Square } from '../types';
import { haversineDistance, interpolate } from '../utils/geo';
import { cities } from './cities';
import { segmentClassifications } from './segmentMeta';

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

    const distanceKm =
      waypointPoints.length > 0
        ? pathDistanceKm(from, to, waypointPoints)
        : haversineDistance(from.lat, from.lng, to.lat, to.lng);
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

    // First square is the capital itself
    squares.push({
      index: squareIndex,
      lat: from.lat,
      lng: from.lng,
      segmentIndex: i,
      localIndex: 0,
      isCapital: true,
      capitalId: from.id,
    });
    squareIndex++;

    // Intermediate squares: interpolate along the full waypoint path so
    // squares follow the visible polyline rather than a Tokyo–Seoul straight line.
    const fullPath = [from, ...waypointPoints, to];
    for (let j = 1; j < squareCount; j++) {
      const fraction = j / squareCount;
      const [lat, lng] = interpolateAlongPath(fullPath, fraction);
      squares.push({
        index: squareIndex,
        lat,
        lng,
        segmentIndex: i,
        localIndex: j,
        isCapital: false,
      });
      squareIndex++;
    }
  }

  return {
    capitals,
    segments,
    squares,
    totalSquares: squares.length,
    totalDistanceKm,
  };
}
