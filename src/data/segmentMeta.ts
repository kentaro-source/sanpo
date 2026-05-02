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

  // Lisbon → Bern. Long route back through Iberia, France and Switzerland.
  {
    fromCapitalId: 'PT',
    toCapitalId: 'CH',
    routeType: 'land',
    waypointCityIds: [
      'PT-COIMBRA',    // ~200 km from Lisbon
      'PT-PORTO',      // ~120 km
      // Porto → Spain west coast → Barcelona → Marseille → Lyon → Geneva.
      // Most of these legs lean on Driving fallback; the route runs along
      // the A28/AP-1 / E70 / A8 highways the way a road-tripper would.
      'ES-ZARAGOZA',   // ~705 km (heavy Driving fallback)
      'ES-BARCELONA',  // ~290 km (Driving fallback)
      'FR-MONTPELLIER',// ~340 km (Driving fallback, FR border)
      'FR-LYON',       // ~305 km (Driving fallback)
      'CH-GENEVA',     // ~150 km (CH border)
      // Geneva → Bern ~160 km
    ],
    notes:
      'リスボン→コインブラ→ポルト→[国境]→サラゴサ→バルセロナ→[国境]→モンペリエ→リヨン→[国境]→ジュネーブ→ベルン',
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

  // San Marino → Valletta via Bologna → Florence → Rome (passed) →
  // Naples → Palermo → Mediterranean ferry to Malta.
  {
    fromCapitalId: 'SM',
    toCapitalId: 'MT',
    routeType: 'mixed',
    waypointCityIds: [
      'IT-BOLOGNA',  // ~110 km from San Marino
      'IT-FLORENCE', // ~105 km
      'IT-NAPLES',   // ~470 km (Driving fallback, traverses Lazio)
      'IT-PALERMO',  // ~310 km incl. Strait of Messina ferry
      // Palermo → Valletta ~510 km Mediterranean
    ],
    seaSegments: [[3, 4], [4, 5]], // Naples→Palermo + Palermo→Valletta sea
    notes:
      'サンマリノ→ボローニャ→フィレンツェ→ナポリ→[メッシーナ海峡]→パレルモ→[地中海]→バレッタ',
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
