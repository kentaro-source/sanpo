import { routeData } from '../src/data/index';
import { cities } from '../src/data/cities';
import { segmentClassifications } from '../src/data/segmentMeta';
console.log(
  JSON.stringify({
    capitals: routeData.capitals.length,
    cities: cities.length,
    segments: routeData.segments.length,
    segClassified: segmentClassifications.length,
    totalKm: Math.round(routeData.totalDistanceKm),
    squares: routeData.totalSquares,
    cityDistancesResolved: Object.keys(routeData.cityDistances).length,
  }),
);
