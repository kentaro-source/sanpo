import type { SegmentMeta } from '../types';

/**
 * Per-segment route classification + waypoint cities.
 * IDs reference capitals.ts (countryId 2 letters) or cities.ts (e.g., JP-OSAKA).
 *
 * Status: Batch 1 (segments 1-15: Asia first half) classified.
 * Remaining segments fall back to default great-circle interpolation.
 */
export interface SegmentClassification extends SegmentMeta {
  /** City IDs (in order) to route through. Capital IDs auto-included as endpoints. */
  waypointCityIds?: string[];
}

export const segmentClassifications: SegmentClassification[] = [
  // ===== Batch 1: Asia 1-15 =====
  {
    fromCapitalId: 'JP',
    toCapitalId: 'KR',
    routeType: 'mixed',
    waypointCityIds: [
      'JP-NAGOYA',
      'JP-OSAKA',
      'JP-KOBE',
      // 広島は cities.ts未収載
      'JP-MIYAZAKI',
      'JP-NAGASAKI',
      'JP-FUKUOKA',
      // [関釜フェリー]
      'KR-BUSAN',
      'KR-CHEONGJU',
    ],
    notes: '関釜フェリー経由。九州南端まで南下→西回り長崎→福岡から海路',
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
    routeType: 'land',
    waypointCityIds: ['RU-VLADIVOSTOK', 'RU-KHABAROVSK', 'CN-DALIAN'],
    notes: '北東アジア大回り。シベリア鉄道沿いに北上→満州横断→大連→北京',
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
  {
    fromCapitalId: 'MM',
    toCapitalId: 'BD',
    routeType: 'land',
    waypointCityIds: ['MM-YANGON'],
  },
  {
    fromCapitalId: 'BD',
    toCapitalId: 'BT',
    routeType: 'land',
    waypointCityIds: ['IN-KOLKATA'],
    notes: 'コルカタ南へ寄り道→ブータンへ北上',
  },
  {
    fromCapitalId: 'BT',
    toCapitalId: 'NP',
    routeType: 'land',
  },
  {
    fromCapitalId: 'NP',
    toCapitalId: 'IN',
    routeType: 'land',
  },
  {
    fromCapitalId: 'IN',
    toCapitalId: 'LK',
    routeType: 'mixed',
    waypointCityIds: ['IN-MUMBAI', 'IN-CHENNAI'],
    notes: 'ポーク海峡フェリー',
  },
  {
    fromCapitalId: 'LK',
    toCapitalId: 'MV',
    routeType: 'sea',
    notes: 'インド洋',
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
