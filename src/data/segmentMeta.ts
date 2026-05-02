import type { SegmentMeta } from '../types';

/**
 * Per-segment route classification + waypoint cities.
 * IDs reference capitals.ts (countryId 2 letters) or cities.ts (e.g., JP-OSAKA).
 *
 * After v3 reorder, Asia capitals order is:
 *   JP→KR→KP→CN→MN→PH→BN→ID→TL→SG→MY→TH→KH→VN→LA→MM→BD→BT→NP→IN→LK→MV→PK→AF→TJ→KG→KZ→UZ→TM→IR→...
 */
export interface SegmentClassification extends SegmentMeta {
  /** City IDs (in order) to route through. Capital IDs auto-included as endpoints. */
  waypointCityIds?: string[];
  /**
   * Index pairs of straight-line (sea/ferry) sub-segments within a 'mixed' route.
   * Indices reference the full point list: [origin, ...waypoints, destination].
   * Anything not listed here is rendered as a road-following sub-path via
   * Directions API. Only meaningful when routeType is 'mixed'.
   */
  seaSegments?: [number, number][];
}

export const segmentClassifications: SegmentClassification[] = [
  // ===== Batch 1+2: Asia 1-31 =====
  {
    fromCapitalId: 'JP',
    toCapitalId: 'KR',
    routeType: 'mixed',
    // Each consecutive pair stays under ~200km so Directions WALKING
    // mode succeeds (limit ~300km, safety margin). Walking actually
    // returns pedestrian-feasible streets instead of just expressway
    // car routes the user can't actually walk.
    waypointCityIds: [
      'JP-YOKOHAMA',    // ~28 km
      'JP-HAMAMATSU',   // ~210 km
      'JP-NAGOYA',      // ~80 km
      'JP-KYOTO',       // ~110 km
      'JP-OSAKA',       // ~40 km
      'JP-KOBE',        // ~28 km
      'JP-HIROSHIMA',   // ~270 km (driving fallback OK)
      'JP-KITAKYUSHU',  // ~180 km
      'JP-FUKUOKA',     // ~12 km
      'JP-KUMAMOTO',    // ~90 km
      'JP-MIYAZAKI',    // ~140 km (故郷)
      'JP-NAGASAKI',    // ~170 km
      // Nagasaki → Busan は対馬経由フェリー(SEA)
      'KR-BUSAN',       // SEA ~260 km
      'KR-DAEGU',       // ~80 km
      'KR-DAEJEON',     // ~130 km
      'KR-CHEONGJU',    // ~35 km
    ],
    // Indices into [origin=Tokyo, ...waypoints, dest=Seoul]:
    //   0=Tokyo,  1=Yokohama,  2=Hamamatsu,  3=Nagoya,  4=Kyoto,
    //   5=Osaka,  6=Kobe,      7=Hiroshima,  8=Kitakyushu, 9=Fukuoka,
    //   10=Kumamoto, 11=Miyazaki, 12=Nagasaki, 13=Busan, 14=Daegu,
    //   15=Daejeon, 16=Cheongju, 17=Seoul
    // Only Nagasaki→Busan (12→13) is the sea crossing.
    seaSegments: [[12, 13]],
    notes:
      '東京→横浜→浜松→名古屋→京都→大阪→神戸→広島→北九州→福岡→熊本→宮崎(故郷)→長崎→[対馬経由フェリー]→プサン→大邱→大田→清州→ソウル',
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
    waypointCityIds: [
      'RU-VLADIVOSTOK', // ~640 km (closed DPRK-Russia border, fallback straight)
      'RU-KHABAROVSK',  // ~600 km (driving in Russia)
      'CN-HARBIN',      // ~900 km (closed China-Russia border, fallback straight)
      'CN-SHENYANG',    // ~530 km (driving in China)
      'CN-DALIAN',      // ~360 km (driving)
      'CN-TIANJIN',     // ~720 km (Bohai SEA ferry)
    ],
    // [origin=Pyongyang, 1=Vladivostok, 2=Khabarovsk, 3=Harbin, 4=Shenyang,
    //  5=Dalian, 6=Tianjin, 7=Beijing]
    // 0→1 DPRK-RU border closed; 2→3 China-Russia border closed; 5→6 Bohai ferry.
    seaSegments: [[0, 1], [2, 3], [5, 6]],
    notes:
      '平壌→[国境]→ウラジオストク→ハバロフスク→[国境]→ハルビン→瀋陽→大連→[渤海フェリー]→天津→北京',
  },
  {
    fromCapitalId: 'CN',
    toCapitalId: 'MN',
    routeType: 'mixed',
    waypointCityIds: [
      'CN-DATONG',     // ~280 km from Beijing
      'CN-HOHHOT',     // ~260 km
      'CN-ERENHOT',    // ~440 km (driving in Inner Mongolia)
      'MN-SAINSHAND',  // ~210 km — crosses CN-MN border (closed for cars)
      // Sainshand → Ulaanbaatar ~440 km Mongolian highway
    ],
    // [origin=Beijing, 1=Datong, 2=Hohhot, 3=Erenhot, 4=Sainshand, 5=UB]
    // 3→4 is the China-Mongolia rail border; Directions for cars usually
    // refuses, fall back to straight. Everything else road-followable.
    seaSegments: [[3, 4]],
    notes: '北京→大同→フフホト→二連浩特→[国境]→サインシャンド→ウランバートル(全長 ~1,600km、トランスモンゴル鉄道沿い)',
  },
  // === User's preferred Pacific island chain (CN→Taiwan→PH) ===
  {
    fromCapitalId: 'MN',
    toCapitalId: 'PH',
    routeType: 'mixed',
    waypointCityIds: [
      'MN-SAINSHAND',  // ~370 km from UB (Mongolian highway)
      'CN-ERENHOT',    // ~140 km — MN-CN border (closed road)
      'CN-HOHHOT',     // ~310 km
      'CN-DATONG',     // ~165 km
      'CN-TAIYUAN',    // ~250 km
      'CN-XIAN',       // ~510 km
      'CN-ZHENGZHOU',  // ~470 km
      'CN-WUHAN',      // ~520 km
      'CN-NANJING',    // ~550 km
      'CN-SHANGHAI',   // ~290 km
      'CN-HANGZHOU',   // ~170 km
      'CN-FUZHOU',     // ~470 km
      'CN-XIAMEN',     // ~270 km
      'CN-SHENZHEN',   // ~530 km
      'CN-HONGKONG',   // ~30 km
      'MO-MACAU',      // ~60 km (HK-Macau bridge or ferry)
      'CN-ZHUHAI',     // ~10 km — closed Macau-mainland border
      'TW-TAIPEI',     // ~750 km — Taiwan Strait SEA
      'TW-TAICHUNG',   // ~140 km
      'TW-TAINAN',     // ~140 km
      'TW-KAOHSIUNG',  // ~40 km
      // Kaohsiung → Manila ~1,200 km Luzon Strait SEA
    ],
    // [origin=UB, 1=Sainshand, 2=Erenhot, 3=Hohhot, 4=Datong, 5=Taiyuan,
    //  6=Xi'an, 7=Zhengzhou, 8=Wuhan, 9=Nanjing, 10=Shanghai, 11=Hangzhou,
    //  12=Fuzhou, 13=Xiamen, 14=Shenzhen, 15=HK, 16=Macau, 17=Zhuhai,
    //  18=Taipei, 19=Taichung, 20=Tainan, 21=Kaohsiung, 22=Manila]
    seaSegments: [
      [1, 2],    // Sainshand→Erenhot — closed MN-CN border
      [16, 17],  // Macau→Zhuhai — closed SAR-mainland border
      [17, 18],  // Zhuhai→Taipei — Taiwan Strait
      [21, 22],  // Kaohsiung→Manila — Luzon Strait
    ],
    notes:
      'UB→[国境]→中国東岸縦断→[海峡]→台湾→[ルソン]→マニラ。22経由地、全長 ~6,500km。',
  },
  {
    fromCapitalId: 'PH',
    toCapitalId: 'BN',
    routeType: 'sea',
    // フィリピン群島南下 → ボルネオ北部。基本 SEA(直線)。
    waypointCityIds: ['PH-CEBU', 'PH-DAVAO'],
    notes: 'マニラ→セブ→ダバオ→スールー海→ボルネオ北部',
  },
  {
    fromCapitalId: 'BN',
    toCapitalId: 'ID',
    routeType: 'sea',
    notes: 'ボルネオ→ジャワ海→ジャカルタ(直線)',
  },
  {
    fromCapitalId: 'ID',
    toCapitalId: 'TL',
    routeType: 'mixed',
    waypointCityIds: [
      'ID-YOGYAKARTA', // ~430 km Java road
      'ID-SURABAYA',   // ~330 km
      'ID-BALI',       // ~330 km (ferry/bridge to Bali)
    ],
    // [origin=Jakarta, 1=Yogyakarta, 2=Surabaya, 3=Bali, 4=Dili]
    // 3→4 spans the Lesser Sunda Islands ~1,100 km of ferries/island hops.
    seaSegments: [[3, 4]],
    notes: 'ジャワ→バリ→[ヌサトゥンガラ列島]→東ティモール',
  },
  {
    fromCapitalId: 'TL',
    toCapitalId: 'SG',
    routeType: 'sea',
    notes: 'ジャワ海西進、ヌサトゥンガラ→マレー半島先端',
  },
  {
    fromCapitalId: 'SG',
    toCapitalId: 'MY',
    routeType: 'land',
    notes: 'ジョホール海峡→クアラルンプール',
  },
  // === Mainland SE Asia ===
  {
    fromCapitalId: 'MY',
    toCapitalId: 'TH',
    routeType: 'land',
    waypointCityIds: [
      'MY-MALACCA',     // ~150 km from KL
      'MY-PENANG',      // ~520 km
      'TH-HATYAI',      // ~190 km — crosses MY-TH border
      'TH-SURATTHANI',  // ~290 km
      'TH-HUAHIN',      // ~390 km
      // Hua Hin → Bangkok ~190 km
    ],
    notes: 'KL→マラッカ→ペナン→ハジャイ→スラート→ホアヒン→バンコク',
  },
  {
    fromCapitalId: 'TH',
    toCapitalId: 'KH',
    routeType: 'land',
    waypointCityIds: ['KH-SIEMREAP'],
    notes: 'バンコク→アンコールワット経由→プノンペン',
  },
  {
    fromCapitalId: 'KH',
    toCapitalId: 'VN',
    routeType: 'land',
    waypointCityIds: [
      'VN-HOCHIMINH', // ~210 km — crosses KH-VN border
      'VN-DANANG',    // ~830 km coastal Vietnam
      'VN-HOIAN',     // ~30 km (思い出)
      'VN-HUE',       // ~100 km
      'VN-VINH',      // ~370 km
      // Vinh → Hanoi ~290 km
    ],
    notes: 'プノンペン→ホーチミン→ベトナム海岸縦断→ハノイ',
  },
  {
    fromCapitalId: 'VN',
    toCapitalId: 'LA',
    routeType: 'land',
    // ハノイ→ヴィエンチャン直接 ~470 km、driving可能。HOIAN は南方なので外して KH→VN に移動済み。
    notes: 'ハノイ→[山岳]→ヴィエンチャン',
  },
  {
    fromCapitalId: 'LA',
    toCapitalId: 'MM',
    routeType: 'land',
    // ヴィエンチャン→ネピドー直接 ~700km、タイ・ミャンマー国境を含む。
    // 国境道路が機能しない場合 driving fallback で straight。
    notes: 'ヴィエンチャン→[タイ北部経由]→ネピドー',
  },
  {
    fromCapitalId: 'MM',
    toCapitalId: 'BD',
    routeType: 'mixed',
    waypointCityIds: [
      'MM-YANGON',  // ~340 km from Naypyidaw
      'MM-SITTWE',  // ~430 km Rakhine 海岸
      // Sittwe → Dhaka ~330 km Bay of Bengal SEA
    ],
    // [origin=Naypyidaw, 1=Yangon, 2=Sittwe, 3=Dhaka]
    seaSegments: [[2, 3]],
    notes: 'ネピドー→ヤンゴン→シットウェー→[ベンガル湾]→ダッカ',
  },
  // === South Asia ===
  {
    fromCapitalId: 'BD',
    toCapitalId: 'BT',
    routeType: 'land',
    waypointCityIds: [
      'IN-SILIGURI', // ~370 km — ヒマラヤ山麓の通過地、ブータン国境近郊
    ],
    notes: 'ダッカ→シリグリ(印)→ティンプー(ブータン)',
  },
  {
    fromCapitalId: 'BT',
    toCapitalId: 'NP',
    routeType: 'land',
    // Thimphu→Kathmandu 直接 ~430km、印北部経由。国境含むので driving fallback あり。
    notes: 'ティンプー→[インド北部回廊]→カトマンズ',
  },
  {
    fromCapitalId: 'NP',
    toCapitalId: 'IN',
    routeType: 'land',
    waypointCityIds: [
      'IN-VARANASI', // ~350 km — ガンジス聖地
      'IN-LUCKNOW',  // ~290 km
      'IN-AGRA',     // ~330 km
      // Agra → Delhi ~210 km
    ],
    notes: 'カトマンズ→バラナシ→ラクナウ→アーグラ→デリー',
  },
  {
    fromCapitalId: 'IN',
    toCapitalId: 'LK',
    routeType: 'mixed',
    waypointCityIds: [
      'IN-AGRA',      // (already passed in NP→IN but route loops here for sake of reaching south)
      'IN-MUMBAI',    // ~1,200 km (driving across India)
      'IN-HYDERABAD', // ~620 km
      'IN-BANGALORE', // ~570 km
      'IN-CHENNAI',   // ~350 km
      // Chennai → Colombo ~480 km Palk Strait SEA
    ],
    // [origin=Delhi, 1=Agra, 2=Mumbai, 3=Hyderabad, 4=Bangalore, 5=Chennai, 6=Colombo]
    seaSegments: [[5, 6]],
    notes: 'デリー→アーグラ→ムンバイ→ハイデラバード→バンガロール→チェンナイ→[ポーク海峡]→コロンボ',
  },
  {
    fromCapitalId: 'LK',
    toCapitalId: 'MV',
    routeType: 'sea',
    notes: 'インド洋',
  },
  {
    fromCapitalId: 'MV',
    toCapitalId: 'PK',
    routeType: 'mixed',
    notes: 'アラビア海→カラチ→ラホール→イスラマバード',
  },
  // === Central Asia ===
  {
    fromCapitalId: 'PK',
    toCapitalId: 'AF',
    routeType: 'land',
    notes: 'ペシャワール経由',
  },
  {
    fromCapitalId: 'AF',
    toCapitalId: 'TJ',
    routeType: 'land',
  },
  {
    fromCapitalId: 'TJ',
    toCapitalId: 'KG',
    routeType: 'land',
  },
  {
    fromCapitalId: 'KG',
    toCapitalId: 'KZ',
    routeType: 'land',
    waypointCityIds: ['KZ-ALMATY'],
    notes: 'ビシュケク→アルマトイ→アスタナ',
  },
  {
    fromCapitalId: 'KZ',
    toCapitalId: 'UZ',
    routeType: 'land',
  },
  {
    fromCapitalId: 'UZ',
    toCapitalId: 'TM',
    routeType: 'land',
    notes: 'サマルカンド→ブハラ',
  },
  // === Middle East ===
  {
    fromCapitalId: 'TM',
    toCapitalId: 'IR',
    routeType: 'land',
    notes: '隣接、自然な国境越え',
  },
  {
    fromCapitalId: 'IR',
    toCapitalId: 'IQ',
    routeType: 'land',
    notes: 'テヘラン→バグダード',
  },
  {
    fromCapitalId: 'IQ',
    toCapitalId: 'KW',
    routeType: 'land',
    notes: 'バスラ経由',
  },
  // ===== Batch 3: Middle East second half (32-46) =====
  {
    fromCapitalId: 'KW',
    toCapitalId: 'BH',
    routeType: 'sea',
    notes: 'ペルシャ湾',
  },
  {
    fromCapitalId: 'BH',
    toCapitalId: 'QA',
    routeType: 'mixed',
    notes: 'キングファハドコーズウェイ→ドーハ',
  },
  {
    fromCapitalId: 'QA',
    toCapitalId: 'AE',
    routeType: 'land',
    notes: 'ドーハ→ドバイ→アブダビ',
  },
  {
    fromCapitalId: 'AE',
    toCapitalId: 'OM',
    routeType: 'land',
    notes: 'アラブ首長国→オマーン',
  },
  {
    fromCapitalId: 'OM',
    toCapitalId: 'YE',
    routeType: 'land',
    notes: 'アラビア半島南部',
  },
  {
    fromCapitalId: 'YE',
    toCapitalId: 'SA',
    routeType: 'land',
    notes: 'サナア→メッカ→リヤド',
  },
  {
    fromCapitalId: 'SA',
    toCapitalId: 'JO',
    routeType: 'land',
  },
  {
    fromCapitalId: 'JO',
    toCapitalId: 'IL',
    routeType: 'land',
    notes: 'エルサレム経由',
  },
  {
    fromCapitalId: 'IL',
    toCapitalId: 'LB',
    routeType: 'land',
  },
  {
    fromCapitalId: 'LB',
    toCapitalId: 'SY',
    routeType: 'land',
  },
  {
    fromCapitalId: 'SY',
    toCapitalId: 'TR',
    routeType: 'land',
  },
  {
    fromCapitalId: 'TR',
    toCapitalId: 'CY',
    routeType: 'sea',
    notes: '地中海フェリー',
  },
  {
    fromCapitalId: 'CY',
    toCapitalId: 'GE',
    routeType: 'mixed',
    notes: '地中海→トルコ東岸→黒海→トビリシ',
  },
  {
    fromCapitalId: 'GE',
    toCapitalId: 'AM',
    routeType: 'land',
  },
  {
    fromCapitalId: 'AM',
    toCapitalId: 'AZ',
    routeType: 'land',
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
