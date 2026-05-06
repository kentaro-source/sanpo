import { capitals } from '../src/data/capitals';
import { generateRoute } from '../src/data/generateRoute';

const route = generateRoute(capitals);
console.log('Total route distance (with waypoints + road factor):', Math.round(route.totalDistanceKm).toLocaleString(), 'km');
console.log('Total squares:', route.totalSquares);
console.log('Avg km / square:', (route.totalDistanceKm / route.totalSquares).toFixed(1), 'km');
console.log('Capitals:', route.capitals.length);
