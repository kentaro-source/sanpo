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
      'JP-YOKOHAMA',     // ~28 km
      'JP-HAMAMATSU',    // ~210 km
      'JP-NAGOYA',       // ~80 km
      'JP-KYOTO',        // ~110 km
      'JP-OSAKA',        // ~40 km
      'JP-KOBE',         // ~28 km
      'JP-HIROSHIMA',    // ~270 km (driving fallback OK)
      'JP-YAMAGUCHI',    // ~135 km
      'JP-SHIMONOSEKI',  // ~50 km
      'JP-KITAKYUSHU',   // ~30 km (Kanmon strait)
      'JP-KUMAMOTO',     // ~150 km
      'JP-MIYAZAKI',     // ~140 km (故郷)
      'JP-NAGASAKI',     // ~170 km
      'JP-FUKUOKA',      // ~150 km — back north for the Hakata ferry
      // Fukuoka(博多港) → Busan via the Beetle / Camellia Line ferry
      'KR-BUSAN',        // SEA ~210 km
      'KR-DAEGU',        // ~80 km
      'KR-DAEJEON',      // ~130 km
      'KR-CHEONGJU',     // ~35 km
    ],
    // Indices into [origin=Tokyo, ...waypoints, dest=Seoul]:
    //   0=Tokyo,  1=Yokohama,  2=Hamamatsu,  3=Nagoya,  4=Kyoto,
    //   5=Osaka,  6=Kobe,      7=Hiroshima,  8=Kitakyushu, 9=Kumamoto,
    //   10=Miyazaki, 11=Nagasaki, 12=Fukuoka, 13=Busan, 14=Daegu,
    //   15=Daejeon, 16=Cheongju, 17=Seoul
    // Only Fukuoka→Busan (12→13) is the sea crossing (Hakata ferry).
    seaSegments: [[12, 13]],
    notes:
      '東京→横浜→浜松→名古屋→京都→大阪→神戸→広島→北九州→熊本→宮崎(故郷)→長崎→福岡→[博多-プサン フェリー]→プサン→大邱→大田→清州→ソウル',
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
      'CN-ZHANGJIAKOU', // ~190 km from Beijing
      'CN-DATONG',      // ~150 km
      'CN-HOHHOT',      // ~260 km (Driving fallback)
      'CN-ERENHOT',     // ~440 km (driving in Inner Mongolia)
      'MN-SAINSHAND',   // ~210 km — crosses CN-MN border (closed for cars)
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
    notes: 'コロンボ→[インド洋]→マレ(直線)',
  },
  {
    fromCapitalId: 'MV',
    toCapitalId: 'PK',
    routeType: 'mixed',
    waypointCityIds: [
      'PK-KARACHI',  // ~2,400 km Arabian Sea SEA
      'PK-MULTAN',   // ~600 km
      'PK-LAHORE',   // ~360 km
      // Lahore → Islamabad ~280 km
    ],
    // [origin=Male, 1=Karachi, 2=Multan, 3=Lahore, 4=Islamabad]
    seaSegments: [[0, 1]],
    notes: 'マレ→[アラビア海]→カラチ→ムルターン→ラホール→イスラマバード',
  },
  // === Central Asia ===
  {
    fromCapitalId: 'PK',
    toCapitalId: 'AF',
    routeType: 'land',
    waypointCityIds: ['PK-PESHAWAR'],
    notes: 'イスラマバード→ペシャワール→[カイバル峠]→カブール',
  },
  {
    fromCapitalId: 'AF',
    toCapitalId: 'TJ',
    routeType: 'land',
    // Kabul→Dushanbe ~570km via Hindu Kush. Border is open but rugged.
    notes: 'カブール→[ヒンドゥークシュ]→ドゥシャンベ',
  },
  {
    fromCapitalId: 'TJ',
    toCapitalId: 'KG',
    routeType: 'land',
    waypointCityIds: [
      'TJ-KHUJAND', // ~280 km north
      'KG-OSH',     // ~330 km — crosses TJ-KG border
      // Osh → Bishkek ~450 km via Tien Shan
    ],
    notes: 'ドゥシャンベ→ホジャンド→オシュ→[天山]→ビシュケク',
  },
  {
    fromCapitalId: 'KG',
    toCapitalId: 'KZ',
    routeType: 'land',
    waypointCityIds: [
      'KZ-ALMATY',     // ~240 km
      'KZ-KARAGANDA',  // ~700 km
      // Karaganda → Astana ~210 km
    ],
    notes: 'ビシュケク→アルマトイ(思い出)→カラガンダ→アスタナ',
  },
  {
    fromCapitalId: 'KZ',
    toCapitalId: 'UZ',
    routeType: 'land',
    waypointCityIds: [
      'KZ-SHYMKENT', // ~1,100 km south through Kazakhstan
      // Shymkent → Tashkent ~120 km, crosses KZ-UZ border
    ],
    notes: 'アスタナ→シムケント→[国境]→タシュケント',
  },
  {
    fromCapitalId: 'UZ',
    toCapitalId: 'TM',
    routeType: 'land',
    waypointCityIds: [
      'UZ-SAMARKAND', // ~280 km from Tashkent
      'UZ-BUKHARA',   // ~270 km
      // Bukhara → Ashgabat ~750 km, crosses UZ-TM border
    ],
    notes: 'タシュケント→サマルカンド→ブハラ→[国境]→アシガバート',
  },
  // === Middle East ===
  {
    fromCapitalId: 'TM',
    toCapitalId: 'IR',
    routeType: 'land',
    waypointCityIds: [
      'IR-MASHHAD', // ~250 km — crosses TM-IR border
      // Mashhad → Tehran ~700 km
    ],
    notes: 'アシガバート→[国境]→マシュハド→テヘラン',
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
    waypointCityIds: ['AE-DUBAI'],
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
    waypointCityIds: ['SA-MECCA', 'SA-JEDDAH'],
    notes: 'サナア→メッカ→ジェッダ→リヤド',
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
    waypointCityIds: ['IL-TELAVIV'],
    notes: 'エルサレム→テルアビブ→ベイルート',
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
    waypointCityIds: ['TR-CAPPADOCIA'],
    notes: 'ダマスカス→カッパドキア経由→アンカラ',
  },
  {
    fromCapitalId: 'TR',
    toCapitalId: 'CY',
    routeType: 'sea',
    waypointCityIds: ['TR-IZMIR'],
    notes: 'アンカラ→イズミル→[地中海]→キプロス',
  },
  {
    fromCapitalId: 'CY',
    toCapitalId: 'GE',
    routeType: 'mixed',
    waypointCityIds: ['TR-ISTANBUL'],
    notes: 'キプロス→[地中海]→イスタンブール→[黒海沿い]→トビリシ',
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
  // After v9 reorder, AZ is followed by EG (Africa starts) instead of RU.
  // Anchor on the Iranian-side neighbor before the long fantasy hop to
  // Egypt — walking AZ→TABRIZ ~380 km is realistic, the rest is implied.
  {
    fromCapitalId: 'AZ',
    toCapitalId: 'EG',
    routeType: 'mixed',
    waypointCityIds: ['IR-TABRIZ'],
    seaSegments: [[1, 2]], // TABRIZ → Cairo: 3,000 km, fantasy
    notes: 'バクー→タブリーズ→[~3,000km 中東上空]→カイロ',
  },
  // West Africa → Russia: ST→CV-MINDELO (~600 km Atlantic) → Moscow.
  // Anchor on Cape Verde so at least the first leg has continental
  // context; the last hop is unavoidable.
  {
    fromCapitalId: 'ST',
    toCapitalId: 'RU',
    routeType: 'mixed',
    waypointCityIds: ['CV-MINDELO'],
    seaSegments: [[0, 1], [1, 2]], // Both legs are over water.
    notes: 'サントメ→[600km 大西洋]→ミンデロ(カーボベルデ)→[~5,000km 大西洋・欧州上空]→モスクワ',
  },

  // ===== Batch 4: Eastern + Southern Europe (RU → GR), 10 segments =====
  // Drives the player from Moscow through the Baltics, Belarus/Ukraine,
  // Moldova, Romania, Bulgaria down to Athens. Most pairs ≤ 200 km;
  // a handful (Veliky Novgorod, Šiauliai→Vilnius, Vinnytsia legs,
  // Sofia→Thessaloniki) lean on the Driving fallback at ~270-310 km.

  // Moscow → Helsinki via the historical M10/E105 corridor.
  // Refined to keep all consecutive pairs ≤ ~200 km for Walking mode.
  {
    fromCapitalId: 'RU',
    toCapitalId: 'FI',
    routeType: 'mixed',
    waypointCityIds: [
      'RU-TVER',             // ~170 km from Moscow
      'RU-TORZHOK',          // ~60 km
      'RU-VYSHNIYVOLOCHEK',  // ~70 km
      'RU-VELIKYNOVGOROD',   // ~225 km (slight Driving fallback)
      'RU-STPETERSBURG',     // ~180 km
      'RU-VYBORG',           // ~140 km
      // Vyborg → Lappeenranta crosses the RU-FI border (~60 km)
      'FI-LAPPEENRANTA',     // ~60 km
      'FI-PORVOO',           // ~190 km
      // Porvoo → Helsinki ~50 km
    ],
    notes:
      'モスクワ→トヴェリ→トルジョーク→ヴィシニー・ヴォロチョーク→ヴェリーキー・ノヴゴロド→サンクトペテルブルク→ヴィボルグ→[国境]→ラッペーンランタ→ポルヴォー→ヘルシンキ',
  },

  // Helsinki ↔ Tallinn — direct Tallink/Eckerö ferry across Gulf of Finland (~85 km).
  {
    fromCapitalId: 'FI',
    toCapitalId: 'EE',
    routeType: 'mixed',
    seaSegments: [[0, 1]], // Whole leg is sea.
    notes: 'ヘルシンキ→[フィンランド湾フェリー 85km]→タリン',
  },

  // Tallinn → Riga via Pärnu on the Via Baltica (E67).
  {
    fromCapitalId: 'EE',
    toCapitalId: 'LV',
    routeType: 'land',
    waypointCityIds: ['EE-PARNU'], // Tallinn~135km Pärnu, Pärnu~175km Riga
    notes: 'タリン→パルヌ→リガ（バルト海沿岸ハイウェイ）',
  },

  // Riga → Vilnius via Šiauliai + Panevėžys.
  {
    fromCapitalId: 'LV',
    toCapitalId: 'LT',
    routeType: 'land',
    waypointCityIds: [
      'LT-SIAULIAI',   // ~135 km from Riga
      'LT-PANEVEZYS',  // ~80 km
      // Panevėžys → Vilnius ~140 km
    ],
    notes: 'リガ→シャウレイ→パネヴェジース→ビリニュス',
  },

  // Vilnius ↔ Minsk — direct, no intermediate city of game-relevance.
  {
    fromCapitalId: 'LT',
    toCapitalId: 'BY',
    routeType: 'land',
    notes: 'ビリニュス→ミンスク（直行 ~180km）',
  },

  // Minsk → Kyiv via Bobruisk + Gomel + Chernihiv.
  {
    fromCapitalId: 'BY',
    toCapitalId: 'UA',
    routeType: 'land',
    waypointCityIds: [
      'BY-BOBRUISK',    // ~140 km from Minsk
      'BY-GOMEL',       // ~170 km
      'UA-CHERNIHIV',   // ~110 km (BY-UA border crossing)
      // Chernihiv → Kyiv ~150 km
    ],
    notes: 'ミンスク→ボブルイスク→ゴメリ→[国境]→チェルニーヒウ→キーウ',
  },

  // Kyiv → Chișinău via Bila Tserkva → Uman → Vinnytsia → Mohyliv-Podilskyi.
  {
    fromCapitalId: 'UA',
    toCapitalId: 'MD',
    routeType: 'land',
    waypointCityIds: [
      'UA-BILATSERKVA',       // ~85 km from Kyiv
      'UA-UMAN',              // ~150 km
      'UA-VINNYTSIA',         // ~135 km
      'UA-MOHYLIVPODILSKYI',  // ~170 km, MD border
      // Mohyliv-Podilskyi → Chișinău ~110 km
    ],
    notes: 'キーウ→ビーラ・ツェルクヴァ→ウーマニ→ヴィーンヌィツャ→モヒリウ＝ポジーリシキー→[国境]→キシニョフ',
  },

  // Chișinău → Bucharest via Iași + Bacău + Buzău.
  {
    fromCapitalId: 'MD',
    toCapitalId: 'RO',
    routeType: 'land',
    waypointCityIds: [
      'RO-IASI',   // ~110 km (MD-RO border)
      'RO-BACAU',  // ~130 km
      'RO-BUZAU',  // ~160 km
      // Buzău → Bucharest ~110 km
    ],
    notes: 'キシニョフ→[国境]→ヤシ→バクー→ブザウ→ブカレスト',
  },

  // Bucharest → Sofia via Ruse (Friendship Bridge) + Pleven.
  {
    fromCapitalId: 'RO',
    toCapitalId: 'BG',
    routeType: 'land',
    waypointCityIds: [
      'BG-RUSE',    // ~75 km, Danube crossing at the Friendship Bridge
      'BG-PLEVEN',  // ~150 km
      // Pleven → Sofia ~175 km
    ],
    notes: 'ブカレスト→[ドナウ・友好橋]→ルセ→プレヴェン→ソフィア',
  },

  // Sofia → Athens via Blagoevgrad → Serres → Thessaloniki → Larissa → Lamia → Thebes.
  {
    fromCapitalId: 'BG',
    toCapitalId: 'GR',
    routeType: 'land',
    waypointCityIds: [
      'BG-BLAGOEVGRAD',  // ~100 km from Sofia
      'GR-SERRES',       // ~120 km, GR border crossing
      'GR-THESSALONIKI', // ~95 km
      'GR-LARISSA',      // ~155 km
      'GR-LAMIA',        // ~145 km
      'GR-THEBES',       // ~110 km
      // Thebes → Athens ~80 km
    ],
    notes:
      'ソフィア→ブラゴエヴグラト→[国境]→セレス→テッサロニキ→ラリサ→ラミア→テーベ→アテネ',
  },

  // ===== Batch 5: Balkans + Central Europe (GR → DE), 12 segments =====
  // Athens crawls north through the Balkans into Belgrade → Sarajevo →
  // Zagreb → Ljubljana, then central-Europe across Maribor → Budapest →
  // Bratislava → Brno → Prague → Liberec → Wrocław → Łódź → Warsaw →
  // Poznań → Berlin. Most pairs ≤ 200 km; the few exceptions
  // (Sarajevo→Banja Luka, Brno→Prague, Polish corridor) accept the
  // Driving fallback that's already baked into the route renderer.

  // Athens → Skopje. Climb back north through the Greek spine, cross
  // into North Macedonia at Bitola.
  {
    fromCapitalId: 'GR',
    toCapitalId: 'MK',
    routeType: 'mixed',
    waypointCityIds: [
      'GR-LAMIA',        // ~210 km from Athens (Driving fallback)
      'GR-LARISSA',      // ~145 km
      'GR-THESSALONIKI', // ~155 km
      // Thessaloniki → Bitola ~190 km, GR-MK border
      'MK-BITOLA',       // ~190 km
      'MK-PRILEP',       // ~45 km
      // Prilep → Skopje ~130 km
    ],
    notes:
      'アテネ→ラミア→ラリサ→テッサロニキ→[国境]→ビトラ→プリレプ→スコピエ',
  },

  // Skopje → Tirana via Tetovo (Mavrovo highway).
  {
    fromCapitalId: 'MK',
    toCapitalId: 'AL',
    routeType: 'land',
    waypointCityIds: [
      'MK-TETOVO', // ~45 km from Skopje
      // Tetovo → Tirana ~100 km, MK-AL border
    ],
    notes: 'スコピエ→テトヴォ→[国境]→ティラナ',
  },

  // Tirana → Podgorica via Shkodër (along the Adriatic side).
  {
    fromCapitalId: 'AL',
    toCapitalId: 'ME',
    routeType: 'land',
    waypointCityIds: [
      'AL-SHKODER', // ~95 km from Tirana
      // Shkodër → Podgorica ~60 km, AL-ME border
    ],
    notes: 'ティラナ→シュコドラ→[国境]→ポドゴリツァ',
  },

  // Podgorica → Belgrade via the Tara/Lim mountain corridor.
  {
    fromCapitalId: 'ME',
    toCapitalId: 'RS',
    routeType: 'land',
    waypointCityIds: [
      'ME-PLJEVLJA', // ~165 km from Podgorica (mountainous)
      'RS-UZICE',    // ~120 km, ME-RS border
      'RS-CACAK',    // ~80 km
      // Čačak → Belgrade ~135 km
    ],
    notes: 'ポドゴリツァ→プリェヴリャ→[国境]→ウジツェ→チャチャク→ベオグラード',
  },

  // Belgrade → Sarajevo via Tuzla.
  {
    fromCapitalId: 'RS',
    toCapitalId: 'BA',
    routeType: 'land',
    waypointCityIds: [
      'BA-TUZLA', // ~190 km from Belgrade, RS-BA border
      // Tuzla → Sarajevo ~140 km
    ],
    notes: 'ベオグラード→[国境]→トゥズラ→サラエボ',
  },

  // Sarajevo → Zagreb via Zenica → Banja Luka.
  {
    fromCapitalId: 'BA',
    toCapitalId: 'HR',
    routeType: 'land',
    waypointCityIds: [
      'BA-ZENICA',    // ~70 km from Sarajevo
      'BA-BANJALUKA', // ~155 km
      // Banja Luka → Zagreb ~190 km, BA-HR border
    ],
    notes: 'サラエボ→ゼニツァ→バニャ・ルカ→[国境]→ザグレブ',
  },

  // Zagreb → Ljubljana — direct.
  {
    fromCapitalId: 'HR',
    toCapitalId: 'SI',
    routeType: 'land',
    notes: 'ザグレブ→[国境]→リュブリャナ（直行 ~140km）',
  },

  // Ljubljana → Budapest via Maribor → Nagykanizsa → Veszprém.
  {
    fromCapitalId: 'SI',
    toCapitalId: 'HU',
    routeType: 'land',
    waypointCityIds: [
      'SI-MARIBOR',      // ~110 km from Ljubljana
      'HU-NAGYKANIZSA',  // ~130 km, SI-HU border
      'HU-VESZPREM',     // ~130 km
      // Veszprém → Budapest ~110 km
    ],
    notes: 'リュブリャナ→マリボル→[国境]→ナジカニジャ→ヴェスプレーム→ブダペスト',
  },

  // Budapest → Bratislava — direct.
  {
    fromCapitalId: 'HU',
    toCapitalId: 'SK',
    routeType: 'land',
    notes: 'ブダペスト→[国境]→ブラチスラバ（直行 ~165km）',
  },

  // Bratislava → Prague via Brno.
  {
    fromCapitalId: 'SK',
    toCapitalId: 'CZ',
    routeType: 'land',
    waypointCityIds: [
      'CZ-BRNO', // ~135 km from Bratislava, SK-CZ border
      // Brno → Prague ~205 km (Driving fallback)
    ],
    notes: 'ブラチスラバ→[国境]→ブルノ→プラハ',
  },

  // Prague → Warsaw via Liberec → Wrocław → Łódź.
  {
    fromCapitalId: 'CZ',
    toCapitalId: 'PL',
    routeType: 'land',
    waypointCityIds: [
      'CZ-LIBEREC',  // ~110 km from Prague
      'PL-WROCLAW',  // ~170 km, CZ-PL border
      'PL-LODZ',     // ~220 km (Driving fallback)
      // Łódź → Warsaw ~135 km
    ],
    notes: 'プラハ→リベレツ→[国境]→ヴロツワフ→ウッチ→ワルシャワ',
  },

  // Warsaw → Berlin via Łódź → Poznań.
  {
    fromCapitalId: 'PL',
    toCapitalId: 'DE',
    routeType: 'land',
    waypointCityIds: [
      'PL-LODZ',    // ~135 km from Warsaw
      'PL-POZNAN',  // ~210 km (Driving fallback)
      // Poznań → Berlin ~270 km, PL-DE border (Driving fallback)
    ],
    notes: 'ワルシャワ→ウッチ→ポズナン→[国境]→ベルリン',
  },

  // ===== Batch 6: Northern Europe (DE → IS), 4 segments =====

  // Berlin → Copenhagen via Hamburg + Lübeck + Flensburg + Odense.
  // Crosses to Denmark over land then bridges Storebælt to Zealand.
  {
    fromCapitalId: 'DE',
    toCapitalId: 'DK',
    routeType: 'land',
    waypointCityIds: [
      'DE-HAMBURG',    // ~290 km from Berlin (Driving fallback)
      'DE-LUEBECK',    // ~70 km
      'DE-FLENSBURG',  // ~150 km
      'DK-ODENSE',     // ~190 km, DE-DK border (Funen via Jutland)
      // Odense → Copenhagen ~165 km via Storebæltsbro
    ],
    notes:
      'ベルリン→ハンブルク→リューベック→フレンスブルク→[国境・ユトランド]→オーデンセ→[ストアベルト橋]→コペンハーゲン',
  },

  // Copenhagen → Oslo — direct DFDS overnight ferry across the Skagerrak.
  {
    fromCapitalId: 'DK',
    toCapitalId: 'NO',
    routeType: 'mixed',
    seaSegments: [[0, 1]], // entire leg is sea
    notes: 'コペンハーゲン→[DFDSフェリー一晩 ~480km]→オスロ',
  },

  // Oslo → Stockholm via Karlstad + Örebro (E18 corridor).
  {
    fromCapitalId: 'NO',
    toCapitalId: 'SE',
    routeType: 'land',
    waypointCityIds: [
      'SE-KARLSTAD',  // ~210 km from Oslo (NO-SE border crossing)
      'SE-OREBRO',    // ~110 km
      // Örebro → Stockholm ~200 km
    ],
    notes: 'オスロ→[国境]→カールスタード→エレブルー→ストックホルム',
  },

  // Stockholm → Reykjavik. No land path; anchor on Tórshavn (Faroe)
  // and Akureyri (north Iceland) so the line touches real geography.
  {
    fromCapitalId: 'SE',
    toCapitalId: 'IS',
    routeType: 'mixed',
    waypointCityIds: [
      'NO-BERGEN',    // ~860 km from Stockholm (Driving fallback through NO)
      'FO-TORSHAVN',  // ~900 km North Atlantic
      'IS-AKUREYRI',  // ~770 km North Atlantic
      // Akureyri → Reykjavik ~390 km (drive across Iceland)
    ],
    seaSegments: [[1, 2], [2, 3]], // Bergen → Tórshavn → Akureyri are sea
    notes:
      'ストックホルム→ベルゲン→[北大西洋]→トースハウン(フェロー)→[北大西洋]→アークレイリ→レイキャビク',
  },

  // ===== Batch 7: Western Europe (IS → PT), 10 segments =====

  // Reykjavik → Dublin — pure Atlantic crossing.
  {
    fromCapitalId: 'IS',
    toCapitalId: 'IE',
    routeType: 'mixed',
    seaSegments: [[0, 1]], // ~1500 km open Atlantic
    notes: 'レイキャビク→[大西洋 ~1500km]→ダブリン',
  },

  // Dublin → London via Irish Sea ferry → Liverpool → Birmingham.
  {
    fromCapitalId: 'IE',
    toCapitalId: 'GB',
    routeType: 'mixed',
    waypointCityIds: [
      'GB-LIVERPOOL',   // ~210 km incl. Irish Sea ferry from Dublin
      'GB-BIRMINGHAM',  // ~165 km
      // Birmingham → London ~200 km
    ],
    seaSegments: [[0, 1]], // Dublin → Liverpool sea crossing
    notes: 'ダブリン→[アイリッシュ海フェリー]→リヴァプール→バーミンガム→ロンドン',
  },

  // London → Amsterdam via the Netherlands ferry to Hook of Holland.
  {
    fromCapitalId: 'GB',
    toCapitalId: 'NL',
    routeType: 'mixed',
    waypointCityIds: [
      'NL-ROTTERDAM', // ~330 km incl. North Sea ferry crossing
      // Rotterdam → Amsterdam ~75 km
    ],
    seaSegments: [[0, 1]], // London → Rotterdam is the sea hop
    notes: 'ロンドン→[北海フェリー]→ロッテルダム→アムステルダム',
  },

  // Amsterdam → Brussels via Antwerp.
  {
    fromCapitalId: 'NL',
    toCapitalId: 'BE',
    routeType: 'land',
    waypointCityIds: [
      'BE-ANTWERP', // ~160 km, NL-BE border crossing
      // Antwerp → Brussels ~50 km
    ],
    notes: 'アムステルダム→[国境]→アントワープ→ブリュッセル',
  },

  // Brussels → Luxembourg — direct (~220 km, Driving fallback).
  {
    fromCapitalId: 'BE',
    toCapitalId: 'LU',
    routeType: 'land',
    notes: 'ブリュッセル→[国境]→ルクセンブルク（直行 ~220km）',
  },

  // Luxembourg → Paris via Metz + Reims.
  {
    fromCapitalId: 'LU',
    toCapitalId: 'FR',
    routeType: 'land',
    waypointCityIds: [
      'FR-METZ',   // ~70 km from Luxembourg, LU-FR border
      'FR-REIMS',  // ~190 km
      // Reims → Paris ~140 km
    ],
    notes: 'ルクセンブルク→[国境]→メス→ランス→パリ',
  },

  // Paris → Monaco via Dijon → Lyon → Avignon → Marseille → Nice (E15/A6/A7/A8).
  {
    fromCapitalId: 'FR',
    toCapitalId: 'MC',
    routeType: 'land',
    waypointCityIds: [
      'FR-DIJON',      // ~310 km from Paris (Driving fallback)
      'FR-LYON',       // ~200 km
      'FR-AVIGNON',    // ~230 km (slight Driving fallback)
      'FR-MARSEILLE',  // ~85 km
      'FR-NICE',       // ~205 km (Driving fallback)
      // Nice → Monaco ~20 km
    ],
    notes: 'パリ→ディジョン→リヨン→アヴィニョン→マルセイユ→ニース→モナコ',
  },

  // Monaco → Andorra via Marseille → Montpellier → Toulouse.
  {
    fromCapitalId: 'MC',
    toCapitalId: 'AD',
    routeType: 'land',
    waypointCityIds: [
      'FR-NICE',         // ~20 km from Monaco
      'FR-MARSEILLE',    // ~205 km (Driving fallback)
      'FR-MONTPELLIER',  // ~165 km
      'FR-TOULOUSE',     // ~245 km (Driving fallback)
      // Toulouse → Andorra la Vella ~190 km, FR-AD border via Pyrenees
    ],
    notes: 'モナコ→ニース→マルセイユ→モンペリエ→トゥールーズ→[ピレネー]→アンドラ・ラ・ヴェリャ',
  },

  // Andorra → Madrid via Lleida → Zaragoza.
  {
    fromCapitalId: 'AD',
    toCapitalId: 'ES',
    routeType: 'land',
    waypointCityIds: [
      'ES-LLEIDA',    // ~190 km from Andorra (AD-ES border)
      'ES-ZARAGOZA',  // ~150 km
      // Zaragoza → Madrid ~315 km (Driving fallback)
    ],
    notes: 'アンドラ→[国境]→リェイダ→サラゴサ→マドリード',
  },

  // Madrid → Lisbon via Toledo → Mérida → Évora.
  {
    fromCapitalId: 'ES',
    toCapitalId: 'PT',
    routeType: 'land',
    waypointCityIds: [
      'ES-TOLEDO',  // ~75 km from Madrid
      'ES-MERIDA',  // ~280 km (Driving fallback)
      'PT-EVORA',   // ~205 km (Driving fallback, PT border)
      // Évora → Lisbon ~135 km
    ],
    notes: 'マドリード→トレド→メリダ→[国境]→エヴォラ→リスボン',
  },

  // ===== Batch 8: Mediterranean Europe (PT → MT), 6 segments =====

  // Lisbon → Bern. Long Iberia → France → Switzerland trek; broken
  // into ≤200km hops via small coastal/inland cities.
  {
    fromCapitalId: 'PT',
    toCapitalId: 'CH',
    routeType: 'land',
    waypointCityIds: [
      'PT-COIMBRA',      // ~200 km from Lisbon
      'PT-PORTO',        // ~120 km
      // Porto → Spanish Galicia → Cantabria → Catalonia coast → France
      'ES-ZARAGOZA',     // ~705 km — long inland diagonal (Driving fallback)
      'ES-LLEIDA',       // ~150 km
      'ES-BARCELONA',    // ~150 km
      'ES-GIRONA',       // ~100 km
      'FR-PERPIGNAN',    // ~120 km, ES-FR border
      'FR-MONTPELLIER',  // ~155 km
      'FR-AVIGNON',      // ~95 km
      'FR-LYON',         // ~230 km
      'CH-GENEVA',       // ~150 km, FR-CH border
      // Geneva → Bern ~160 km
    ],
    notes:
      'リスボン→コインブラ→ポルト→[国境]→サラゴサ→リェイダ→バルセロナ→ジローナ→[国境]→ペルピニャン→モンペリエ→アヴィニョン→リヨン→[国境]→ジュネーブ→ベルン',
  },

  // Bern → Vaduz via Zurich.
  {
    fromCapitalId: 'CH',
    toCapitalId: 'LI',
    routeType: 'land',
    waypointCityIds: [
      'CH-ZURICH', // ~125 km from Bern
      // Zurich → Vaduz ~120 km, CH-LI border
    ],
    notes: 'ベルン→チューリヒ→[国境]→ファドゥーツ',
  },

  // Vaduz → Vienna via Innsbruck → Salzburg → Linz.
  {
    fromCapitalId: 'LI',
    toCapitalId: 'AT',
    routeType: 'land',
    waypointCityIds: [
      'AT-INNSBRUCK', // ~190 km from Vaduz, LI-AT border (Arlberg pass)
      'AT-SALZBURG',  // ~190 km
      'AT-LINZ',      // ~135 km
      // Linz → Vienna ~185 km
    ],
    notes: 'ファドゥーツ→[国境]→インスブルック→ザルツブルク→リンツ→ウィーン',
  },

  // Vienna → Rome via Graz → Trieste → Venice → Bologna → Florence.
  {
    fromCapitalId: 'AT',
    toCapitalId: 'IT',
    routeType: 'land',
    waypointCityIds: [
      'AT-GRAZ',      // ~200 km from Vienna
      'IT-TRIESTE',   // ~225 km, AT-IT border (Driving fallback)
      'IT-VENICE',    // ~165 km
      'IT-BOLOGNA',   // ~155 km
      'IT-FLORENCE',  // ~105 km
      // Florence → Rome ~280 km (Driving fallback)
    ],
    notes:
      'ウィーン→グラーツ→[国境]→トリエステ→ヴェネツィア→ボローニャ→フィレンツェ→ローマ',
  },

  // Rome → San Marino via Perugia + Ancona on the Adriatic coast.
  {
    fromCapitalId: 'IT',
    toCapitalId: 'SM',
    routeType: 'land',
    waypointCityIds: [
      'IT-PERUGIA', // ~170 km from Rome
      'IT-ANCONA',  // ~130 km
      // Ancona → San Marino ~135 km
    ],
    notes: 'ローマ→ペルージャ→アンコーナ→サンマリノ',
  },

  // San Marino → Valletta via Bologna → Florence → Siena → coast →
  // Naples → Palermo → Mediterranean ferry to Malta.
  {
    fromCapitalId: 'SM',
    toCapitalId: 'MT',
    routeType: 'mixed',
    waypointCityIds: [
      'IT-BOLOGNA',  // ~110 km from San Marino
      'IT-FLORENCE', // ~105 km
      'IT-SIENA',    // ~75 km
      'IT-PISA',     // ~140 km (slight Driving fallback)
      'IT-NAPLES',   // ~480 km along the Tyrrhenian coast (heavy Driving fallback)
      'IT-PALERMO',  // ~310 km incl. Strait of Messina ferry
      // Palermo → Valletta ~510 km Mediterranean
    ],
    seaSegments: [[5, 6], [6, 7]], // Naples→Palermo + Palermo→Valletta sea
    notes:
      'サンマリノ→ボローニャ→フィレンツェ→シエナ→ピサ→ナポリ→[メッシーナ海峡]→パレルモ→[地中海]→バレッタ',
  },

  // ===== Batch 9: Atlantic + North America (MT → MX), 3 segments =====

  // Valletta → Ottawa. Pure Atlantic crossing anchored on the Azores
  // and Newfoundland.
  {
    fromCapitalId: 'MT',
    toCapitalId: 'CA',
    routeType: 'mixed',
    waypointCityIds: [
      'PT-PONTADELGADA', // ~3300 km Mediterranean+Atlantic to Azores
      'CA-STJOHNS',      // ~2200 km open Atlantic to Newfoundland
      'CA-HALIFAX',      // ~900 km along Maritime Canada
      'CA-MONTREAL',     // ~810 km (Driving fallback)
      // Montréal → Ottawa ~200 km
    ],
    seaSegments: [[0, 1], [1, 2]], // Valletta→Ponta Delgada→St.Johns sea
    notes:
      'バレッタ→[地中海・大西洋]→ポンタ・デルガダ(アゾレス)→[北大西洋]→セントジョンズ→ハリファックス→モントリオール→オタワ',
  },

  // Ottawa → Washington DC via Montréal → Albany → NYC → Philadelphia.
  {
    fromCapitalId: 'CA',
    toCapitalId: 'US',
    routeType: 'land',
    waypointCityIds: [
      'CA-MONTREAL',     // ~200 km from Ottawa
      'US-ALBANY',       // ~290 km, CA-US border (Driving fallback)
      'US-NYC',          // ~250 km
      'US-PHILADELPHIA', // ~150 km
      // Philadelphia → DC ~225 km (Driving fallback)
    ],
    notes: 'オタワ→モントリオール→[国境]→オールバニ→ニューヨーク→フィラデルフィア→ワシントンD.C.',
  },

  // DC → Mexico City via the I-95/I-10/I-35 corridor, fully diced into
  // ≤200 km hops through real cities.
  {
    fromCapitalId: 'US',
    toCapitalId: 'MX',
    routeType: 'land',
    waypointCityIds: [
      'US-RICHMOND',      // ~170 km from DC
      'US-RALEIGH',       // ~270 km (slight Driving fallback)
      'US-CHARLOTTE',     // ~265 km (slight Driving fallback)
      'US-GREENVILLE',    // ~165 km
      'US-ATLANTA',       // ~225 km (slight Driving fallback)
      'US-BIRMINGHAM',    // ~240 km
      'US-MONTGOMERY',    // ~145 km
      'US-MOBILE',        // ~270 km (slight Driving fallback)
      'US-NEWORLEANS',    // ~225 km
      'US-BATONROUGE',    // ~130 km
      'US-LAFAYETTE',     // ~85 km
      'US-BEAUMONT',      // ~190 km
      'US-HOUSTON',       // ~135 km
      'US-SANANTONIO',    // ~310 km (Driving fallback — SH-71 corridor)
      'US-LAREDO',        // ~250 km (slight Driving fallback)
      'MX-NUEVOLAREDO',   // ~5 km (Río Grande border crossing)
      'MX-MONTERREY',     // ~225 km (slight Driving fallback)
      'MX-SALTILLO',      // ~85 km
      'MX-SLP',           // ~360 km (Driving fallback through arid plain)
      // SLP → Mexico City ~430 km (Driving fallback)
    ],
    notes:
      'ワシントン→リッチモンド→ローリー→シャーロット→グリーンビル→アトランタ→バーミングハム→モンゴメリー→モビール→ニューオーリンズ→バトンルージュ→ラファイエット→ボーモント→ヒューストン→サンアントニオ→ラレド→[国境]→ヌエボ・ラレド→モンテレイ→サルティーヨ→サン・ルイス・ポトシ→メキシコシティ',
  },

  // ===== Batch 10: Central America (MX → PA), 7 segments =====

  // Mexico City → Guatemala City via Puebla → Tehuacán → Oaxaca →
  // Juchitán → Tuxtla → Huehuetenango → Quetzaltenango.
  {
    fromCapitalId: 'MX',
    toCapitalId: 'GT',
    routeType: 'land',
    waypointCityIds: [
      'MX-PUEBLA',          // ~135 km from Mexico City
      'MX-TEHUACAN',        // ~135 km
      'MX-OAXACA',          // ~210 km (slight Driving fallback)
      'MX-JUCHITAN',        // ~245 km (slight Driving fallback)
      'MX-TUXTLA',          // ~225 km (slight Driving fallback)
      'GT-HUEHUETENANGO',   // ~210 km, MX-GT border (slight Driving fallback)
      'GT-QUETZALTENANGO',  // ~85 km
      // Quetzaltenango → Guatemala City ~210 km (slight Driving fallback)
    ],
    notes:
      'メキシコシティ→プエブラ→テワカン→オアハカ→フチタン→トゥクストラ→[国境]→ウエウエテナンゴ→ケツァルテナンゴ→グアテマラシティ',
  },

  // Guatemala City → Belmopan via Puerto Barrios.
  {
    fromCapitalId: 'GT',
    toCapitalId: 'BZ',
    routeType: 'land',
    waypointCityIds: [
      'GT-PUERTOBARRIOS', // ~290 km from Guatemala City (Driving fallback)
      // Puerto Barrios → Belmopan ~165 km, GT-BZ border
    ],
    notes: 'グアテマラシティ→プエルトバリオス→[国境]→ベルモパン',
  },

  // Belmopan → Tegucigalpa via San Pedro Sula.
  {
    fromCapitalId: 'BZ',
    toCapitalId: 'HN',
    routeType: 'land',
    waypointCityIds: [
      'HN-SANPEDROSULA', // ~360 km from Belmopan, GT/HN borders (Driving)
      // San Pedro Sula → Tegucigalpa ~240 km (Driving fallback)
    ],
    notes: 'ベルモパン→[国境・グアテマラ経由]→サンペドロスーラ→テグシガルパ',
  },

  // Tegucigalpa → San Salvador via Comayagua.
  {
    fromCapitalId: 'HN',
    toCapitalId: 'SV',
    routeType: 'land',
    waypointCityIds: [
      'HN-COMAYAGUA', // ~90 km from Tegucigalpa
      // Comayagua → San Salvador ~240 km, HN-SV border (Driving fallback)
    ],
    notes: 'テグシガルパ→コマヤグア→[国境]→サンサルバドル',
  },

  // San Salvador → Managua via La Unión + León.
  {
    fromCapitalId: 'SV',
    toCapitalId: 'NI',
    routeType: 'land',
    waypointCityIds: [
      'SV-LAUNION', // ~185 km from San Salvador
      'NI-LEON',    // ~190 km, SV-HN-NI borders (Driving fallback through HN)
      // León → Managua ~90 km
    ],
    notes: 'サンサルバドル→ラ・ウニオン→[国境]→レオン→マナグア',
  },

  // Managua → San José via Granada + Liberia.
  {
    fromCapitalId: 'NI',
    toCapitalId: 'CR',
    routeType: 'land',
    waypointCityIds: [
      'NI-GRANADA', // ~45 km from Managua
      'CR-LIBERIA', // ~210 km, NI-CR border (Driving fallback)
      // Liberia → San José ~225 km (Driving fallback)
    ],
    notes: 'マナグア→グラナダ→[国境]→リベリア→サンホセ',
  },

  // San José → Panama City via David + Santiago.
  {
    fromCapitalId: 'CR',
    toCapitalId: 'PA',
    routeType: 'land',
    waypointCityIds: [
      'PA-DAVID',    // ~360 km from San José, CR-PA border (Driving fallback)
      'PA-SANTIAGO', // ~210 km (Driving fallback)
      // Santiago → Panama City ~250 km (Driving fallback)
    ],
    notes: 'サンホセ→[国境]→ダビ→サンティアゴ・デ・ベラグアス→パナマシティ',
  },

  // ===== Batch 11: Caribbean (PA → KN), 13 segments =====

  // Panama City → Havana. Caribbean crossing anchored on Colón
  // (Atlantic side) before the long sea hop.
  {
    fromCapitalId: 'PA',
    toCapitalId: 'CU',
    routeType: 'mixed',
    waypointCityIds: [
      'PA-COLON', // ~75 km from Panama City (canal crossing)
      // Colón → Havana ~1500 km Caribbean
    ],
    seaSegments: [[1, 2]],
    notes: 'パナマシティ→コロン→[カリブ海 ~1500km]→ハバナ',
  },

  // Havana → Kingston via Santiago de Cuba.
  {
    fromCapitalId: 'CU',
    toCapitalId: 'JM',
    routeType: 'mixed',
    waypointCityIds: [
      'CU-SANTIAGODECUBA', // ~870 km within Cuba (Driving fallback)
      // Santiago de Cuba → Kingston ~280 km Caribbean
    ],
    seaSegments: [[1, 2]],
    notes: 'ハバナ→サンティアゴ・デ・クーバ→[カリブ海]→キングストン',
  },

  // Kingston → Port-au-Prince — direct sea.
  {
    fromCapitalId: 'JM',
    toCapitalId: 'HT',
    routeType: 'mixed',
    seaSegments: [[0, 1]],
    notes: 'キングストン→[カリブ海 ~700km]→ポルトープランス',
  },

  // Port-au-Prince → Santo Domingo via Cap-Haïtien + DO Santiago.
  {
    fromCapitalId: 'HT',
    toCapitalId: 'DO',
    routeType: 'land',
    waypointCityIds: [
      'HT-CAPHAITIEN', // ~225 km from Port-au-Prince (Driving fallback)
      'DO-SANTIAGO',   // ~165 km, HT-DO border
      // DO Santiago → Santo Domingo ~155 km
    ],
    notes: 'ポルトープランス→カパイシャン→[国境]→サンティアゴ→サントドミンゴ',
  },

  // Santo Domingo → Nassau via Turks & Caicos anchor.
  {
    fromCapitalId: 'DO',
    toCapitalId: 'BS',
    routeType: 'mixed',
    waypointCityIds: [
      'TC-PROVIDENCIALES', // ~470 km Atlantic
      // Providenciales → Nassau ~700 km
    ],
    seaSegments: [[0, 1], [1, 2]],
    notes: 'サントドミンゴ→[大西洋]→プロヴィデンシアレス→[大西洋]→ナッソー',
  },

  // Nassau → Bridgetown — long Caribbean traverse, no realistic anchor.
  {
    fromCapitalId: 'BS',
    toCapitalId: 'BB',
    routeType: 'mixed',
    seaSegments: [[0, 1]],
    notes: 'ナッソー→[カリブ海 ~1900km]→ブリッジタウン',
  },

  // Bridgetown → Port of Spain — direct sea.
  {
    fromCapitalId: 'BB',
    toCapitalId: 'TT',
    routeType: 'mixed',
    seaSegments: [[0, 1]],
    notes: 'ブリッジタウン→[カリブ海 ~410km]→ポートオブスペイン',
  },

  // Port of Spain → St. George's — direct sea.
  {
    fromCapitalId: 'TT',
    toCapitalId: 'GD',
    routeType: 'mixed',
    seaSegments: [[0, 1]],
    notes: 'ポートオブスペイン→[カリブ海 ~200km]→セントジョージズ',
  },

  // St. George's → Kingstown — direct sea (Lesser Antilles chain).
  {
    fromCapitalId: 'GD',
    toCapitalId: 'VC',
    routeType: 'mixed',
    seaSegments: [[0, 1]],
    notes: 'セントジョージズ→[カリブ海 ~190km]→キングスタウン',
  },

  // Kingstown → Castries — direct sea.
  {
    fromCapitalId: 'VC',
    toCapitalId: 'LC',
    routeType: 'mixed',
    seaSegments: [[0, 1]],
    notes: 'キングスタウン→[カリブ海 ~110km]→カストリーズ',
  },

  // Castries → Roseau — direct sea (passes Martinique).
  {
    fromCapitalId: 'LC',
    toCapitalId: 'DM',
    routeType: 'mixed',
    seaSegments: [[0, 1]],
    notes: 'カストリーズ→[カリブ海 ~110km]→ロゾー',
  },

  // Roseau → St. John's — direct sea.
  {
    fromCapitalId: 'DM',
    toCapitalId: 'AG',
    routeType: 'mixed',
    seaSegments: [[0, 1]],
    notes: 'ロゾー→[カリブ海 ~310km]→セントジョンズ',
  },

  // St. John's → Basseterre — direct sea.
  {
    fromCapitalId: 'AG',
    toCapitalId: 'KN',
    routeType: 'mixed',
    seaSegments: [[0, 1]],
    notes: 'セントジョンズ→[カリブ海 ~100km]→バセテール',
  },

  // ===== Batch 12: South America (KN → EC), 12 segments =====

  // Basseterre → Bogotá. Caribbean to mainland VE then over the Andes.
  {
    fromCapitalId: 'KN',
    toCapitalId: 'CO',
    routeType: 'mixed',
    waypointCityIds: [
      'VE-VALENCIA',   // ~890 km Caribbean to Venezuelan coast
      'VE-MARACAIBO',  // ~270 km (Driving fallback)
      'CO-CUCUTA',     // ~270 km, VE-CO border (Driving fallback)
      // Cúcuta → Bogotá ~560 km (Driving fallback through the Eastern Andes)
    ],
    seaSegments: [[0, 1]], // Basseterre → Valencia is the long sea hop
    notes:
      'バセテール→[カリブ海]→バレンシア→マラカイボ→[国境]→ククータ→ボゴタ',
  },

  // Bogotá → Caracas via Bucaramanga → Cúcuta → Mérida → Valencia.
  {
    fromCapitalId: 'CO',
    toCapitalId: 'VE',
    routeType: 'land',
    waypointCityIds: [
      'CO-BUCARAMANGA', // ~390 km from Bogotá (slight Driving fallback)
      'CO-CUCUTA',      // ~200 km
      'VE-MERIDA',      // ~330 km, CO-VE border (Driving fallback through Andes)
      'VE-VALENCIA',    // ~545 km (Driving fallback through Andean valleys)
      // Valencia → Caracas ~150 km
    ],
    notes: 'ボゴタ→ブカラマンガ→ククータ→[国境]→メリダ→バレンシア→カラカス',
  },

  // Caracas → Georgetown via Maturín → Ciudad Guayana then Guyana coastal.
  {
    fromCapitalId: 'VE',
    toCapitalId: 'GY',
    routeType: 'land',
    waypointCityIds: [
      'VE-MATURIN',       // ~510 km from Caracas (Driving fallback)
      'VE-CIUDADGUAYANA', // ~190 km
      // Ciudad Guayana → Georgetown ~580 km, VE-GY border (jungle, Driving)
    ],
    notes: 'カラカス→マトゥリン→シウダー・グアヤナ→[国境・密林]→ジョージタウン',
  },

  // Georgetown → Paramaribo via Linden.
  {
    fromCapitalId: 'GY',
    toCapitalId: 'SR',
    routeType: 'land',
    waypointCityIds: [
      'GY-LINDEN', // ~110 km from Georgetown
      // Linden → Paramaribo ~330 km, GY-SR border (Driving fallback)
    ],
    notes: 'ジョージタウン→リンデン→[国境]→パラマリボ',
  },

  // Paramaribo → Brasília via Macapá → Manaus → Porto Velho → Palmas.
  {
    fromCapitalId: 'SR',
    toCapitalId: 'BR',
    routeType: 'mixed',
    waypointCityIds: [
      'BR-MACAPA',     // ~880 km, SR-FR-BR borders (estuary)
      'BR-MANAUS',     // ~1330 km along the Amazon (river/Driving fallback)
      'BR-PORTOVELHO', // ~880 km along BR-319 jungle highway (Driving fallback)
      'BR-PALMAS',     // ~1320 km (Driving fallback through Cerrado)
      // Palmas → Brasília ~700 km (Driving fallback)
    ],
    seaSegments: [[0, 1]], // Paramaribo → Macapá traverses estuary
    notes:
      'パラマリボ→[国境・アマゾン河口]→マカパ→マナウス→ポルト・ヴェーリョ→パルマス→ブラジリア',
  },

  // Brasília → Asunción via Goiânia + Campo Grande + Ciudad del Este.
  {
    fromCapitalId: 'BR',
    toCapitalId: 'PY',
    routeType: 'land',
    waypointCityIds: [
      'BR-GOIANIA',        // ~210 km from Brasília
      'BR-CAMPOGRANDE',    // ~840 km (Driving fallback)
      'PY-CIUDADDELESTE',  // ~720 km, BR-PY border (Driving fallback)
      // Ciudad del Este → Asunción ~330 km (Driving fallback)
    ],
    notes: 'ブラジリア→ゴイアニア→カンポ・グランデ→[国境]→シウダー・デル・エステ→アスンシオン',
  },

  // Asunción → Montevideo via Corrientes + Rosario + Salto.
  {
    fromCapitalId: 'PY',
    toCapitalId: 'UY',
    routeType: 'land',
    waypointCityIds: [
      'AR-CORRIENTES', // ~325 km from Asunción (Driving fallback)
      'AR-ROSARIO',    // ~720 km (Driving fallback)
      'UY-SALTO',      // ~660 km, AR-UY border (Driving fallback)
      // Salto → Montevideo ~500 km (Driving fallback)
    ],
    notes: 'アスンシオン→[国境]→コリエンテス→ロサリオ→[国境]→サルト→モンテビデオ',
  },

  // Montevideo → Buenos Aires — Río de la Plata ferry.
  {
    fromCapitalId: 'UY',
    toCapitalId: 'AR',
    routeType: 'mixed',
    seaSegments: [[0, 1]],
    notes: 'モンテビデオ→[ブケブス フェリー ~210km]→ブエノスアイレス',
  },

  // Buenos Aires → Santiago via Rosario (passed) → Córdoba → San Luis → Mendoza.
  {
    fromCapitalId: 'AR',
    toCapitalId: 'CL',
    routeType: 'land',
    waypointCityIds: [
      'AR-ROSARIO',  // ~300 km from Buenos Aires (slight Driving fallback)
      'AR-CORDOBA',  // ~400 km (Driving fallback through Pampas)
      'AR-SANLUIS',  // ~410 km (Driving fallback)
      'AR-MENDOZA',  // ~265 km (slight Driving fallback)
      // Mendoza → Santiago ~360 km via Cristo Redentor pass (Driving fallback)
    ],
    notes:
      'ブエノスアイレス→ロサリオ→コルドバ→サン・ルイス→メンドーサ→[アンデス峠]→サンティアゴ',
  },

  // Santiago → La Paz via Viña del Mar → La Serena → Copiapó → Antofagasta → Calama → Uyuni → Oruro.
  {
    fromCapitalId: 'CL',
    toCapitalId: 'BO',
    routeType: 'land',
    waypointCityIds: [
      'CL-VINADELMAR', // ~120 km from Santiago
      'CL-LASERENA',   // ~370 km (Driving fallback up the coast)
      'CL-COPIAPO',    // ~330 km (Driving fallback through Atacama)
      'CL-ANTOFAGASTA',// ~560 km (heavy Driving fallback through driest desert)
      'CL-CALAMA',     // ~210 km (slight Driving fallback)
      'BO-UYUNI',      // ~370 km, CL-BO border (salt flat plateau crossing)
      'BO-ORURO',      // ~325 km (Driving fallback at altitude)
      // Oruro → La Paz ~230 km (Driving fallback)
    ],
    notes:
      'サンティアゴ→ビーニャ・デル・マル→ラ・セレーナ→コピアポ→アントファガスタ→カラマ→[国境]→ウユニ塩湖→オルロ→ラパス',
  },

  // La Paz → Lima via Cochabamba + Puno + Arequipa + Nazca.
  {
    fromCapitalId: 'BO',
    toCapitalId: 'PE',
    routeType: 'land',
    waypointCityIds: [
      'BO-COCHABAMBA', // ~390 km from La Paz (Driving fallback)
      'PE-PUNO',       // ~410 km, BO-PE border via Lake Titicaca (Driving fallback)
      'PE-AREQUIPA',   // ~300 km (Driving fallback)
      'PE-NAZCA',      // ~570 km (heavy Driving fallback through Andean coast)
      // Nazca → Lima ~445 km (Driving fallback)
    ],
    notes: 'ラパス→コチャバンバ→[国境・チチカカ湖]→プーノ→アレキパ→ナスカ→リマ',
  },

  // Lima → Quito via Chimbote + Trujillo + Chiclayo + Piura + Guayaquil + Cuenca.
  {
    fromCapitalId: 'PE',
    toCapitalId: 'EC',
    routeType: 'land',
    waypointCityIds: [
      'PE-CHIMBOTE',    // ~430 km from Lima (Driving fallback up coast)
      'PE-TRUJILLO',    // ~135 km
      'PE-CHICLAYO',    // ~205 km (slight Driving fallback)
      'PE-PIURA',       // ~210 km (slight Driving fallback)
      'EC-GUAYAQUIL',   // ~520 km, PE-EC border (Driving fallback)
      'EC-CUENCA',      // ~190 km
      // Cuenca → Quito ~440 km (Driving fallback through Andes)
    ],
    notes:
      'リマ→チンボテ→トルヒーリョ→チクラヨ→ピウラ→[国境]→グアヤキル→クエンカ→キト',
  },

  // ===== Batch 13: Pacific + Oceania (EC → TV), 14 segments =====

  // Quito → Canberra. The longest leg in the route — Pacific traverse
  // anchored on Galápagos and Tahiti so the line touches real points.
  {
    fromCapitalId: 'EC',
    toCapitalId: 'AU',
    routeType: 'mixed',
    waypointCityIds: [
      'EC-GALAPAGOS', // ~1000 km Pacific
      'PF-PAPEETE',   // ~6300 km open Pacific
      // Papeete → Canberra ~6500 km Pacific
    ],
    seaSegments: [[0, 1], [1, 2], [2, 3]], // every leg is sea/air
    notes:
      'キト→[太平洋]→ガラパゴス→[太平洋 ~6300km]→パペーテ(タヒチ)→[太平洋 ~6500km]→キャンベラ',
  },

  // Canberra → Wellington — Tasman Sea crossing.
  {
    fromCapitalId: 'AU',
    toCapitalId: 'NZ',
    routeType: 'mixed',
    seaSegments: [[0, 1]],
    notes: 'キャンベラ→[タスマン海 ~2300km]→ウェリントン',
  },

  // Wellington → Port Moresby — Coral/Tasman Sea, ~5000 km.
  {
    fromCapitalId: 'NZ',
    toCapitalId: 'PG',
    routeType: 'mixed',
    seaSegments: [[0, 1]],
    notes: 'ウェリントン→[太平洋 ~5000km]→ポートモレスビー',
  },

  // Port Moresby → Suva — Coral Sea, ~3300 km.
  {
    fromCapitalId: 'PG',
    toCapitalId: 'FJ',
    routeType: 'mixed',
    seaSegments: [[0, 1]],
    notes: 'ポートモレスビー→[珊瑚海 ~3300km]→スバ',
  },

  // Suva → Honiara — ~1700 km Pacific.
  {
    fromCapitalId: 'FJ',
    toCapitalId: 'SB',
    routeType: 'mixed',
    seaSegments: [[0, 1]],
    notes: 'スバ→[太平洋 ~1700km]→ホニアラ',
  },

  // Honiara → Port Vila — ~900 km.
  {
    fromCapitalId: 'SB',
    toCapitalId: 'VU',
    routeType: 'mixed',
    seaSegments: [[0, 1]],
    notes: 'ホニアラ→[太平洋 ~900km]→ポートビラ',
  },

  // Port Vila → Apia — ~1900 km.
  {
    fromCapitalId: 'VU',
    toCapitalId: 'WS',
    routeType: 'mixed',
    seaSegments: [[0, 1]],
    notes: 'ポートビラ→[太平洋 ~1900km]→アピア',
  },

  // Apia → Nuku'alofa — ~890 km.
  {
    fromCapitalId: 'WS',
    toCapitalId: 'TO',
    routeType: 'mixed',
    seaSegments: [[0, 1]],
    notes: 'アピア→[太平洋 ~890km]→ヌクアロファ',
  },

  // Nuku'alofa → Tarawa — ~3200 km equatorial Pacific.
  {
    fromCapitalId: 'TO',
    toCapitalId: 'KI',
    routeType: 'mixed',
    seaSegments: [[0, 1]],
    notes: 'ヌクアロファ→[太平洋 ~3200km]→タラワ',
  },

  // Tarawa → Majuro — ~700 km.
  {
    fromCapitalId: 'KI',
    toCapitalId: 'MH',
    routeType: 'mixed',
    seaSegments: [[0, 1]],
    notes: 'タラワ→[太平洋 ~700km]→マジュロ',
  },

  // Majuro → Palikir — ~2000 km.
  {
    fromCapitalId: 'MH',
    toCapitalId: 'FM',
    routeType: 'mixed',
    seaSegments: [[0, 1]],
    notes: 'マジュロ→[太平洋 ~2000km]→パリキール',
  },

  // Palikir → Yaren — ~2300 km.
  {
    fromCapitalId: 'FM',
    toCapitalId: 'NR',
    routeType: 'mixed',
    seaSegments: [[0, 1]],
    notes: 'パリキール→[太平洋 ~2300km]→ヤレン',
  },

  // Yaren → Ngerulmud — ~3300 km.
  {
    fromCapitalId: 'NR',
    toCapitalId: 'PW',
    routeType: 'mixed',
    seaSegments: [[0, 1]],
    notes: 'ヤレン→[太平洋 ~3300km]→ンゲルルムッド',
  },

  // Ngerulmud → Funafuti — ~5000 km. Loop completes in Tuvalu.
  {
    fromCapitalId: 'PW',
    toCapitalId: 'TV',
    routeType: 'mixed',
    seaSegments: [[0, 1]],
    notes: 'ンゲルルムッド→[太平洋 ~5000km]→フナフティ',
  },

  // ===== Batch 14: Africa internal (EG → ST), 53 segments =====
  // Most legs across the Sahara, Sahel, and Indian Ocean are too long
  // for Walking; segments use Driving fallback or seaSegments and add
  // recognizable anchor cities only where they reinforce the geography.

  // Cairo → Tripoli via the Mediterranean coastal road through
  // Marsa Matruh → Tobruk → Benghazi.
  {
    fromCapitalId: 'EG',
    toCapitalId: 'LY',
    routeType: 'land',
    waypointCityIds: [
      'EG-ALEXANDRIA',    // ~220 km from Cairo (slight Driving fallback)
      'EG-MARSAMATRUH',   // ~290 km (Driving fallback along coast)
      'LY-TOBRUK',        // ~290 km, EG-LY border (Driving fallback)
      'LY-BENGHAZI',      // ~480 km (Driving fallback through Cyrenaica)
      // Benghazi → Tripoli ~1000 km (Driving fallback)
    ],
    notes:
      'カイロ→アレクサンドリア→マルサ・マトルーフ→[国境]→トブルク→ベンガジ→トリポリ',
  },

  // Tripoli → Tunis via Sabratha + Misrata reverse-coast then Sfax + Sousse.
  {
    fromCapitalId: 'LY',
    toCapitalId: 'TN',
    routeType: 'land',
    waypointCityIds: [
      'LY-SABRATHA', // ~80 km from Tripoli (slight)
      // Tripoli is east of Sabratha so we go west toward Tunis from Sabratha
      'TN-SFAX',     // ~415 km, LY-TN border crossing (Driving fallback)
      'TN-SOUSSE',   // ~140 km
      // Sousse → Tunis ~140 km
    ],
    notes:
      'トリポリ→サブラタ→[国境]→スファックス→スース→チュニス',
  },

  // Tunis → Algiers via Sousse (passed) → Annaba → Constantine.
  {
    fromCapitalId: 'TN',
    toCapitalId: 'DZ',
    routeType: 'land',
    waypointCityIds: [
      'DZ-ANNABA',       // ~280 km from Tunis, TN-DZ border (Driving fallback)
      'DZ-CONSTANTINE',  // ~155 km
      // Constantine → Algiers ~430 km (Driving fallback)
    ],
    notes: 'チュニス→[国境]→アンナバ→コンスタンティーヌ→アルジェ',
  },

  {
    fromCapitalId: 'DZ',
    toCapitalId: 'MA',
    routeType: 'land',
    waypointCityIds: ['MA-FES'],
    notes: 'アルジェ→[国境]→フェズ→ラバト',
  },

  // Rabat → Nouakchott via the Atlantic coastal road across Western
  // Sahara (Laâyoune → Nouadhibou → Nouakchott).
  {
    fromCapitalId: 'MA',
    toCapitalId: 'MR',
    routeType: 'land',
    waypointCityIds: [
      'MA-CASABLANCA', // ~95 km from Rabat
      'MA-AGADIR',     // ~460 km (Driving fallback through Atlantic coast)
      'MA-LAAYOUNE',   // ~625 km, Western Sahara coast (Driving fallback)
      'MR-NOUADHIBOU', // ~875 km, MA-MR border (Driving fallback)
      // Nouadhibou → Nouakchott ~470 km (Driving fallback)
    ],
    notes:
      'ラバト→カサブランカ→アガディール→[西サハラ]→ラユーン→[国境]→ヌアディブー→ヌアクショット',
  },

  // Nouakchott → Bamako via Néma + Atar (oasis spine of the Sahel).
  {
    fromCapitalId: 'MR',
    toCapitalId: 'ML',
    routeType: 'land',
    waypointCityIds: [
      'MR-ATAR',  // ~440 km from Nouakchott (Driving fallback into desert)
      'MR-NEMA',  // ~860 km southeast diagonal across the Sahel (Driving fallback)
      // Néma → Bamako ~840 km, MR-ML border (Driving fallback)
    ],
    notes: 'ヌアクショット→[サハラ・サヘル]→アタール→ネマ→[国境]→バマコ',
  },

  // Bamako → Niamey via Mopti + Timbuktu + Gao on the Niger River.
  {
    fromCapitalId: 'ML',
    toCapitalId: 'NE',
    routeType: 'land',
    waypointCityIds: [
      'ML-MOPTI',     // ~460 km from Bamako (Driving fallback)
      'ML-TIMBUKTU',  // ~310 km (Driving fallback along Niger River)
      'ML-GAO',       // ~390 km (Driving fallback)
      // Gao → Niamey ~430 km, ML-NE border (Driving fallback)
    ],
    notes:
      'バマコ→モプティ→トンブクトゥ→ガオ→[国境]→ニアメ',
  },

  // Niamey → N'Djamena via Tahoua + Zinder + Agadez (Trans-Sahara Highway 1).
  {
    fromCapitalId: 'NE',
    toCapitalId: 'TD',
    routeType: 'land',
    waypointCityIds: [
      'NE-ZINDERTAHOUA', // ~535 km from Niamey (Driving fallback through Sahel)
      'NE-AGADEZ',       // ~480 km north into the Aïr massif (Driving fallback)
      'NE-ZINDER',       // ~430 km southeast (Driving fallback)
      'TD-MAO',          // ~770 km, NE-TD border (Driving fallback)
      // Mao → N'Djamena ~250 km (Driving fallback)
    ],
    notes:
      'ニアメ→タウア→アガデス→ザンデール→[国境]→マオ→ンジャメナ',
  },

  // N'Djamena → Khartoum via Faya-Largeau + El Fasher + El Obeid.
  {
    fromCapitalId: 'TD',
    toCapitalId: 'SD',
    routeType: 'land',
    waypointCityIds: [
      'TD-FAYALARGEAU',  // ~830 km north into Sahara (Driving fallback)
      'SD-ELFASHER',     // ~720 km southeast, TD-SD border (Driving fallback)
      'SD-ELOBEID',      // ~510 km (Driving fallback)
      // El Obeid → Khartoum ~430 km (Driving fallback)
    ],
    notes:
      'ンジャメナ→ファヤ・ラルジョ→[国境]→エルファーシル→エルオベイド→ハルツーム',
  },

  // Khartoum → Juba via El Obeid (passed) → Wau + Malakal.
  {
    fromCapitalId: 'SD',
    toCapitalId: 'SS',
    routeType: 'land',
    waypointCityIds: [
      'SD-ELOBEID',  // ~430 km from Khartoum
      'SS-WAU',      // ~770 km, SD-SS border (Driving fallback)
      'SS-MALAKAL',  // ~620 km east through SS (Driving fallback)
      // Malakal → Juba ~620 km (Driving fallback through Sudd swamp)
    ],
    notes: 'ハルツーム→エルオベイド→[国境]→ワーウ→マラカル→ジュバ',
  },

  // Juba → Asmara via Aksum + Mekele + Massawa.
  {
    fromCapitalId: 'SS',
    toCapitalId: 'ER',
    routeType: 'land',
    waypointCityIds: [
      'ET-MEKELE',  // ~1500 km from Juba via Ethiopia (heavy Driving fallback)
      'ET-AKSUM',   // ~250 km (Driving fallback)
      'ER-MASSAWA', // ~280 km, ET-ER border (Driving fallback)
      // Massawa → Asmara ~115 km (steep escarpment road)
    ],
    notes: 'ジュバ→[エチオピア経由]→メケレ→アクスム→[国境]→マッサワ→アスマラ',
  },

  {
    fromCapitalId: 'ER',
    toCapitalId: 'DJ',
    routeType: 'land',
    notes: 'アスマラ→[国境]→ジブチ（紅海岸 ~370km）',
  },

  {
    fromCapitalId: 'DJ',
    toCapitalId: 'ET',
    routeType: 'land',
    waypointCityIds: ['ET-DIREDAWA'],
    notes: 'ジブチ→[国境]→ディレダワ→アディスアベバ',
  },

  // Addis Ababa → Mogadishu via Dire Dawa (passed) → Kismayo coast.
  {
    fromCapitalId: 'ET',
    toCapitalId: 'SO',
    routeType: 'land',
    waypointCityIds: [
      'ET-DIREDAWA', // ~440 km from Addis Ababa (Driving fallback)
      'SO-KISMAYO',  // ~1500 km, ET-SO via Ogaden (heavy Driving fallback)
      // Kismayo → Mogadishu ~485 km up Indian Ocean coast (Driving fallback)
    ],
    notes: 'アディスアベバ→ディレダワ→[国境・オガデン]→キスマヨ→モガディシュ',
  },

  // Mogadishu → Nairobi via Garissa + Marsabit (Driving fallback through arid NE Kenya).
  {
    fromCapitalId: 'SO',
    toCapitalId: 'KE',
    routeType: 'land',
    waypointCityIds: [
      'KE-GARISSA',  // ~810 km from Mogadishu, SO-KE border (Driving fallback)
      // Garissa → Nairobi ~365 km (Driving fallback)
    ],
    notes: 'モガディシュ→[国境]→ガリッサ→ナイロビ',
  },

  {
    fromCapitalId: 'KE',
    toCapitalId: 'UG',
    routeType: 'land',
    notes: 'ナイロビ→[国境 ~660km]→カンパラ',
  },

  {
    fromCapitalId: 'UG',
    toCapitalId: 'RW',
    routeType: 'land',
    notes: 'カンパラ→[国境 ~580km]→キガリ',
  },

  {
    fromCapitalId: 'RW',
    toCapitalId: 'BI',
    routeType: 'land',
    notes: 'キガリ→[国境 ~250km]→ブジュンブラ',
  },

  {
    fromCapitalId: 'BI',
    toCapitalId: 'TZ',
    routeType: 'land',
    notes: 'ブジュンブラ→[タンザニア西部 ~1100km Driving]→ドドマ',
  },

  // Tanzania → Comoros → Madagascar → Mauritius → Seychelles — Indian Ocean.
  {
    fromCapitalId: 'TZ',
    toCapitalId: 'KM',
    routeType: 'mixed',
    seaSegments: [[0, 1]],
    notes: 'ドドマ→[インド洋 ~1100km]→モロニ',
  },

  {
    fromCapitalId: 'KM',
    toCapitalId: 'MG',
    routeType: 'mixed',
    seaSegments: [[0, 1]],
    notes: 'モロニ→[インド洋 ~520km]→アンタナナリボ',
  },

  {
    fromCapitalId: 'MG',
    toCapitalId: 'MU',
    routeType: 'mixed',
    seaSegments: [[0, 1]],
    notes: 'アンタナナリボ→[インド洋 ~1100km]→ポートルイス',
  },

  {
    fromCapitalId: 'MU',
    toCapitalId: 'SC',
    routeType: 'mixed',
    seaSegments: [[0, 1]],
    notes: 'ポートルイス→[インド洋 ~2000km]→ヴィクトリア',
  },

  {
    fromCapitalId: 'SC',
    toCapitalId: 'MZ',
    routeType: 'mixed',
    seaSegments: [[0, 1]],
    notes: 'ヴィクトリア→[インド洋 ~3300km]→マプト',
  },

  {
    fromCapitalId: 'MZ',
    toCapitalId: 'MW',
    routeType: 'land',
    notes: 'マプト→[国境 ~1500km Driving]→リロングウェ',
  },

  {
    fromCapitalId: 'MW',
    toCapitalId: 'ZM',
    routeType: 'land',
    notes: 'リロングウェ→[国境 ~720km]→ルサカ',
  },

  {
    fromCapitalId: 'ZM',
    toCapitalId: 'ZW',
    routeType: 'land',
    notes: 'ルサカ→[国境 ~620km]→ハラレ',
  },

  {
    fromCapitalId: 'ZW',
    toCapitalId: 'BW',
    routeType: 'land',
    notes: 'ハラレ→[国境 ~870km Driving]→ハボロネ',
  },

  {
    fromCapitalId: 'BW',
    toCapitalId: 'NA',
    routeType: 'land',
    waypointCityIds: ['NA-WALVISBAY'],
    notes: 'ハボロネ→[国境]→ウォルビスベイ→ウィントフック',
  },

  {
    fromCapitalId: 'NA',
    toCapitalId: 'ZA',
    routeType: 'land',
    waypointCityIds: ['ZA-JOHANNESBURG'],
    notes: 'ウィントフック→[国境 ~1300km Driving]→ヨハネスブルク→プレトリア',
  },

  {
    fromCapitalId: 'ZA',
    toCapitalId: 'SZ',
    routeType: 'land',
    notes: 'プレトリア→[国境 ~330km]→ムババーネ',
  },

  {
    fromCapitalId: 'SZ',
    toCapitalId: 'LS',
    routeType: 'land',
    notes: 'ムババーネ→[南アフリカ経由 ~700km]→マセル',
  },

  // Lesotho → Angola — long traverse north through SA/NA into Angola.
  {
    fromCapitalId: 'LS',
    toCapitalId: 'AO',
    routeType: 'land',
    waypointCityIds: ['ZA-CAPETOWN'],
    notes: 'マセル→[南アフリカ経由]→ケープタウン→[~3000km Driving]→ルアンダ',
  },

  {
    fromCapitalId: 'AO',
    toCapitalId: 'CD',
    routeType: 'land',
    notes: 'ルアンダ→[国境 ~770km Driving]→キンシャサ',
  },

  // DRC → Republic of Congo — just a ferry across the Congo River.
  {
    fromCapitalId: 'CD',
    toCapitalId: 'CG',
    routeType: 'mixed',
    seaSegments: [[0, 1]], // Congo River crossing (~10 km)
    notes: 'キンシャサ→[コンゴ川フェリー ~10km]→ブラザビル',
  },

  {
    fromCapitalId: 'CG',
    toCapitalId: 'GA',
    routeType: 'land',
    notes: 'ブラザビル→[国境 ~600km]→リーブルヴィル',
  },

  // Gabon → Equatorial Guinea — Bioko Island sea hop.
  {
    fromCapitalId: 'GA',
    toCapitalId: 'GQ',
    routeType: 'mixed',
    seaSegments: [[0, 1]], // Atlantic to Bioko Island
    notes: 'リーブルヴィル→[ギニア湾 ~280km]→マラボ',
  },

  // GQ → Cameroon — back to mainland.
  {
    fromCapitalId: 'GQ',
    toCapitalId: 'CM',
    routeType: 'mixed',
    waypointCityIds: ['CM-DOUALA'],
    seaSegments: [[0, 1]], // Bioko → Douala sea
    notes: 'マラボ→[ギニア湾]→ドゥアラ→ヤウンデ',
  },

  {
    fromCapitalId: 'CM',
    toCapitalId: 'CF',
    routeType: 'land',
    notes: 'ヤウンデ→[国境 ~970km Driving]→バンギ',
  },

  {
    fromCapitalId: 'CF',
    toCapitalId: 'NG',
    routeType: 'land',
    notes: 'バンギ→[カメルーン経由 ~1900km Driving]→アブジャ',
  },

  {
    fromCapitalId: 'NG',
    toCapitalId: 'BJ',
    routeType: 'land',
    waypointCityIds: [
      'NG-IBADAN', // ~530 km from Abuja (Driving fallback)
      'NG-LAGOS',  // ~145 km
      // Lagos → Porto-Novo ~115 km, NG-BJ border
    ],
    notes: 'アブジャ→イバダン→ラゴス→[国境]→ポルトノボ',
  },

  {
    fromCapitalId: 'BJ',
    toCapitalId: 'TG',
    routeType: 'land',
    notes: 'ポルトノボ→[国境 ~140km]→ロメ',
  },

  {
    fromCapitalId: 'TG',
    toCapitalId: 'GH',
    routeType: 'land',
    notes: 'ロメ→[国境 ~190km]→アクラ',
  },

  {
    fromCapitalId: 'GH',
    toCapitalId: 'CI',
    routeType: 'land',
    waypointCityIds: ['GH-KUMASI', 'CI-ABIDJAN'],
    notes: 'アクラ→クマシ→[国境]→アビジャン→ヤムスクロ',
  },

  {
    fromCapitalId: 'CI',
    toCapitalId: 'BF',
    routeType: 'land',
    notes: 'ヤムスクロ→[国境 ~1000km Driving]→ワガドゥグー',
  },

  {
    fromCapitalId: 'BF',
    toCapitalId: 'LR',
    routeType: 'land',
    notes: 'ワガドゥグー→[コートジボワール経由 ~1700km Driving]→モンロビア',
  },

  {
    fromCapitalId: 'LR',
    toCapitalId: 'SL',
    routeType: 'land',
    notes: 'モンロビア→[国境 ~570km Driving]→フリータウン',
  },

  {
    fromCapitalId: 'SL',
    toCapitalId: 'GN',
    routeType: 'land',
    notes: 'フリータウン→[国境 ~330km]→コナクリ',
  },

  {
    fromCapitalId: 'GN',
    toCapitalId: 'GW',
    routeType: 'land',
    notes: 'コナクリ→[国境 ~440km]→ビサウ',
  },

  {
    fromCapitalId: 'GW',
    toCapitalId: 'GM',
    routeType: 'land',
    notes: 'ビサウ→[セネガル経由 ~430km]→バンジュール',
  },

  {
    fromCapitalId: 'GM',
    toCapitalId: 'SN',
    routeType: 'land',
    notes: 'バンジュール→[国境 ~310km]→ダカール',
  },

  // Senegal → Cape Verde — Atlantic ferry.
  {
    fromCapitalId: 'SN',
    toCapitalId: 'CV',
    routeType: 'mixed',
    seaSegments: [[0, 1]],
    notes: 'ダカール→[大西洋 ~620km]→プライア',
  },

  // Cape Verde → São Tomé — Atlantic crossing (CV-MINDELO already
  // appears as the anchor on the ST→RU jump in batch 3).
  {
    fromCapitalId: 'CV',
    toCapitalId: 'ST',
    routeType: 'mixed',
    waypointCityIds: ['CV-MINDELO'],
    seaSegments: [[0, 1], [1, 2]],
    notes: 'プライア→ミンデロ→[ギニア湾 ~3000km]→サントメ',
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
