import { capitals } from './capitals';
import { cities } from './cities';
import { generateRoute } from './generateRoute';
import { segmentClassifications, findSegmentClassification } from './segmentMeta';

export const routeData = generateRoute(capitals);
export { cities, segmentClassifications, findSegmentClassification };
