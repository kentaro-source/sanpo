import { capitals } from '../src/data/capitals';
import { generateRoute } from '../src/data/generateRoute';
import { cities } from '../src/data/cities';

const route = generateRoute(capitals);
const seg0 = route.segments[0];
console.log('Segment 0:', seg0);
console.log('---');
for (let i = 0; i <= seg0.squareCount + 1; i++) {
  const sq = route.squares[i];
  if (!sq) break;
  const labels: string[] = [];
  if (sq.isCapital && sq.capitalId) {
    const cap = capitals.find((c) => c.id === sq.capitalId);
    labels.push(`🏛 ${cap?.nameJa}`);
  }
  if (sq.cityId) {
    const city = cities.find((c) => c.id === sq.cityId);
    labels.push(`📍 ${city?.nameJa}`);
  }
  console.log(`  ${i}: ${labels.join(' ') || '·'}`);
}
