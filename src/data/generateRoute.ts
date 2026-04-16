import type { Capital, RouteData, Segment, Square } from '../types';
import { haversineDistance, interpolate } from '../utils/geo';

function calculateSquareCount(distanceKm: number): number {
  // 150km = 1マス, 最小5マス, 最大40マス → 合計約3,000マス
  return Math.max(5, Math.min(40, Math.round(distanceKm / 150)));
}

export function generateRoute(capitals: Capital[]): RouteData {
  const segments: Segment[] = [];
  const squares: Square[] = [];
  let squareIndex = 0;
  let totalDistanceKm = 0;

  for (let i = 0; i < capitals.length; i++) {
    const from = capitals[i];
    const to = capitals[(i + 1) % capitals.length]; // last connects back to first
    const distanceKm = haversineDistance(from.lat, from.lng, to.lat, to.lng);
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

    // Intermediate squares (interpolated along great circle)
    for (let j = 1; j < squareCount; j++) {
      const fraction = j / squareCount;
      const [lat, lng] = interpolate(from.lat, from.lng, to.lat, to.lng, fraction);
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
