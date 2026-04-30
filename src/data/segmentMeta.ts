import type { SegmentMeta } from '../types';

/**
 * Per-segment route classification + waypoint cities.
 * IDs reference capitals.ts (countryId 2 letters) or cities.ts (e.g., JP-OSAKA).
 *
 * Status: Batch 1 (segments 1-15: Asia first half) classified.
 * Remaining segments fall back to default great-circle interpolation.
 *
 * Note: After capitals.ts reorder (v2), segment order is:
 *   JP→KR→KP→CN→MN→VN→LA→KH→TH→MM→MY→SG→ID→TL→PH→BN→BD→BT→NP→IN→LK→MV→PK→AF→TJ→KG→KZ→UZ→TM→IR→...
 */
export interface SegmentClassification extends SegmentMeta {
  /** City IDs (in order) to route through. Capital IDs auto-included as endpoints. */
  waypointCityIds?: string[];
}

export const segmentClassifications: SegmentClassification[] = [
  // ===== Batch 1: Asia 1-16 (after reorder) =====
  {
    fromCapitalId: 'JP',
    toCapitalId: 'KR',
    routeType: 'mixed',
    waypointCityIds: [
      'JP-MIYAZAKI', // 出発地（ホーム）
      'JP-NAGASAKI',
      'JP-FUKUOKA',
      // [関釜フェリー]
      'KR-BUSAN',
      'KR-CHEONGJU',
    ],
    notes: '宮崎発、九州西回り→関釜フェリー→韓国南部経由ソウル。関東関西は省略',
  },
  {
    fromCapitalId: 'KR',
    toCapitalId: 'KP',
    routeType: 'land',
    notes: '38度線越え（実際は不通）',
  },
  {
    fromCapitalId: 'KP',
    toCapitalId: 'CN',
    routeType: 'mixed',
    waypointCityIds: ['RU-VLADIVOSTOK', 'RU-KHABAROVSK', 'CN-DALIAN'],
    notes: '平壌→ロシア沿海→満州→大連→[渤海フェリー]→天津→北京',
  },
  {
    fromCapitalId: 'CN',
    toCapitalId: 'MN',
    routeType: 'land',
    notes: '北京→ウランバートル直行',
  },
  {
    fromCapitalId: 'MN',
    toCapitalId: 'VN',
    routeType: 'mixed',
    waypointCityIds: [
      'CN-XIAN',
      'CN-SHANGHAI',
      'CN-HONGKONG',
      'MO-MACAU',
      'CN-ZHUHAI',
      'TW-TAIPEI',
      'TW-TAICHUNG',
      'TW-TAINAN',
      'TW-KAOHSIUNG',
    ],
    notes: '中国東岸→珠海→台湾海峡→台湾縦断→南シナ海横断→ハノイ',
  },
  {
    fromCapitalId: 'VN',
    toCapitalId: 'LA',
    routeType: 'land',
    waypointCityIds: ['VN-HOIAN'],
  },
  {
    fromCapitalId: 'LA',
    toCapitalId: 'KH',
    routeType: 'land',
  },
  {
    fromCapitalId: 'KH',
    toCapitalId: 'TH',
    routeType: 'land',
    waypointCityIds: ['KH-SIEMREAP'],
  },
  {
    fromCapitalId: 'TH',
    toCapitalId: 'MM',
    routeType: 'land',
  },
  // === Maritime SE Asia (after MM, new positions) ===
  {
    fromCapitalId: 'MM',
    toCapitalId: 'MY',
    routeType: 'land',
    waypointCityIds: ['MM-YANGON'],
    notes: 'ミャンマー縦断→タイ南下→マレー半島',
  },
  {
    fromCapitalId: 'MY',
    toCapitalId: 'SG',
    routeType: 'land',
    waypointCityIds: ['MY-MALACCA'],
    notes: 'マラッカ経由でジョホール→シンガポール',
  },
  {
    fromCapitalId: 'SG',
    toCapitalId: 'ID',
    routeType: 'sea',
    notes: 'シンガポール→ジャワ海',
  },
  {
    fromCapitalId: 'ID',
    toCapitalId: 'TL',
    routeType: 'mixed',
    notes: 'バリ→ヌサトゥンガラ列島→東ティモール',
  },
  {
    fromCapitalId: 'TL',
    toCapitalId: 'PH',
    routeType: 'sea',
    notes: '東ティモール→セレベス海→マニラ',
  },
  {
    fromCapitalId: 'PH',
    toCapitalId: 'BN',
    routeType: 'sea',
    waypointCityIds: ['PH-CEBU'],
    notes: 'マニラ→セブ→スールー海→ボルネオ北部',
  },
  // === South Asia ===
  {
    fromCapitalId: 'BN',
    toCapitalId: 'BD',
    routeType: 'sea',
    notes: 'ボルネオ→マラッカ海峡→ベンガル湾→ダッカ',
  },
];

export function findSegmentClassification(
  fromCapitalId: string,
  toCapitalId: string,
): SegmentClassification | undefined {
  return segmentClassifications.find(
    (s) => s.fromCapitalId === fromCapitalId && s.toCapitalId === toCapitalId,
  );
}
