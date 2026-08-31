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
      'JP-HIMEJI',       // ~55 km — 世界遺産・姫路城
      'JP-OKAYAMA',      // ~85 km — 後楽園
      'JP-FUKUYAMA',     // ~70 km — 鞆の浦
      'JP-HIROSHIMA',    // ~80 km
      'JP-YAMAGUCHI',    // ~135 km
      'JP-SHIMONOSEKI',  // ~50 km
      'JP-KITAKYUSHU',   // ~30 km (Kanmon strait)
      // Kitakyushu→大分 down the east coast on the 東九州自動車道, then
      // along the east coast all the way south to Miyazaki, before
      // looping back west through Kumamoto to Nagasaki.
      'JP-OITA',         // ~145 km
      'JP-NOBEOKA',      // ~95 km — 東九州道
      'JP-MIYAZAKI',     // ~95 km (故郷)
      'JP-KUMAMOTO',     // ~140 km
      'JP-NAGASAKI',     // ~170 km
      'JP-FUKUOKA',      // ~150 km — back north for the Hakata ferry
      // Fukuoka(博多港) → Busan via the Beetle / Camellia Line ferry
      'KR-BUSAN',        // SEA ~210 km
      'KR-DAEGU',        // ~80 km
      'KR-DAEJEON',      // ~130 km
      'KR-CHEONGJU',     // ~35 km
      'KR-SUWON',        // ~85 km — Hwaseong fortress UNESCO site
    ],
    // Indices into [origin=Tokyo, ...waypoints, dest=Seoul]:
    //   0=Tokyo, 1=Yokohama, 2=Hamamatsu, 3=Nagoya, 4=Kyoto,
    //   5=Osaka, 6=Kobe, 7=Himeji, 8=Okayama, 9=Fukuyama, 10=Hiroshima,
    //   11=Yamaguchi, 12=Shimonoseki, 13=Kitakyushu, 14=Oita,
    //   15=Nobeoka, 16=Miyazaki, 17=Kumamoto, 18=Nagasaki, 19=Fukuoka,
    //   20=Busan, 21=Daegu, 22=Daejeon, 23=Cheongju, 24=Suwon, 25=Seoul
    // Only Fukuoka→Busan (19→20) is the sea crossing (Hakata ferry).
    seaSegments: [[19, 20]],
    notes:
      '東京→横浜→浜松→名古屋→京都→大阪→神戸→姫路→岡山→福山→広島→山口→下関→[関門海峡]→北九州→大分→延岡→宮崎(故郷)→熊本→長崎→福岡→[博多-プサン フェリー]→プサン→大邱→大田→清州→水原→ソウル',
  },
  // Seoul → Pyongyang via Kaesong (open via the now-defunct Kaesong
  // Industrial Region road in the post-war geography).
  {
    fromCapitalId: 'KR',
    toCapitalId: 'KP',
    routeType: 'land',
    waypointCityIds: [
      'KR-PAJU',     // ~30 km north of Seoul, DMZ南端
      'KP-KAESONG',  // ~35 km — crosses DMZ (closed border、fallback straight)
      'KP-SARIWON',  // ~70 km — 黄海北道の道都
      // Sariwon → Pyongyang ~60 km
    ],
    notes: 'ソウル→坡州→[38度線/板門店]→開城→沙里院→平壌',
  },
  {
    fromCapitalId: 'KP',
    toCapitalId: 'CN',
    routeType: 'mixed',
    waypointCityIds: [
      'KP-YANGDOK',      // ~120 km — 平壌-元山鉄道の中継、山間
      'KP-WONSAN',       // ~70 km — east coast port
      'KP-HAMHUNG',      // ~100 km north up the east coast
      'KP-KIMCHAEK',     // ~130 km — 旧城津、海岸沿いの中継港
      'KP-CHONGJIN',     // ~140 km — 北東部の港
      'KP-RASON',        // ~70 km — RU 国境の経済特区
      'RU-KHASAN',       // ~50 km — DPRK-RU 国境村、豆満江友誼橋 (国境閉鎖 fallback straight)
      'RU-VLADIVOSTOK',  // ~270 km (driving in Russia)
      'RU-USSURIYSK',    // ~100 km — 鉄道ジャンクション、シベリア鉄道接続
      'RU-LESOZAVODSK',  // ~210 km — ウスリー川沿いの製材業の町
      'RU-BIKIN',        // ~160 km — 沿海地方北端の鉄道の町
      'RU-KHABAROVSK',   // ~230 km (driving in Russia)
      'RU-BIROBIDZHAN',  // ~190 km — ユダヤ自治州の首府
      'CN-SUIFENHE',     // ~480 km — 中露国境の通商都市 (fallback straight)
      'CN-MUDANJIANG',   // ~130 km (driving in China)
      'CN-HARBIN',       // ~280 km (driving in China)
      'CN-CHANGCHUN',    // ~250 km (driving in China)
      'CN-SHENYANG',     // ~280 km (driving)
      'CN-ANSHAN',       // ~90 km — 鉄鋼業の中心
      'CN-DALIAN',       // ~270 km (driving)
      'CN-TIANJIN',      // ~720 km (Bohai SEA ferry)
    ],
    // [origin=Pyongyang, 1=Yangdok, 2=Wonsan, 3=Hamhung, 4=Kimchaek,
    //  5=Chongjin, 6=Rason, 7=Khasan, 8=Vladivostok, 9=Ussuriysk,
    //  10=Lesozavodsk, 11=Bikin, 12=Khabarovsk, 13=Birobidzhan,
    //  14=Suifenhe, 15=Mudanjiang, 16=Harbin, 17=Changchun,
    //  18=Shenyang, 19=Anshan, 20=Dalian, 21=Tianjin, 22=Beijing]
    // 6→7 DPRK-RU border closed; 13→14 China-Russia border (fallback
    // straight); 20→21 Bohai ferry.
    seaSegments: [[6, 7], [13, 14], [20, 21]],
    notes:
      '平壌→咸興→元山→[国境]→ウラジオストク→ハバロフスク→[国境]→ハルビン→瀋陽→大連→[渤海フェリー]→天津→北京',
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
    // [origin=Beijing, 1=Zhangjiakou, 2=Datong, 3=Hohhot, 4=Erenhot,
    //  5=Sainshand, 6=UB]
    // 4→5 (Erenhot→Sainshand) is the China-Mongolia rail border;
    // Directions refuses it, render straight. Index was previously
    // [3,4] — stale after Zhangjiakou was inserted, which wrongly
    // straight-lined the perfectly drivable Hohhot→Erenhot leg and
    // sent the closed border pair to the Directions API every launch.
    seaSegments: [[4, 5]],
    notes: '北京→大同→フフホト→二連浩特→[国境]→サインシャンド→ウランバートル(全長 ~1,600km、トランスモンゴル鉄道沿い)',
  },
  // === User's preferred Pacific island chain (CN→Taiwan→PH) ===
  {
    fromCapitalId: 'MN',
    toCapitalId: 'PH',
    routeType: 'mixed',
    waypointCityIds: [
      'MN-CHOIR',
      'MN-SAINSHAND',
      'CN-ERENHOT',
      'CN-SONIDRIGHT',
      'CN-ULANQAB',
      'CN-HOHHOT',
      'CN-DATONG',
      'CN-XINZHOU',
      'CN-TAIYUAN',
      'CN-LINFEN',
      'CN-YUNCHENG',
      'CN-XIAN',
      'CN-FOPING',
      'CN-HANZHONG',
      'CN-GUANGYUAN',
      'CN-NANCHONG',
      'CN-CHONGQING',
      'CN-FULING',
      'CN-WANZHOU',
      'CN-BADONG',
      'CN-YICHANG',
      'CN-JINGZHOU',
      'CN-WUHAN',
      'CN-MACHENG',
      'CN-LUAN',
      'CN-HEFEI',
      'CN-NANJING',
      'CN-SUZHOU',
      'CN-SHANGHAI',
      'CN-HANGZHOU',
      'CN-QUZHOU',
      'CN-SHANGRAO',
      'CN-NANCHANG',
      'CN-YICHUN-JX',
      'CN-CHANGSHA',
      'CN-HENGYANG',
      'CN-CHENZHOU',
      'CN-SHAOGUAN',
      'CN-GUANGZHOU',
      'CN-SHENZHEN',
      'CN-HONGKONG',
      'MO-MACAU',
      'CN-ZHUHAI',
      'CN-HUIZHOU',
      'CN-SHANWEI',
      'CN-SHANTOU',
      'CN-XIAMEN',
      'CN-FUZHOU',
      'TW-TAIPEI',
      'TW-TAICHUNG',
      'TW-TAINAN',
      'TW-KAOHSIUNG',
      // 高雄→[ルソン海峡]→バタネス諸島→ルソン島に上陸→西海岸を陸路南下→マニラ
      'PH-BASCO',
      'PH-APARRI',
      'PH-LAOAG',
      'PH-VIGAN',
      'PH-SANFERNANDO',
      'PH-DAGUPAN',
    ],
    // [origin=UB, 1=Sainshand, 2=Erenhot, 3=Hohhot, 4=Datong, 5=Taiyuan,
    //  6=Xi'an, 7=Zhengzhou, 8=Wuhan, 9=Nanjing, 10=Shanghai, 11=Hangzhou,
    //  12=Nanchang, 13=Changsha, 14=Guangzhou, 15=Shenzhen, 16=HK,
    //  17=Macau, 18=Zhuhai, 19=Shantou, 20=Xiamen, 21=Fuzhou, 22=Taipei,
    //  23=Taichung, 24=Tainan, 25=Kaohsiung, 26=Manila]
    // [40,41] 深圳→香港 and [41,42] 香港→マカオ are cross-border / over-water
    // (Google returns ZERO_RESULTS), so mark them sea: drawn straight AND the
    // chunker breaks there instead of failing the whole 南京→マカオ batch and
    // falling back to a slow per-leg rebuild (which renders straight while it
    // loads). [42,43] マカオ→珠海, [48,49] 福州→台北(台湾海峡), [52,53] 高雄→マニラ.
    // 52=高雄, 53=バスコ, 54=アパリ, 55=ラオアグ … 58=ダグパン, 59=マニラ(dest)。
    // ルソン海峡は島伝い: [52,53] 高雄→バスコ + [53,54] バスコ→アパリ の2hopだけ
    // 海(直線)。アパリ以降(54→…→59)はルソン島西海岸の陸路で Google が道路追従。
    // 旧 [52,53] 高雄→マニラ 直行(~890km)を島伝いに分割。
    seaSegments: [[2, 3], [40, 41], [41, 42], [42, 43], [48, 49], [52, 53], [53, 54]],
    notes:
      'UB→[国境]→中国東岸縦断→内陸経由で珠江デルタ(深圳/香港/マカオ/珠海)→沿岸を北上→福州から台湾海峡(255km)→台湾→高雄→[ルソン海峡を島伝い]バスコ→アパリ上陸→ルソン島西海岸(ラオアグ/ビガン/サンフェルナンド/ダグパン)→マニラ。',
  },
  {
    fromCapitalId: 'PH',
    toCapitalId: 'BN',
    routeType: 'mixed',
    // ルソン島南下(陸路)→[フェリー]ビサヤ→[フェリー]ミンダナオ(陸路)→[セレベス
    // 海]→サバ州(マレーシア領ボルネオ)に上陸→陸路でブルネイ。ブルネイは MY領ボル
    // ネオに囲まれた飛び地なので海から直接は上陸できず、必ずサバに上陸して陸路で入る。
    // 0=Manila,1=Lucena,2=Naga,3=Legazpi,4=Tacloban,5=Cebu,6=CagayanDeOro,
    // 7=Davao,8=Tawau,9=KotaKinabalu,10=Brunei(dest)。
    // 海(直線)= [3,4]レガスピ→タクロバン, [4,5]タクロバン→セブ, [5,6]セブ→カガヤ
    // ン, [7,8]ダバオ→タワウ(セレベス海)。タワウ→KK→ブルネイ(MY→BN国境)は Google
    // がルート可(実機確認済)で道路追従。
    waypointCityIds: [
      'PH-LUCENA',
      'PH-NAGA',
      'PH-LEGAZPI',
      'PH-TACLOBAN',
      'PH-CEBU',
      'PH-CAGAYANDEORO',
      'PH-DAVAO',
      'MY-TAWAU',
      'MY-KOTAKINABALU',
    ],
    seaSegments: [[3, 4], [4, 5], [5, 6], [7, 8]],
    notes:
      'マニラ→ルソン島南下(ルセナ/ナガ/レガスピ)→[フェリー]レイテ(タクロバン)→[フェリー]セブ→[フェリー]ミンダナオ(カガヤン・デ・オロ)→ダバオ→[セレベス海]→タワウ(サバ州上陸)→コタキナバル→ブルネイ',
  },
  {
    fromCapitalId: 'BN',
    toCapitalId: 'ID',
    routeType: 'mixed',
    // ブルネイ→サラワク州(陸路)→西カリマンタン(インドネシア領ボルネオ、陸路)
    // →[ジャワ海]→ジャカルタ。0=Brunei,1=Miri,2=Kuching,3=Pontianak,
    // 4=Jakarta(dest)。[3,4] ポンティアナック→ジャカルタ(ジャワ海 ~750km)のみ海。
    // BN→MY→ID のボルネオ陸路国境は Google がルート可(実機確認済)で道路追従。
    waypointCityIds: ['MY-MIRI', 'MY-KUCHING', 'ID-PONTIANAK'],
    seaSegments: [[3, 4]],
    notes:
      'ブルネイ→ミリ→クチン(サラワク陸路)→ポンティアナック(西カリマンタン)→[ジャワ海]→ジャカルタ',
  },
  {
    fromCapitalId: 'ID',
    toCapitalId: 'TL',
    routeType: 'mixed',
    // ジャワ→バリ→ヌサトゥンガラ列島を島伝いに東進→西ティモール→陸路国境で
    // ディリ。0=Jakarta,1=Cirebon,…,8=Bali,9=Mataram(ロンボク),10=SumbawaBesar,
    // 11=Bima,12=LabuanBajo(フローレス),13=Ende,14=Maumere,15=Kupang(西ティモール),
    // 16=Atambua,17=Dili(dest)。旧 [8,9] バリ→ディリ直行 ~1,100km 直線を分割。
    // 全 leg が Google DRIVING でルート可能なことを 2026-07-07 に dev の
    // DirectionsService で確認済み(島間フェリー・ID→TL 国境 Atambua→Dili 含めて
    // OK が返る) — seaSegments 不要。
    waypointCityIds: [
      'ID-CIREBON',
      'ID-PURWOKERTO',
      'ID-YOGYAKARTA',
      'ID-MADIUN',
      'ID-SURABAYA',
      'ID-PROBOLINGGO',
      'ID-BANYUWANGI',
      'ID-BALI',
      'ID-MATARAM',
      'ID-SUMBAWABESAR',
      'ID-BIMA',
      'ID-LABUANBAJO',
      'ID-ENDE',
      'ID-MAUMERE',
      'ID-KUPANG',
      'ID-ATAMBUA',
    ],
    notes:
      'ジャワ→バリ→[フェリー]ロンボク→スンバワ→[サペ海峡]フローレス(ラブアンバジョ/エンデ/マウメレ)→[サブ海]クパン→アタンブア→[国境]ディリ',
  },
  {
    fromCapitalId: 'TL',
    toCapitalId: 'SG',
    routeType: 'mixed',
    // 旧: ディリ→マカッサル 775km + パレパレ→バタム 1,823km の2区間が飛びすぎ
    // (実測 scripts/_leggap.mts)。島伝いに分割し最大 443km に。
    //
    // 0=Dili, 1=Kalabahi(アロール), 2=BauBau(ブトン), 3=Benteng(スラヤル),
    // 4=Makassar, 5=Parepare, 6=Balikpapan, 7=Banjarmasin, 8=Palangkaraya,
    // 9=PangkalanBun, 10=TanjungPandan(ブリトゥン), 11=PangkalPinang(バンカ),
    // 12=Palembang, 13=Jambi, 14=Batam, 15=Singapore(dest)。
    //
    // 陸路/海路は 2026-07-30 に dev の DirectionsService で全 leg 実測して決定。
    // 判定基準: Google の返す距離が直線の ~1.6 倍を超える leg は海路(直線)にする
    // — 超える場合は島を大きく迂回する経路が返り、描画が実距離とかけ離れるため。
    //   海路: [0,1] ディリ→カラバヒ(667km/直線125km=5.3倍)、[1,2] カラバヒ→バウバウ
    //   (1,261/370=3.4倍)、[2,3][3,4] は ZERO_RESULTS、[9,10] パンカランブン→
    //   ブリトゥン(1,744/615=2.8倍のカリマタ海峡)、[10,11] 島間、[13,14] ジャンビ→
    //   バタム(897/309=2.9倍)、[14,15] バタム→SG(Google はジョホール大迂回 148km を
    //   返すため直行フェリー ~36km を直線で表現)。
    //   陸路(道路追従): マカッサル→パレパレ 128km、パレパレ→バリクパパン 461km
    //   (マカッサル海峡フェリー、直線比1.07)、バリクパパン→バンジャルマシン 476km、
    //   →パランカラヤ 194km、→パンカランブン 456km、バンカ島内+フェリーの
    //   パンカルピナン→パレンバン 272km、パレンバン→ジャンビ 269km。
    waypointCityIds: [
      'ID-KALABAHI',
      'ID-BAUBAU',
      'ID-BENTENG',
      'ID-MAKASSAR',
      'ID-PAREPARE',
      'ID-BALIKPAPAN',
      'ID-BANJARMASIN',
      'ID-PALANGKARAYA',
      'ID-PANGKALANBUN',
      'ID-TANJUNGPANDAN',
      'ID-PANGKALPINANG',
      'ID-PALEMBANG',
      'ID-JAMBI',
      'ID-BATAM',
    ],
    seaSegments: [[0, 1], [1, 2], [2, 3], [3, 4], [9, 10], [10, 11], [13, 14], [14, 15]],
    notes:
      'ディリ→[バンダ海]アロール→ブトン→スラヤル→マカッサル→パレパレ→[マカッサル海峡]バリクパパン→バンジャルマシン→パランカラヤ→パンカランブン(カリマンタン縦断)→[カリマタ海峡]ブリトゥン→バンカ→パレンバン→ジャンビ(スマトラ)→[海]バタム→[フェリー]シンガポール',
  },
  {
    fromCapitalId: 'SG',
    toCapitalId: 'MY',
    routeType: 'land',
    // 南→北の順。セレンバンはマラッカとKLの間(2.72N)なのでここに置く。
    // 以前は MY→TH 側にマラッカとセレンバンがあり、KL(3.14N)から南へ
    // 逆走してから北上する経路になっていた(実測 scripts/_ordercheck.mts で
    // 「マラッカがKLの後」を検出)。
    waypointCityIds: [
      'MY-JOHORBAHRU',
      'MY-MALACCA',
      'MY-SEREMBAN',
    ],
    notes: 'ジョホール海峡→マラッカ→セレンバン→クアラルンプール',
  },
  // === Mainland SE Asia ===
  {
    fromCapitalId: 'MY',
    toCapitalId: 'TH',
    routeType: 'land',
    // マラッカ(2.19N)とセレンバン(2.72N)は KL(3.14N)の南なので、ここに置くと
    // 北上開始前に逆走する。両方とも SG→MY 側へ移動した。
    waypointCityIds: [
      'MY-TAPAH',
      'MY-IPOH',
      'MY-PENANG',
      'TH-HATYAI',
      'TH-NAKHONSITHAMMARAT',
      'TH-SURATTHANI',
      'TH-CHUMPHON',
      'TH-PRACHUAP',
      'TH-HUAHIN',
    ],
    notes: 'KL→タパ→イポー→ペナン→ハジャイ→スラート→ホアヒン→バンコク',
  },
  {
    fromCapitalId: 'TH',
    toCapitalId: 'KH',
    routeType: 'land',
    waypointCityIds: [
      'TH-PRACHINBURI',
      'TH-ARANYAPRATHET',
      'KH-SISOPHON',
      'KH-SIEMREAP',
      'KH-KAMPONGTHOM',
    ],
    notes: 'バンコク→アンコールワット経由→プノンペン',
  },
  {
    fromCapitalId: 'KH',
    toCapitalId: 'VN',
    routeType: 'land',
    waypointCityIds: [
      'VN-HOCHIMINH',
      'VN-PHANTHIET',
      'VN-NHATRANG',
      'VN-QUYNHON',
      'VN-QUANGNGAI',
      'VN-DANANG',
      'VN-HOIAN',
      'VN-HUE',
      'VN-DONGHOI',
      'VN-VINH',
      'VN-THANHHOA',
      'VN-NINHBINH',
    ],
    notes: 'プノンペン→ホーチミン→ベトナム海岸縦断→ハノイ',
  },
  {
    fromCapitalId: 'VN',
    toCapitalId: 'LA',
    routeType: 'land',
    // ニンビン/タインホア/ヴィンは KH→VN で北上時に通過済み。ここに再掲すると
    // 同じ都市IDに後勝ちのkmが入り、KH→VN側の順序が逆転する(実測で検出)。
    // 削除しても Directions は実道路(ルート8経由)を辿るので描画は変わらない。
    waypointCityIds: [
      'LA-LAKSAO',
      'LA-PAKSAN',
    ],
    // ハノイ→ヴィエンチャン直接 ~470 km、driving可能。HOIAN は南方なので外して KH→VN に移動済み。
    notes: 'ハノイ→[山岳]→ヴィエンチャン',
  },
  {
    fromCapitalId: 'LA',
    toCapitalId: 'MM',
    routeType: 'land',
    waypointCityIds: [
      'TH-NONGKHAI',
      'TH-UDONTHANI',
      'TH-KHONKAEN',
      'TH-PHETCHABUN',
      'TH-PHITSANULOK',
      'TH-TAK',
      'TH-MAESOT',
      'MM-HPAAN',
      'MM-MAWLAMYINE',
      'MM-BAGO',
      'MM-TAUNGOO',
    ],
    // ヴィエンチャン→ネピドー直接 ~700km、タイ・ミャンマー国境を含む。
    // 国境道路が機能しない場合 driving fallback で straight。
    notes: 'ヴィエンチャン→[タイ北部経由]→ネピドー',
  },
  {
    fromCapitalId: 'MM',
    toCapitalId: 'BD',
    routeType: 'mixed',
    // タウングー/バゴーは LA→MM で通過済みのため削除(重複するとkmが後勝ちで
    // LA→MM 側の順序が壊れる)。ネピドー→ヤンゴンは実道路がこの2都市を通る。
    waypointCityIds: [
      'MM-YANGON',
      'MM-HINTHADA',
      'MM-PYAY',
      'MM-MAGWAY',
      'MM-ANN',
      'MM-SITTWE',
    ],
    // points = [0=ネピドー, 1=ヤンゴン, 2=ヒンターダ, 3=ピイ, 4=マグウェ,
    //           5=アン, 6=シットウェ, 7=ダッカ]。海はベンガル湾横断の [6,7] のみ。
    // 旧 [[2,3]] はコメント側の古い添字([origin,1=Yangon,2=Sittwe,3=Dhaka])を
    // そのまま書いたもので、実際にはバゴー→ヤンゴンの陸路を海として直線描画していた。
    seaSegments: [[6, 7]],
    notes: 'ネピドー→ヤンゴン→シットウェー→[ベンガル湾]→ダッカ',
  },
  // === South Asia ===
  {
    fromCapitalId: 'BD',
    toCapitalId: 'BT',
    routeType: 'land',
    waypointCityIds: [
      'BD-BOGRA',
      'BD-RANGPUR',
      'IN-JALPAIGURI',
      'IN-SILIGURI',
      'BT-PHUENTSHOLING',
    ],
    notes: 'ダッカ→シリグリ(印)→ティンプー(ブータン)',
  },
  {
    fromCapitalId: 'BT',
    toCapitalId: 'NP',
    routeType: 'land',
    // プンツォリン/シリグリは BD→BT でブータンへ上がる際に通過済み。ブータンは
    // 行き止まりで同じ道を戻るが、同一都市IDを再掲すると km が後勝ちになり
    // BD→BT 側の順序が壊れる。削除しても実道路は同じ経路を辿る。
    waypointCityIds: [
      'IN-PURNIA',
      'IN-DARBHANGA',
      'IN-MUZAFFARPUR',
      'NP-BIRGUNJ',
      'NP-HETAUDA',
    ],
    // Thimphu→Kathmandu 直接 ~430km、印北部経由。国境含むので driving fallback あり。
    notes: 'ティンプー→[インド北部回廊]→カトマンズ',
  },
  {
    fromCapitalId: 'NP',
    toCapitalId: 'IN',
    routeType: 'land',
    waypointCityIds: [
      'IN-GORAKHPUR',
      'IN-VARANASI',
      'IN-PRAYAGRAJ',
      'IN-LUCKNOW',
      'IN-KANPUR',
      'IN-ETAWAH',
      'IN-AGRA',
      'IN-ALIGARH',
    ],
    notes: 'カトマンズ→バラナシ→ラクナウ→アーグラ→デリー',
  },
  {
    fromCapitalId: 'IN',
    toCapitalId: 'LK',
    routeType: 'mixed',
    // アーグラは NP→IN(カトマンズ→…→アーグラ→デリー)で通過済み。再掲すると
    // km が後勝ちになり NP→IN 側の順序が壊れる(実測で検出)。
    waypointCityIds: [
      'IN-DAUSA',
      'IN-JAIPUR',
      'IN-AJMER',
      'IN-BHILWARA',
      'IN-UDAIPUR',
      'IN-AHMEDABAD',
      'IN-VADODARA',
      'IN-SURAT',
      'IN-VAPI',
      'IN-MUMBAI',
      'IN-PUNE',
      'IN-INDAPUR',
      'IN-SOLAPUR',
      'IN-GULBARGA',
      'IN-HYDERABAD',
      'IN-KURNOOL',
      'IN-ANANTAPUR',
      'IN-BANGALORE',
      'IN-VELLORE',
      'IN-CHENNAI',
    ],
    // points = [0=デリー, 1=ダウサ … 20=チェンナイ, 21=コロンボ](経由地20)。
    // 海はポーク海峡の [20,21] のみ。旧 [[5,6]] は経由地を密化する前の古い添字
    // ([origin,1=Agra,2=Mumbai,3=Hyderabad,4=Bangalore,5=Chennai,6=Colombo])が
    // 残ったもので、実際にはビルワーラ→ウダイプル(内陸の陸路)を海として直線に
    // していた。
    seaSegments: [[20, 21]],
    notes: 'デリー→ジャイプル→ムンバイ→ハイデラバード→バンガロール→チェンナイ→[ポーク海峡]→コロンボ',
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
      'PK-KARACHI',
      'PK-HYDERABAD',
      'PK-NAWABSHAH',
      'PK-LARKANA',
      'PK-SUKKUR',
      'PK-RAHIMYARKHAN',
      'PK-BAHAWALPUR',
      'PK-MULTAN',
      'PK-SAHIWAL',
      'PK-LAHORE',
      'PK-GUJRANWALA',
      'PK-JHELUM',
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
    waypointCityIds: [
      'PK-PESHAWAR',     // ~190 km from Islamabad
      'AF-JALALABAD',    // ~105 km — Khyber Pass highway, AF 側の入口
      // Jalalabad → Kabul ~120 km up the Kabul River gorge
    ],
    // Kandahar(南)/Herat(西) はカブールから外れた逆走になるため本道
    // (カイバル峠 → ジャラーラーバード → カブール) から除外。都市データ
    // は残置、近接時の立ち寄り対象にはなる。
    notes:
      'イスラマバード→ペシャワール→[カイバル峠]→ジャラーラーバード→カブール',
  },
  {
    fromCapitalId: 'AF',
    toCapitalId: 'TJ',
    routeType: 'land',
    // Kabul→Mazar-i-Sharif→Dushanbe via Salang Pass and the Pyanj River.
    waypointCityIds: [
      'AF-PULIKHUMRI',
      'AF-MAZARESHARIF',
      'AF-KUNDUZ',
    ],
    notes: 'カブール→[サラン峠]→マザーリシャリーフ→[国境・パンジ川]→ドゥシャンベ',
  },
  {
    fromCapitalId: 'TJ',
    toCapitalId: 'KG',
    routeType: 'land',
    waypointCityIds: [
      'TJ-KHUJAND',
      'TJ-KONIBODOM',
      'KG-OSH',
      'KG-JALALABAD',
      'KG-TOKTOGUL',
    ],
    notes: 'ドゥシャンベ→ホジャンド→オシュ→[天山]→ビシュケク',
  },
  {
    fromCapitalId: 'KG',
    toCapitalId: 'KZ',
    routeType: 'land',
    waypointCityIds: [
      'KZ-ALMATY',
      'KZ-KAPSHAGAY',
      'KZ-SARYOZEK',
      'KZ-SARYSHAGAN',
      'KZ-BALKHASH',
      'KZ-MOIYNTY',
      'KZ-AKSUAYULY',
      'KZ-KARAGANDA',
    ],
    notes: 'ビシュケク→アルマトイ(思い出)→カラガンダ→アスタナ',
  },
  {
    fromCapitalId: 'KZ',
    toCapitalId: 'UZ',
    routeType: 'land',
    waypointCityIds: [
      'KZ-KARAZHAL',
      'KZ-ZHEZKAZGAN',
      'KZ-KYZYLORDA',
      'KZ-ZHANAKORGAN',
      'KZ-TURKISTAN',
      'KZ-SHYMKENT',
    ],
    notes: 'アスタナ→シムケント→[国境]→タシュケント',
  },
  {
    fromCapitalId: 'UZ',
    toCapitalId: 'TM',
    routeType: 'land',
    waypointCityIds: [
      'UZ-JIZZAKH',
      'UZ-SAMARKAND',
      'UZ-BUKHARA',
      'TM-TURKMENABAT',
      'TM-MARY',
      'TM-TEJEN',
    ],
    notes: 'タシュケント→サマルカンド→ブハラ→[国境]→アシガバート',
  },
  // === Middle East ===
  {
    fromCapitalId: 'TM',
    toCapitalId: 'IR',
    routeType: 'land',
    waypointCityIds: [
      'IR-QUCHAN',
      'IR-BOJNORD',
      'IR-AZADSHAHR',
      'IR-GORGAN',
      'IR-SARI',
      'IR-AMOL',
      'IR-CHALUS',
      'IR-RASHT',
      'IR-QAZVIN',
    ],
    notes: 'アシガバート→[国境]→マシュハド→テヘラン',
  },
  {
    fromCapitalId: 'IR',
    toCapitalId: 'IQ',
    routeType: 'land',
    waypointCityIds: [
      'IR-QOM',
      'IR-KASHAN',
      'IR-ISFAHAN',
      'IR-ABADEH',
      'IR-SHIRAZ',
      'IR-NOORABAD',
      'IR-BEHBAHAN',
      'IR-AHVAZ',
      'IQ-AMARAH',
      'IQ-KUT',
    ],
    notes:
      'テヘラン→イスファハーン→シーラーズ→アフヴァーズ→[国境]→バグダード',
  },
  {
    fromCapitalId: 'IQ',
    toCapitalId: 'KW',
    routeType: 'land',
    waypointCityIds: [
      'IQ-NASIRIYAH',
      'IQ-BASRA',
    ],
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
    waypointCityIds: [
      'AE-RUWAIS',
      'AE-MIRFA',
      'AE-DUBAI',
    ],
    notes: 'ドーハ→ドバイ→アブダビ',
  },
  {
    fromCapitalId: 'AE',
    toCapitalId: 'OM',
    routeType: 'land',
    waypointCityIds: [
      'AE-ALAIN',
      'OM-SOHAR',
    ],
    notes: 'アラブ首長国→オマーン',
  },
  {
    fromCapitalId: 'OM',
    toCapitalId: 'YE',
    routeType: 'land',
    waypointCityIds: [
      'OM-NIZWA',
      'OM-ADAM',
      'OM-HAIMA',
      'OM-THUMRAIT',
      'OM-SALALAH',
      'YE-ALGHAYDAH',
      'YE-SAYHUT',
      'YE-QUSAYAR',
      'YE-MUKALLA',
      'YE-BALHAF',
      'YE-AHWAR',
      'YE-ADEN',
      'YE-TAIZ',
    ],
    notes: 'マスカット→[アラビア半島南海岸]→アデン→タイズ→サナア',
  },
  {
    fromCapitalId: 'YE',
    toCapitalId: 'SA',
    routeType: 'land',
    waypointCityIds: [
      'SA-SAADAH',
      'SA-NAJRAN',
      'SA-ABHA',
      'SA-BISHA',
      'SA-ALBAHA',
      'SA-TAIF',
      'SA-MECCA',
      'SA-JEDDAH',
      'SA-KHURMAH',
      'SA-RANYAH',
      'SA-AFIF',
      'SA-DAWADMI',
      'SA-QUWAIYAH',
    ],
    notes: 'サナア→メッカ→ジェッダ→リヤド',
  },
  {
    fromCapitalId: 'SA',
    toCapitalId: 'JO',
    routeType: 'land',
    waypointCityIds: [
      'SA-MAJMAAH',
      'SA-ZILFI',
      'SA-BURAYDAH',
      'SA-HAIL',
      'SA-SAKAKA',
      'SA-QURAYYAT',
      'JO-MAAN',
    ],
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
    waypointCityIds: [
      'SY-HOMS',
      'SY-ALEPPO',
      'TR-GAZIANTEP',
      'TR-KAHRAMANMARAS',
      'TR-CAPPADOCIA',
    ],
    notes: 'ダマスカス→ホムス→アレッポ→[国境]→カッパドキア→アンカラ',
  },
  {
    fromCapitalId: 'TR',
    toCapitalId: 'CY',
    routeType: 'sea',
    // Mersin (south coast) is the real Cyprus ferry port. The old
    // routing went to Izmir on the WEST Aegean coast — the wrong
    // direction for a southeastward hop to Cyprus.
    waypointCityIds: [
      'TR-AKSARAY',
      'TR-NIGDE',
      'TR-MERSIN',
    ],
    notes: 'アンカラ→メルシン→[地中海フェリー]→キプロス',
  },
  {
    fromCapitalId: 'CY',
    toCapitalId: 'GE',
    routeType: 'mixed',
    waypointCityIds: [
      'TR-ISTANBUL',
      'TR-BOLU',
      'TR-CANKIRI',
      'TR-CORUM',
      'TR-AMASYA',
      'TR-SAMSUN',
      'TR-ORDU',
      'TR-TRABZON',
      'GE-BATUMI',
      'GE-KUTAISI',
    ],
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
    waypointCityIds: [
      'AZ-LANKARAN',
      'IR-ARDABIL',
      'IR-TABRIZ',
    ],
    seaSegments: [[1, 2]], // TABRIZ → Cairo: 3,000 km, fantasy
    notes: 'バクー→タブリーズ→[~3,000km 中東上空]→カイロ',
  },
  // West Africa → Russia: pure ocean/continent overflight, no real route.
  // Used to anchor on CV-MINDELO, but that city is CV→ST's own waypoint
  // (Cape Verde, already visited earlier in the route) — reusing it here
  // overwrote its km and made CV→ST's own chain look reversed. Removed;
  // this leg was already explicitly a fantasy overflight either way.
  {
    fromCapitalId: 'ST',
    toCapitalId: 'RU',
    routeType: 'mixed',
    seaSegments: [[0, 1]], // Direct — the whole leg is over water/air.
    notes: 'サントメ→[~5,600km 大西洋・欧州上空]→モスクワ(直行)',
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

  // Bratislava → Prague via Brno + Jihlava.
  {
    fromCapitalId: 'SK',
    toCapitalId: 'CZ',
    routeType: 'land',
    waypointCityIds: [
      'CZ-BRNO',     // ~135 km from Bratislava, SK-CZ border
      'CZ-JIHLAVA',  // ~95 km
      // Jihlava → Prague ~135 km
    ],
    notes: 'ブラチスラバ→[国境]→ブルノ→イフラヴァ→プラハ',
  },

  // Prague → Warsaw via Liberec → Wrocław → Częstochowa → Łódź.
  {
    fromCapitalId: 'CZ',
    toCapitalId: 'PL',
    routeType: 'land',
    waypointCityIds: [
      'CZ-LIBEREC',       // ~110 km from Prague
      'PL-WROCLAW',       // ~170 km, CZ-PL border
      'PL-CZESTOCHOWA',   // ~190 km
      'PL-LODZ',          // ~140 km
      // Łódź → Warsaw ~135 km
    ],
    notes: 'プラハ→リベレツ→[国境]→ヴロツワフ→チェンストホヴァ→ウッチ→ワルシャワ',
  },

  // Warsaw → Berlin via Łódź → Konin → Poznań.
  {
    fromCapitalId: 'PL',
    toCapitalId: 'DE',
    routeType: 'land',
    waypointCityIds: [
      'PL-KONIN',       // ~120 km
      'PL-POZNAN',      // ~95 km
      'PL-SWIEBODZIN',  // ~96 km — A2 沿い
      // Świebodzin → Berlin ~148 km, PL-DE border
    ],
    notes: 'ワルシャワ→ウッチ→コニン→ポズナン→シフィエボジン→[国境]→ベルリン',
  },

  // ===== Batch 6: Northern Europe (DE → IS), 4 segments =====

  // Berlin → Copenhagen via Wolfsburg + Hamburg + Lübeck + Flensburg + Odense.
  {
    fromCapitalId: 'DE',
    toCapitalId: 'DK',
    routeType: 'land',
    waypointCityIds: [
      'DE-WOLFSBURG',  // ~230 km from Berlin (slight Driving fallback)
      'DE-HAMBURG',    // ~190 km
      'DE-LUEBECK',    // ~70 km
      'DE-FLENSBURG',  // ~150 km
      'DK-ODENSE',     // ~190 km, DE-DK border (Funen via Jutland)
      // Odense → Copenhagen ~165 km via Storebæltsbro
    ],
    notes:
      'ベルリン→ヴォルフスブルク→ハンブルク→リューベック→フレンスブルク→[国境・ユトランド]→オーデンセ→[ストアベルト橋]→コペンハーゲン',
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
    // Örebro/Karlstad already walked on NO→SE (Oslo→Karlstad→Örebro→
    // Stockholm); re-listing them here overwrote their km and broke that
    // segment's order. Directions still draws the real E18 through them
    // on the way back out toward Drammen.
    waypointCityIds: [
      'SE-VASTERAS',  // ~92 km from Stockholm (E18)
      'NO-DRAMMEN',   // ~190 km, SE-NO border (drive past Oslo)
      'NO-HONEFOSS',  // ~47 km
      'NO-GOL',       // ~93 km — Hallingdal valley
      'NO-VOSS',      // ~137 km — mountain pass toward the fjords
      'NO-BERGEN',    // ~67 km
      'FO-TORSHAVN',  // ~672 km North Atlantic
      'IS-AKUREYRI',  // ~688 km North Atlantic
      'IS-BORGARNES', // ~219 km drive across north/west Iceland
      // Borgarnes → Reykjavik ~44 km
    ],
    // [0=Stockholm, 1=Västerås, 2=Drammen, 3=Hønefoss, 4=Gol, 5=Voss,
    //  6=Bergen, 7=Tórshavn, 8=Akureyri, 9=Borgarnes, 10=Reykjavik]
    seaSegments: [[6, 7], [7, 8]], // Bergen → Tórshavn → Akureyri are sea
    notes:
      'ストックホルム→ヴェステロース→エレブルー→カールスタード→[国境]→ドラメン→ホーネフォス→ゴール→ヴォス→ベルゲン→[北大西洋]→トースハウン(フェロー)→[北大西洋]→アークレイリ→ボルガルネス→レイキャビク',
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

  // Luxembourg → Paris via Metz + Reims + Troyes loop.
  {
    fromCapitalId: 'LU',
    toCapitalId: 'FR',
    routeType: 'land',
    waypointCityIds: [
      'FR-METZ',    // ~70 km from Luxembourg, LU-FR border
      'FR-REIMS',   // ~190 km
      'FR-TROYES',  // ~125 km southeast (Champagne)
      // Troyes → Paris ~165 km
    ],
    notes: 'ルクセンブルク→[国境]→メス→ランス→トロワ→パリ',
  },

  // Paris → Monaco via Dijon → Lyon → Avignon → Marseille → Nice (E15/A6/A7/A8).
  {
    fromCapitalId: 'FR',
    toCapitalId: 'MC',
    routeType: 'land',
    waypointCityIds: [
      'FR-SENS',       // ~100 km from Paris (Yonne valley)
      'FR-AUXERRE',    // ~49 km
      'FR-DIJON',      // ~122 km
      'FR-LYON',       // ~174 km
      'FR-AVIGNON',    // ~202 km
      'FR-MARSEILLE',  // ~86 km
      'FR-NICE',       // ~159 km
      // Nice → Monaco ~13 km
    ],
    notes: 'パリ→サンス→オセール→ディジョン→リヨン→アヴィニョン→マルセイユ→ニース→モナコ',
  },

  // Monaco → Andorra via Marseille → Montpellier → Toulouse.
  {
    fromCapitalId: 'MC',
    toCapitalId: 'AD',
    routeType: 'land',
    waypointCityIds: [
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
      'ES-LLEIDA',       // ~190 km from Andorra (AD-ES border)
      'ES-ZARAGOZA',     // ~150 km
      'ES-CALATAYUD',    // ~71 km
      'ES-GUADALAJARA',  // ~151 km
      // Guadalajara → Madrid ~52 km
    ],
    notes: 'アンドラ→[国境]→リェイダ→サラゴサ→カラタユド→グアダラハラ→マドリード',
  },

  // Madrid → Lisbon via Toledo → Mérida → Évora.
  {
    fromCapitalId: 'ES',
    toCapitalId: 'PT',
    routeType: 'land',
    waypointCityIds: [
      'ES-TOLEDO',      // ~67 km from Madrid
      'ES-CIUDADREAL',  // ~98 km — La Mancha
      'ES-MERIDA',      // ~209 km
      'PT-EVORA',       // ~141 km (PT border)
      // Évora → Lisbon ~108 km
    ],
    notes: 'マドリード→トレド→シウダー・レアル→メリダ→[国境]→エヴォラ→リスボン',
  },

  // ===== Batch 8: Mediterranean Europe (PT → MT), 6 segments =====

  // Lisbon → Bern. Long Iberia → France → Switzerland trek; broken
  // into ≤200km hops via small coastal/inland cities.
  {
    fromCapitalId: 'PT',
    toCapitalId: 'CH',
    routeType: 'land',
    waypointCityIds: [
      'PT-COIMBRA',      // ~176 km from Lisbon
      'PT-PORTO',        // ~107 km
      // Porto → northern Spain (Galicia → Castile → Rioja → Aragon)
      'ES-OURENSE',      // ~146 km, PT-ES border (Galicia)
      'ES-PONFERRADA',   // ~107 km
      'ES-LEON',         // ~84 km
      'ES-BURGOS',       // ~156 km
      'ES-LOGRONO',      // ~104 km — Rioja
      'ES-BARCELONA',    // ~132 km
      'ES-GIRONA',       // ~85 km
      'FR-PERPIGNAN',    // ~80 km, ES-FR border
      'CH-GENEVA',       // ~112 km, FR-CH border
      // Geneva → Bern ~130 km
    ],
    notes:
      'リスボン→コインブラ→ポルト→[国境]→オウレンセ→ポンフェラーダ→レオン→ブルゴス→ログローニョ→サラゴサ→リェイダ→バルセロナ→ジローナ→[国境]→ペルピニャン→モンペリエ→アヴィニョン→リヨン→[国境]→ジュネーブ→ベルン',
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
      'AT-GRAZ',      // ~145 km from Vienna
      'IT-TRIESTE',   // ~203 km, AT-IT border
      'IT-VENICE',    // ~116 km
      'IT-BOLOGNA',   // ~130 km
      'IT-FLORENCE',  // ~81 km
      'IT-AREZZO',    // ~61 km
      'IT-ORVIETO',   // ~85 km
      // Orvieto → Rome ~96 km
    ],
    notes:
      'ウィーン→グラーツ→[国境]→トリエステ→ヴェネツィア→ボローニャ→フィレンツェ→アレッツォ→オルヴィエート→ローマ',
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
    // Bologna/Florence already walked on AT→IT (Vienna→...→Bologna→
    // Florence→...→Rome); re-listing them here pulled San Marino
    // backward north before heading south, and overwrote their km.
    waypointCityIds: [
      'IT-SIENA',         // ~50 km
      'IT-PISA',          // ~87 km
      'IT-GROSSETO',      // ~122 km — Tyrrhenian coast
      'IT-CIVITAVECCHIA', // ~93 km
      'IT-LATINA',        // ~115 km (past Rome)
      'IT-CASERTA',       // ~127 km
      'IT-NAPLES',        // ~25 km
      'IT-PALERMO',       // ~314 km incl. Strait of Messina ferry
      // Palermo → Valletta ~267 km Mediterranean
    ],
    // [0=SanMarino, 1=Siena, 2=Pisa, 3=Grosseto, 4=Civitavecchia, 5=Latina,
    //  6=Caserta, 7=Naples, 8=Palermo, 9=Valletta]
    seaSegments: [[7, 8], [8, 9]], // Naples→Palermo + Palermo→Valletta sea
    notes:
      'サンマリノ→ボローニャ→フィレンツェ→シエナ→ピサ→グロッセート→チヴィタヴェッキア→ラティーナ→カゼルタ→ナポリ→[メッシーナ海峡]→パレルモ→[地中海]→バレッタ',
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
      'US-PLATTSBURGH',  // ~90 km, CA-US border (Champlain valley)
      'US-GLENSFALLS',   // ~155 km
      'US-ALBANY',       // ~74 km
      'US-NYC',          // ~250 km
      'US-PHILADELPHIA', // ~150 km
      // Philadelphia → DC ~225 km (Driving fallback)
    ],
    notes: 'オタワ→モントリオール→[国境]→プラッツバーグ→グレンズフォールズ→オールバニ→ニューヨーク→フィラデルフィア→ワシントンD.C.',
  },

  // DC → Mexico City via the I-95/I-10/I-35 corridor, fully diced into
  // ≤200 km hops through real cities.
  {
    fromCapitalId: 'US',
    toCapitalId: 'MX',
    routeType: 'land',
    waypointCityIds: [
      'US-RICHMOND',      // ~170 km from DC
      'US-ROANOKERAPIDS', // ~122 km
      'US-RALEIGH',       // ~116 km
      'US-CHARLOTTE',     // ~265 km (slight Driving fallback)
      'US-GREENVILLE',    // ~165 km
      'US-ATLANTA',       // ~225 km (slight Driving fallback)
      'US-ANNISTON',      // ~134 km
      'US-BIRMINGHAM',    // ~92 km
      'US-MONTGOMERY',    // ~145 km
      'US-EVERGREEN',     // ~121 km
      'US-MOBILE',        // ~132 km
      'US-NEWORLEANS',    // ~225 km
      'US-BATONROUGE',    // ~130 km
      'US-LAFAYETTE',     // ~85 km
      'US-BEAUMONT',      // ~190 km
      'US-HOUSTON',       // ~135 km
      'US-COLUMBUS',      // ~113 km — Colorado River, TX
      'US-SANANTONIO',    // ~192 km
      'US-COTULLA',       // ~131 km
      'US-LAREDO',        // ~104 km
      'MX-NUEVOLAREDO',   // ~5 km (Río Grande border crossing)
      'MX-MONTERREY',     // ~225 km (slight Driving fallback)
      'MX-SALTILLO',      // ~85 km
      'MX-MATEHUALA',     // ~201 km
      'MX-SLP',           // ~170 km
      'MX-QUERETARO',     // ~185 km
      // Querétaro → Mexico City ~184 km
    ],
    notes:
      'ワシントン→リッチモンド→ロアノークラピッズ→ローリー→シャーロット→グリーンビル→アトランタ→アニストン→バーミングハム→モンゴメリー→エバーグリーン→モビール→ニューオーリンズ→バトンルージュ→ラファイエット→ボーモント→ヒューストン→コロンバス→サンアントニオ→コツーラ→ラレド→[国境]→ヌエボ・ラレド→モンテレイ→サルティーヨ→マテワラ→サン・ルイス・ポトシ→ケレタロ→メキシコシティ',
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
      'MX-COMITAN',         // ~120 km — Chiapas highlands
      'GT-HUEHUETENANGO',   // ~126 km, MX-GT border
      'GT-QUETZALTENANGO',  // ~85 km
      // Quetzaltenango → Guatemala City ~210 km (slight Driving fallback)
    ],
    notes:
      'メキシコシティ→プエブラ→テワカン→オアハカ→フチタン→トゥクストラ→コミタン→[国境]→ウエウエテナンゴ→ケツァルテナンゴ→グアテマラシティ',
  },

  // Guatemala City → Belmopan via Puerto Barrios.
  {
    fromCapitalId: 'GT',
    toCapitalId: 'BZ',
    routeType: 'land',
    waypointCityIds: [
      'GT-ZACAPA',        // ~111 km from Guatemala City (Motagua valley)
      'GT-PUERTOBARRIOS', // ~131 km
      // Puerto Barrios → Belmopan ~165 km, GT-BZ border
    ],
    notes: 'グアテマラシティ→サカパ→プエルトバリオス→[国境]→ベルモパン',
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
      'CR-SANISIDRO', // ~75 km from San José (Pan-American Highway)
      'PA-DAVID',     // ~175 km, CR-PA border
      'PA-SANTIAGO',  // ~210 km (Driving fallback)
      // Santiago → Panama City ~250 km (Driving fallback)
    ],
    notes: 'サンホセ→サンイシドロ→[国境]→ダビ→サンティアゴ・デ・ベラグアス→パナマシティ',
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

  // Havana → Kingston via Cienfuegos + Camagüey + Holguín + Santiago.
  {
    fromCapitalId: 'CU',
    toCapitalId: 'JM',
    routeType: 'mixed',
    waypointCityIds: [
      'CU-CIENFUEGOS',     // ~250 km from Havana along south coast
      'CU-CAMAGUEY',       // ~330 km (Driving fallback)
      'CU-HOLGUIN',        // ~270 km (Driving fallback)
      'CU-SANTIAGODECUBA', // ~140 km
      // Santiago de Cuba → Kingston ~280 km Caribbean
    ],
    seaSegments: [[4, 5]],
    notes:
      'ハバナ→シエンフエゴス→カマグエイ→オルギン→サンティアゴ・デ・クーバ→[カリブ海]→キングストン',
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
    // Cúcuta/Valencia already walked on KN→CO (arriving into Bogotá via
    // the same Andean corridor); re-listing them here overwrote their km.
    waypointCityIds: [
      'CO-TUNJA',       // ~120 km from Bogotá (Boyacá highlands)
      'CO-BUCARAMANGA', // ~178 km
      'VE-MERIDA',      // ~330 km, CO-VE border (Driving fallback through Andes)
      'VE-BARINAS',     // ~104 km — Andean foothills / Llanos
      'VE-ACARIGUA',    // ~152 km
      // Valencia → Caracas ~150 km
    ],
    notes: 'ボゴタ→トゥンハ→ブカラマンガ→[国境]→メリダ→バリナス→アカリグア→カラカス',
  },

  // Caracas → Georgetown via Maturín → Ciudad Guayana then the Essequibo
  // frontier. The VE coast and interior are densified along real roads
  // (Caracas→Higuerote→Barcelona→Maturín; Ciudad Guayana→Upata→Guasipati
  // →Tumeremo on Troncal 10). The final Tumeremo→Georgetown leg (~364 km)
  // is the roadless Essequibo jungle border — there is NO through road
  // between Venezuela and Guyana here (the real overland link to
  // Georgetown runs via Brazil/Lethem), so it is left as one long leg
  // like the Darién.
  {
    fromCapitalId: 'VE',
    toCapitalId: 'GY',
    routeType: 'land',
    waypointCityIds: [
      'VE-HIGUEROTE',     // ~88 km from Caracas (Caribbean coast)
      'VE-BARCELONA',     // ~159 km
      'VE-MATURIN',       // ~170 km
      'VE-CIUDADGUAYANA', // ~190 km
      'VE-UPATA',         // ~46 km
      'VE-GUASIPATI',     // ~81 km
      'VE-TUMEREMO',      // ~57 km — last VE town before the jungle
      // Tumeremo → Georgetown ~364 km roadless Essequibo frontier (no road)
    ],
    notes: 'カラカス→イゲロテ→バルセロナ→マトゥリン→シウダー・グアヤナ→ウパタ→グアシパティ→トゥメレモ→[国境・エセキボ密林（道路なし）]→ジョージタウン',
  },

  // Georgetown → Paramaribo via Linden.
  {
    fromCapitalId: 'GY',
    toCapitalId: 'SR',
    routeType: 'land',
    waypointCityIds: [
      'GY-LINDEN',        // ~110 km from Georgetown
      'GY-NEWAMSTERDAM',  // ~93 km — Berbice River
      'SR-NICKERIE',      // ~69 km, GY-SR border (Corentyne ferry)
      // Nieuw Nickerie → Paramaribo ~197 km
    ],
    notes: 'ジョージタウン→リンデン→ニューアムステルダム→[国境]→ニーウ・ニッケリー→パラマリボ',
  },

  // Paramaribo → Brasília down the Amazon then SE across the Cerrado.
  // Rio Branco (Acre, Brazil's far-SW corner) was dropped — it sat
  // ~2000 km off the SE-bound line and forced a Manaus→RioBranco(SW)
  // →Porto Velho(back E) backtrack. The corridor now runs monotonic:
  // Amazon estuary → Manaus → south to Porto Velho → E to Palmas.
  {
    fromCapitalId: 'SR',
    toCapitalId: 'BR',
    routeType: 'mixed',
    waypointCityIds: [
      'BR-MACAPA',     // ~880 km, SR-FR-BR borders (estuary)
      'BR-MANAUS',     // ~1330 km along the Amazon (river/Driving fallback)
      'BR-PORTOVELHO', // ~900 km S up the Madeira (Driving fallback)
      'BR-PALMAS',     // ~1700 km E across the southern Amazon/Cerrado
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
      'BR-RIOVERDE',       // ~214 km — Cerrado soy belt
      'BR-JATAI',          // ~85 km
      'BR-MINEIROS',       // ~95 km
      'BR-COSTARICA',      // ~124 km
      'BR-COXIM',          // ~172 km — Pantanal north edge
      'BR-CAMPOGRANDE',    // ~219 km
      'BR-DOURADOS',       // ~196 km
      'BR-NAVIRAI',        // ~113 km
      'BR-MUNDONOVO',      // ~97 km — tri-border (Paraná river)
      'PY-CIUDADDELESTE',  // ~178 km, BR-PY border
      'PY-CORONELOVIEDO',  // ~184 km
      // Coronel Oviedo → Asunción ~116 km
    ],
    notes: 'ブラジリア→ゴイアニア→リオ・ヴェルデ→ジャタイ→ミネイロス→コスタ・リカ→コシン→カンポ・グランデ→ドウラドス→ナヴィライ→ムンド・ノーヴォ→[国境]→シウダー・デル・エステ→コロネル・オビエド→アスンシオン',
  },

  // Asunción → Montevideo via Corrientes + Rosario + Salto.
  {
    fromCapitalId: 'PY',
    toCapitalId: 'UY',
    routeType: 'land',
    waypointCityIds: [
      'AR-FORMOSA',    // ~119 km from Asunción, PY-AR border (Pilcomayo)
      'AR-CORRIENTES', // ~157 km
      'AR-GOYA',       // ~191 km — Paraná river
      'AR-ESQUINA',    // ~100 km
      'AR-LAPAZ',      // ~83 km (Entre Ríos)
      'AR-PARANA',     // ~138 km
      'AR-ROSARIO',    // ~135 km
      'AR-VICTORIA',   // ~59 km
      'AR-VILLAGUAY',  // ~136 km
      'AR-CONCORDIA',  // ~108 km, on the Uruguay river
      'UY-SALTO',      // ~5 km, AR-UY border (Salto Grande dam)
      'UY-PAYSANDU',   // ~105 km
      'UY-MERCEDES',   // ~104 km
      'UY-TRINIDAD',   // ~109 km
      // Trinidad → Montevideo ~167 km
    ],
    notes: 'アスンシオン→[国境]→フォルモサ→コリエンテス→ゴヤ→エスキーナ→ラ・パス→パラナ→ロサリオ→ビクトリア→ビジャグアイ→コンコルディア→[国境]→サルト→パイサンドゥ→メルセデス→トリニダー→モンテビデオ',
  },

  // Montevideo → Buenos Aires — Río de la Plata ferry.
  {
    fromCapitalId: 'UY',
    toCapitalId: 'AR',
    routeType: 'mixed',
    seaSegments: [[0, 1]],
    notes: 'モンテビデオ→[ブケブス フェリー ~210km]→ブエノスアイレス',
  },

  // Buenos Aires → Santiago via Rosario → Córdoba → Río Cuarto → San Luis → Mendoza.
  {
    fromCapitalId: 'AR',
    toCapitalId: 'CL',
    routeType: 'land',
    waypointCityIds: [
      'AR-SANNICOLAS',  // ~220 km from Buenos Aires (Paraná river)
      'AR-BELLVILLE',   // ~194 km
      'AR-VILLAMARIA',  // ~57 km
      'AR-CORDOBA',     // ~142 km
      'AR-RIOCUARTO',   // ~210 km
      'AR-SANLUIS',     // ~210 km
      'AR-LAPAZMZA',    // ~114 km (La Paz, Mendoza)
      'AR-MENDOZA',     // ~137 km
      // Mendoza → Santiago ~360 km via Cristo Redentor pass (Driving fallback)
    ],
    notes:
      'ブエノスアイレス→サン・ニコラス→ロサリオ→ベル・ビル→ビジャ・マリア→コルドバ→リオ・クアルト→サン・ルイス→ラ・パス→メンドーサ→[アンデス峠]→サンティアゴ',
  },

  // Santiago → La Paz via Viña del Mar → La Serena → Copiapó → Antofagasta → Calama → Uyuni → Oruro.
  {
    fromCapitalId: 'CL',
    toCapitalId: 'BO',
    routeType: 'land',
    waypointCityIds: [
      'CL-VINADELMAR', // ~120 km from Santiago
      'CL-LOSVILOS',   // ~123 km — Ruta 5 coast
      'CL-OVALLE',     // ~148 km
      'CL-LASERENA',   // ~125 km
      'CL-VALLENAR',   // ~156 km — Huasco valley
      'CL-COPIAPO',    // ~140 km
      'CL-CHANARAL',   // ~117 km — Atacama coast
      'CL-TALTAL',     // ~105 km
      'CL-ANTOFAGASTA',// ~196 km
      'CL-CALAMA',     // ~210 km (slight Driving fallback)
      'CL-OLLAGUE',    // ~155 km — CL-BO border, 3,700m
      'BO-UYUNI',      // ~172 km, salt flat plateau
      'BO-CHALLAPATA', // ~173 km — Lake Poopó
      'BO-ORURO',      // ~110 km
      'BO-HUARI',      // ~50 km
      'BO-POTOSI',     // ~181 km — silver-mine UNESCO city
      // Potosí → Sucre ~81 km
    ],
    notes:
      'サンティアゴ→ビーニャ・デル・マル→ロス・ビロス→ラ・セレーナ→バジェナル→コピアポ→チャニャラル→タルタル→アントファガスタ→カラマ→[国境]→オジャグエ→ウユニ塩湖→チャジャパタ→オルロ→ウアリ→ポトシ→スクレ',
  },

  // La Paz → Lima via Cochabamba + Puno + Arequipa + Nazca.
  {
    fromCapitalId: 'BO',
    toCapitalId: 'PE',
    routeType: 'land',
    waypointCityIds: [
      'BO-COCHABAMBA', // ~390 km from La Paz (Driving fallback)
      'BO-CARACOLLO',  // ~114 km
      'BO-PATACAMAYA', // ~88 km
      'BO-DESAGUADERO',// ~141 km — BO-PE border, Lake Titicaca
      'PE-PUNO',       // ~132 km
      'PE-AREQUIPA',   // ~300 km (Driving fallback)
      'PE-CAMANA',     // ~127 km — Pacific coast
      'PE-CHALA',      // ~185 km
      'PE-NAZCA',      // ~136 km
      'PE-ICA',        // ~121 km — desert oasis
      'PE-CANETE',     // ~131 km
      // Cañete → Lima ~135 km
    ],
    notes: 'ラパス→コチャバンバ→カラコジョ→パタカマヤ→[国境・チチカカ湖]→デサグアデロ→プーノ→アレキパ→カマナ→チャラ→ナスカ→イカ→カニェテ→リマ',
  },

  // Lima → Quito via Chimbote + Trujillo + Chiclayo + Piura + Guayaquil + Cuenca.
  {
    fromCapitalId: 'PE',
    toCapitalId: 'EC',
    routeType: 'land',
    waypointCityIds: [
      'PE-HUACHO',      // ~121 km from Lima (Pacific coast)
      'PE-CASMA',       // ~197 km
      'PE-CHIMBOTE',    // ~53 km
      'PE-TRUJILLO',    // ~135 km
      'PE-CHICLAYO',    // ~205 km (slight Driving fallback)
      'PE-PIURA',       // ~210 km (slight Driving fallback)
      'PE-SULLANA',     // ~33 km
      'PE-TUMBES',      // ~151 km
      'EC-MACHALA',     // ~65 km, PE-EC border (banana coast)
      'EC-GUAYAQUIL',   // ~119 km
      'EC-CUENCA',      // ~190 km
      'EC-RIOBAMBA',    // ~143 km — Andean spine
      'EC-AMBATO',      // ~47 km
      // Ambato → Quito ~119 km
    ],
    notes:
      'リマ→ワチョ→カスマ→チンボテ→トルヒーリョ→チクラヨ→ピウラ→スジャナ→トゥンベス→[国境]→マチャラ→グアヤキル→クエンカ→リオバンバ→アンバート→キト',
  },

  // ===== Batch 13: Pacific + Oceania (EC → TV), 14 segments =====

  // Quito → Canberra. The longest leg in the route — Pacific traverse
  // anchored on Galápagos and Tahiti so the line touches real points.
  {
    fromCapitalId: 'EC',
    toCapitalId: 'AU',
    routeType: 'mixed',
    waypointCityIds: [
      'EC-GALAPAGOS',   // ~1000 km Pacific
      'US-HONOLULU',    // ~7700 km NW — the empty E-Pacific has no islands
      'KI-CHRISTMASIS', // ~2200 km S — Kiritimati (Line Islands)
      'PF-PAPEETE',     // ~2700 km SE — Tahiti
      'CK-RAROTONGA',   // ~1150 km W — Cook Islands
      'NC-NOUMEA',      // ~3900 km W across the dateline — New Caledonia
      // Nouméa → Canberra ~2000 km Coral/Tasman Sea
    ],
    // Every leg is open ocean. Galápagos→Hawaii is the single
    // unavoidable empty stretch (the E Pacific has no islands); from
    // Hawaii on, the line island-hops Kiritimati→Tahiti→Rarotonga→
    // Nouméa→Canberra instead of one 6500 km void.
    seaSegments: [[0, 1], [1, 2], [2, 3], [3, 4], [4, 5], [5, 6], [6, 7]],
    notes:
      'キト→ガラパゴス→[太平洋 ~7700km]→ホノルル→キリスィマスィ→パペーテ→ラロトンガ→ヌーメア→キャンベラ（島伝い）',
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
      'EG-ELALAMEIN',     // ~110 km — 北アフリカ戦線の地中海岸
      'EG-MARSAMATRUH',   // ~150 km
      'EG-SIDIBARRANI',   // ~130 km — エジプト西端の海岸
      'LY-TOBRUK',        // ~195 km, EG-LY border (Sallum 国境)
      'LY-DERNA',         // ~160 km — 緑の山地の海岸都市
      'LY-ALMARJ',        // ~170 km — ジャバル・アフダルの古都
      'LY-BENGHAZI',      // ~85 km
      'LY-AJDABIYA',      // ~150 km — キレナイカ十字路 (south of Benghazi)
      'LY-RASLANUF',      // ~150 km — シルト湾の石油港
      'LY-SIRTE',         // ~200 km — シルト湾岸
      'LY-MISRATA',       // ~225 km
      'LY-KHOMS',         // ~120 km — レプティス・マグナ
      // Khoms → Tripoli ~120 km coastal
    ],
    notes:
      'カイロ→アレクサンドリア→エル・アラメイン→マルサ・マトルーフ→シディ・バラニ→[国境]→トブルク→デルナ→ベンガジ→アジュダービヤー→ラス・ラヌフ→シルテ→ミスラタ→ホムス→トリポリ（地中海岸）',
  },

  // Tripoli → Tunis along the Mediterranean coast (the real coastal
  // highway). The old routing dived ~430 km south to the Ghadames
  // Sahara oasis then doubled back ~360 km north to Sfax — a pure
  // backtrack. Now hugs the coast via Gabès.
  {
    fromCapitalId: 'LY',
    toCapitalId: 'TN',
    routeType: 'land',
    waypointCityIds: [
      'LY-SABRATHA',     // ~80 km from Tripoli
      'TN-BENGARDANE',   // ~125 km, crosses LY-TN border at Ras Ajdir
      'TN-GABES',        // ~140 km up the coast
      'TN-SFAX',         // ~135 km up the coast
      'TN-SOUSSE',       // ~140 km
      // Sousse → Tunis ~140 km
    ],
    notes:
      'トリポリ→サブラタ→[国境]→ベン・ガルダン→ガベス→スファックス→スース→チュニス（地中海岸）',
  },

  // Tunis → Algiers via Sousse (passed) → Annaba → Constantine.
  {
    fromCapitalId: 'TN',
    toCapitalId: 'DZ',
    routeType: 'land',
    waypointCityIds: [
      'DZ-ANNABA',       // ~280 km from Tunis, TN-DZ border (Driving fallback)
      'DZ-CONSTANTINE',  // ~155 km
      'DZ-SETIF',        // ~110 km — 高原のローマ都市
      'DZ-BOUIRA',       // ~140 km — カビリー山地の麓
      // Bouira → Algiers ~110 km
    ],
    notes: 'チュニス→[国境]→アンナバ→コンスタンティーヌ→セティフ→ブイラ→アルジェ',
  },

  // Algiers → Rabat along the Mediterranean / High Plateau corridor.
  // Old routing jumped Algiers→Fès (~790 km) in one straight leg; now
  // hugs the coast west to Oran, crosses the border at Oujda, then
  // through Taza to Fès.
  {
    fromCapitalId: 'DZ',
    toCapitalId: 'MA',
    routeType: 'land',
    waypointCityIds: [
      'DZ-CHLEF',       // ~170 km from Algiers
      'DZ-MOSTAGANEM',  // ~115 km — 地中海岸
      'DZ-ORAN',        // ~70 km — 西アルジェリア最大の港
      'DZ-TLEMCEN',     // ~110 km — ザイヤーン朝の都
      'MA-OUJDA',       // ~60 km, DZ-MA border (closed border, fallback straight)
      'MA-TAZA',        // ~200 km — タザ回廊
      'MA-FES',         // ~95 km
      // Fès → Rabat ~170 km
    ],
    notes: 'アルジェ→シェリフ→モスタガネム→オラン→トレムセン→[国境]→ウジダ→タザ→フェズ→ラバト',
  },

  // Rabat → Nouakchott via the Atlantic coastal road across Western
  // Sahara (Laâyoune → Nouadhibou → Nouakchott).
  {
    fromCapitalId: 'MA',
    toCapitalId: 'MR',
    routeType: 'land',
    waypointCityIds: [
      'MA-CASABLANCA', // ~95 km from Rabat
      'MA-SAFI',       // ~205 km — 陶器の港町
      'MA-ESSAOUIRA',  // ~95 km — 風の街
      'MA-AGADIR',     // ~120 km
      'MA-GUELMIM',    // ~170 km — サハラの門
      'MA-TANTAN',     // ~120 km — 大西洋岸の港
      'MA-TARFAYA',    // ~195 km
      'MA-LAAYOUNE',   // ~95 km, Western Sahara
      'EH-BOUJDOUR',   // ~185 km — 灯台の漁港
      'EH-DAKHLA',     // ~300 km — 空白の西サハラ海岸 (砂漠 leg)
      'MR-BIRGANDOUS', // ~250 km — 国境手前の砂漠 (砂漠 leg)
      'MR-NOUADHIBOU', // ~75 km, MA-MR border
      'MR-CHAMI',      // ~130 km — 中間の新興の町
      // Chami → Nouakchott ~220 km (Banc d'Arguin coast)
    ],
    notes:
      'ラバト→カサブランカ→サフィ→エッサウィラ→アガディール→グルミム→タンタン→タルファヤ→ラユーン→ブジュドゥール→[西サハラ砂漠]→ダフラ→[国境]→ヌアディブー→シャミ→ヌアクショット',
  },

  // Nouakchott → Bamako along the "Road of Hope" (Route de l'Espoir),
  // a single ENE Sahel corridor. The old routing detoured ~440 km
  // NORTH to Atar (Adrar desert), then ran SE to Néma and BACK west
  // to Ayoun — a zigzag. Now monotonic W→E→S: Ayoun then Néma (both
  // on the corridor) then south into Mali. Atar (northern outlier)
  // dropped from the path.
  {
    fromCapitalId: 'MR',
    toCapitalId: 'ML',
    routeType: 'land',
    waypointCityIds: [
      'MR-BOUTILIMIT',     // ~150 km — イスラム学問の町
      'MR-ALEG',           // ~140 km — ブラクナ地方の中心
      'MR-GUEROU',         // ~210 km
      'MR-KIFFA',          // ~60 km — アサバ地方の主都
      'MR-AYOUNELATROUS',  // ~195 km along the Road of Hope
      'MR-TIMBEDRA',       // ~160 km
      'MR-NEMA',           // ~100 km, last MR town
      'ML-NARA',           // ~160 km, MR-ML border
      'ML-KOLOKANI',       // ~185 km
      // Kolokani → Bamako ~105 km
    ],
    notes: 'ヌアクショット→ブティリミット→アレグ→ゲル→キファ→アユン・エル・アトロウス→ティンベドラ→ネマ→[国境]→ナラ→コロカニ→バマコ',
  },

  // Bamako → Niamey via Mopti + Timbuktu + Gao on the Niger River.
  {
    fromCapitalId: 'ML',
    toCapitalId: 'NE',
    routeType: 'land',
    waypointCityIds: [
      'ML-FANA',      // ~120 km from Bamako
      'ML-SEGOU',     // ~115 km — バンバラ王国旧都
      'ML-SAN',       // ~155 km — 内陸デルタの町
      'ML-MOPTI',     // ~155 km — ニジェール川の港
      'ML-TIMBUKTU',  // ~310 km (北部マリ紛争地、Driving fallback)
      'ML-GAO',       // ~390 km (北部マリ紛争地、Driving fallback)
      'NE-TILLABERI', // ~290 km, ML-NE 三国国境地帯 (Driving fallback)
      // Tillabéri → Niamey ~100 km
    ],
    notes:
      'バマコ→ファナ→セグー→サン→モプティ→[北部マリ]→トンブクトゥ→ガオ→[国境]→ティラベリ→ニアメ',
  },

  // Niamey → N'Djamena via Tahoua + Zinder + Agadez (Trans-Sahara Highway 1).
  {
    fromCapitalId: 'NE',
    toCapitalId: 'TD',
    routeType: 'land',
    waypointCityIds: [
      'NE-FILINGUE',     // ~140 km from Niamey
      'NE-ZINDERTAHOUA', // ~215 km — タウア
      'NE-AGADEZ',       // ~370 km north into the Aïr massif (サハラ砂漠 leg)
      'NE-ZINDER',       // ~370 km southeast (サハラ砂漠 leg)
      'NE-GOURE',        // ~140 km — チャド湖方面の町
      'NE-DIFFA',        // ~255 km — チャド湖西方の州都
      'TD-BOL',          // ~310 km, NE-TD border (チャド湖周辺、Driving fallback)
      'TD-MAO',          // ~75 km — カネム地方の中心
      // Mao → N'Djamena ~250 km (Driving fallback)
    ],
    notes:
      'ニアメ→フィランゲ→タウア→[アイル砂漠]→アガデス→ザンデール→グレ→ディファ→[国境・チャド湖]→ボル→マオ→ンジャメナ',
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

  // Khartoum → Juba down the White Nile corridor (~31°E), monotonic
  // south. The old routing went El Obeid → Wau (far SW, Bahr el
  // Ghazal) → Malakal (NE on the Nile) — a W→E zigzag off the
  // corridor. Wau (western outlier) dropped; the natural line is
  // El Obeid → Malakal → Juba along the river.
  {
    fromCapitalId: 'SD',
    toCapitalId: 'SS',
    routeType: 'land',
    waypointCityIds: [
      'SD-KOSTI',    // ~260 km — 白ナイルの河港
      'SS-RENK',     // ~360 km, SD-SS border (白ナイル沿い)
      'SS-MELUT',    // ~150 km — 油田地帯
      'SS-MALAKAL',  // ~130 km S on the White Nile
      'SS-BOR',      // ~370 km S through the Sudd (湿地、Driving fallback)
      // Bor → Juba ~150 km
    ],
    notes: 'ハルツーム→コスティ→エルオベイド→[国境]→レンク→メルト→マラカル→[スッド湿地]→ボル→ジュバ（白ナイル回廊）',
  },

  // Juba → Asmara via Aksum + Mekele + Massawa.
  {
    fromCapitalId: 'SS',
    toCapitalId: 'ER',
    routeType: 'land',
    waypointCityIds: [
      'ET-GAMBELA',   // ~503 km from Juba (remote roadless SS border, fallback straight)
      'ET-GORE',      // ~105 km — 西部高原への登り
      'ET-BEDELE',    // ~95 km — ビール醸造の町
      'ET-NEKEMTE',   // ~75 km — 西ウェレガの中心
      'ET-INJIBARA',  // ~210 km — アウィ高地
      'ET-BAHIRDAR',  // ~85 km — タナ湖畔
      'ET-GONDAR',    // ~110 km — 世界遺産の古都
      'ET-SEKOTA',    // ~170 km — ワグ・ヒムラの山岳
      'ET-MEKELE',    // ~110 km — ティグライ高原
      'ET-AKSUM',     // ~110 km (Driving fallback)
      'ER-MASSAWA',   // ~180 km, ET-ER border (Driving fallback)
      // Massawa → Asmara ~65 km (steep escarpment road)
    ],
    notes: 'ジュバ→[エチオピア低地]→ガンベラ→ゴレ→ベデレ→ネケムテ→インジバラ→バハルダル→ゴンダール→セコタ→メケレ→アクスム→[国境]→マッサワ→アスマラ',
  },

  // Asmara → Djibouti down the Eritrean Red Sea coast via Massawa and
  // Assab. The Tio→Assab stretch is empty Danakil desert coast with no
  // real town — left as one long desert leg.
  {
    fromCapitalId: 'ER',
    toCapitalId: 'DJ',
    routeType: 'land',
    waypointCityIds: [
      'ER-TIO',      // ~190 km — ダナキル海岸
      'ER-ASSAB',    // ~270 km — ダナキル砂漠海岸 (砂漠 leg)
      // Assab → Djibouti ~165 km, ER-DJ border
    ],
    notes: 'アスマラ→マッサワ→ティオ→[ダナキル砂漠]→アッサブ→[国境]→ジブチ',
  },

  {
    fromCapitalId: 'DJ',
    toCapitalId: 'ET',
    routeType: 'land',
    waypointCityIds: [
      'ET-AYSHA',     // ~110 km, DJ-ET border — 鉄道沿いの町
      'ET-DIREDAWA',  // ~150 km — 東部の商都
      'ET-AWASH',     // ~200 km — アワッシュ渓谷
      'ET-ADAMA',     // ~110 km — ナズレト
      // Adama → Addis Ababa ~80 km
    ],
    notes: 'ジブチ→[国境]→アイシャ→ディレダワ→アワッシュ→アダマ→アディスアベバ',
  },

  // Addis Ababa → Mogadishu via Dire Dawa (passed) → Kismayo coast.
  {
    fromCapitalId: 'ET',
    toCapitalId: 'SO',
    routeType: 'land',
    // Adama/Dire Dawa already walked on DJ→ET (arriving Addis Ababa via
    // Aysha→Dire Dawa→Awash→Adama); re-listing them here overwrote their km.
    waypointCityIds: [
      'ET-MIESO',      // ~185 km from Addis Ababa — アワッシュ渓谷東縁
      'ET-HARAR',      // ~45 km — 世界遺産の城壁都市
      'ET-JIJIGA',     // ~75 km — ソマリ州都
      'ET-DEGEHABUR',  // ~150 km — オガデン
      'ET-KEBRIDEHAR', // ~180 km — オガデン砂漠
      'ET-GODE',       // ~125 km — シェベリ川
      'SO-KISMAYO',    // ~710 km, ET-SO ソマリア内陸 (紛争・無道、fallback straight)
      // Kismayo → Mogadishu ~410 km, ソマリア内陸海岸 (紛争、fallback straight)
    ],
    notes: 'アディスアベバ→アダマ→ミエソ→ディレダワ→ハラール→ジジガ→デゲハブール→ケブリダハル→ゴデ→[国境・ソマリア内陸]→キスマヨ→モガディシュ',
  },

  // Mogadishu → Nairobi via Garissa + Marsabit (Driving fallback through arid NE Kenya).
  {
    fromCapitalId: 'SO',
    toCapitalId: 'KE',
    routeType: 'land',
    waypointCityIds: [
      'KE-GARISSA',  // ~690 km from Mogadishu, SO-KE ソマリア内陸 (紛争・無道、fallback straight)
      'KE-MWINGI',   // ~185 km — 東部キツイ郡
      'KE-THIKA',    // ~110 km — ナイロビ近郊
      // Thika → Nairobi ~40 km
    ],
    notes: 'モガディシュ→[国境・ソマリア内陸]→ガリッサ→ムウィンギ→ティカ→ナイロビ',
  },

  // Nairobi → Kampala via the Rift Valley (Nakuru → Eldoret) and the
  // Malaba/Busia border, then Jinja on the Nile.
  {
    fromCapitalId: 'KE',
    toCapitalId: 'UG',
    routeType: 'land',
    waypointCityIds: [
      'KE-NAKURU',   // ~140 km — リフトバレー
      'KE-ELDORET',  // ~130 km — 高地の町
      'KE-WEBUYE',   // ~55 km — 西ケニア
      'UG-JINJA',    // ~175 km, KE-UG border — ナイル源流
      // Jinja → Kampala ~70 km
    ],
    notes: 'ナイロビ→ナクル→エルドレット→ウェブイエ→[国境]→ジンジャ→カンパラ',
  },

  // Kampala → Kigali via Masaka → Mbarara → Kabale and the Gatuna/Katuna border.
  {
    fromCapitalId: 'UG',
    toCapitalId: 'RW',
    routeType: 'land',
    waypointCityIds: [
      'UG-MASAKA',   // ~120 km — ヴィクトリア湖西岸
      'UG-MBARARA',  // ~125 km — 西部の商都
      'UG-KABALE',   // ~105 km — 千の丘の高地
      // Kabale → Kigali ~80 km, UG-RW border
    ],
    notes: 'カンパラ→マサカ→ムバララ→カバレ→[国境]→キガリ',
  },

  {
    fromCapitalId: 'RW',
    toCapitalId: 'BI',
    routeType: 'land',
    notes: 'キガリ→[国境 ~250km]→ブジュンブラ',
  },

  // Gitega → Dodoma across western Tanzania: Kigoma on Lake Tanganyika,
  // then the Central Line corridor (Uvinza → Tabora → Singida).
  {
    fromCapitalId: 'BI',
    toCapitalId: 'TZ',
    routeType: 'land',
    waypointCityIds: [
      'TZ-KIGOMA',   // ~165 km, BI-TZ border — タンガニーカ湖港
      'TZ-UVINZA',   // ~90 km — 製塩の町
      'TZ-NGURUKA',  // ~75 km — 中央線鉄道
      'TZ-KALIUA',   // ~80 km — タバコ栽培地
      'TZ-TABORA',   // ~110 km — ウニャンウェジの中心
      'TZ-NZEGA',    // ~100 km — 金鉱の町
      'TZ-SINGIDA',  // ~185 km — 中央高原
      'TZ-MANYONI',  // ~105 km — 鉄道の町
      // Manyoni → Dodoma ~110 km
    ],
    notes: 'ギテガ→[国境]→キゴマ→ウヴィンザ→ングルカ→カリウア→タボラ→ンゼガ→シンギダ→マニョニ→ドドマ',
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

  // Maputo → Lilongwe up the EN1 coast (Xai-Xai → Maxixe → Vilankulo),
  // then inland on the Beira corridor (Chimoio) and the Tete corridor
  // (Catandica → Tete) before crossing into Malawi at Dedza.
  {
    fromCapitalId: 'MZ',
    toCapitalId: 'MW',
    routeType: 'land',
    waypointCityIds: [
      'MZ-XAIXAI',     // ~150 km — リンポポ河口
      'MZ-MAXIXE',     // ~215 km — イニャンバネ湾
      'MZ-VILANKULO',  // ~205 km — バザルト諸島の玄関
      'MZ-MAMBONE',    // ~120 km — サベ川河口
      'MZ-MUXUNGUE',   // ~125 km — EN1分岐
      'MZ-INCHOPE',    // ~145 km — ベイラ回廊分岐
      'MZ-CHIMOIO',    // ~45 km — マニカ州都
      'MZ-CATANDICA',  // ~125 km — マニカ高地
      'MZ-GURO',       // ~70 km — テテ回廊
      'MZ-TETE',       // ~145 km — ザンベジ川の要衝
      'MW-DEDZA',      // ~215 km, MZ-MW border — 陶器の高原町
      // Dedza → Lilongwe ~75 km
    ],
    notes: 'マプト→シャイシャイ→マシシェ→ヴィランクロ→ノヴァ・マンボネ→ムシュンゲ→インショペ→シモイオ→カタンディカ→グロ→テテ→[国境]→デザ→リロングウェ',
  },

  // Lilongwe → Lusaka via Mchinji border → Chipata → the Great East Road
  // (Petauke → Nyimba → Luangwa bridge) → Chongwe.
  {
    fromCapitalId: 'MW',
    toCapitalId: 'ZM',
    routeType: 'land',
    waypointCityIds: [
      'MW-MCHINJI',  // ~100 km, MW-ZM border
      'ZM-CHIPATA',  // ~30 km — 東部州都
      'ZM-PETAUKE',  // ~160 km — グレートイースト道
      'ZM-NYIMBA',   // ~65 km
      'ZM-LUANGWA',  // ~125 km — ルアングワ橋
      'ZM-CHONGWE',  // ~190 km — ルサカ近郊
      // Chongwe → Lusaka ~40 km
    ],
    notes: 'リロングウェ→[国境]→ムチンジ→チパタ→ペタウケ→ニンバ→ルアングワ→チョングウェ→ルサカ',
  },

  // Lusaka → Harare via Kafue → the Chirundu bridge over the Zambezi →
  // Karoi → Chinhoyi.
  {
    fromCapitalId: 'ZM',
    toCapitalId: 'ZW',
    routeType: 'land',
    waypointCityIds: [
      'ZM-KAFUE',     // ~45 km — カフエ川
      'ZW-CHIRUNDU',  // ~80 km, ZM-ZW border — ザンベジ橋
      'ZW-KAROI',     // ~125 km
      'ZW-CHINHOYI',  // ~80 km — マショナランド西
      // Chinhoyi → Harare ~100 km
    ],
    notes: 'ルサカ→カフエ→[国境・ザンベジ橋]→チルンドゥ→カロイ→チノイ→ハラレ',
  },

  // Harare → Gaborone via Kadoma → Gweru → Bulawayo, then the
  // Plumtree/Ramokgwebana border and the A1 (Francistown → Palapye).
  {
    fromCapitalId: 'ZW',
    toCapitalId: 'BW',
    routeType: 'land',
    waypointCityIds: [
      'ZW-KADOMA',       // ~130 km
      'ZW-GWERU',        // ~125 km — ミッドランズ州都
      'ZW-BULAWAYO',     // ~150 km — 第二の都市
      'BW-FRANCISTOWN',  // ~160 km, ZW-BW border
      'BW-PALAPYE',      // ~160 km — 中部の炭鉱町
      'BW-MAHALAPYE',    // ~70 km
      // Mahalapye → Gaborone ~190 km
    ],
    notes: 'ハラレ→カドマ→グウェル→ブラワヨ→[国境]→フランシスタウン→パラピエ→マハラピエ→ハボロネ',
  },

  // Gaborone → Windhoek across the Kalahari on the Trans-Kalahari Highway
  // (Jwaneng → Kang → Ghanzi → Mamuno border → Gobabis), then out to the
  // Atlantic at Walvis Bay. Kang→Ghanzi (~263 km) is empty central
  // Kalahari with no town; Walvis Bay→Windhoek (~266 km) crosses the
  // Namib Desert — both left as desert legs.
  {
    fromCapitalId: 'BW',
    toCapitalId: 'NA',
    routeType: 'land',
    waypointCityIds: [
      'BW-JWANENG',      // ~120 km — ダイヤモンド鉱山
      'BW-KANG',         // ~220 km — カラハリの給油地
      'BW-GHANZI',       // ~263 km — カラハリ中央 (砂漠 leg)
      'BW-CHARLESHILL',  // ~155 km
      'BW-MAMUNO',       // ~35 km, BW-NA border
      'NA-WITVLEI',      // ~155 km
      'NA-GOBABIS',      // ~50 km — 牧畜の中心
      'NA-OKAHANDJA',    // ~215 km (Windhoek を経由)
      'NA-KARIBIB',      // ~110 km
      'NA-USAKOS',       // ~25 km
      'NA-SWAKOPMUND',   // ~135 km — 大西洋岸の保養地
      'NA-WALVISBAY',    // ~30 km — 大西洋の港
      // Walvis Bay → Windhoek ~266 km (ナミブ砂漠 B2、砂漠 leg)
    ],
    notes: 'ハボロネ→ジュワネング→カング→[カラハリ砂漠]→ガンジ→チャールズヒル→[国境]→マムノ→ウィットフライ→ゴバビス→オカハンジャ→カリビブ→ウサコス→スワコプムント→ウォルビスベイ→[ナミブ砂漠]→ウィントフック',
  },

  // Windhoek → Pretoria down the B1 (Rehoboth → Mariental → Keetmanshoop),
  // across the Orange at the Nakop/Vioolsdrif... actually the Ariamsvlei
  // border to Upington, then Kuruman → Vryburg → Klerksdorp → Johannesburg.
  {
    fromCapitalId: 'NA',
    toCapitalId: 'ZA',
    routeType: 'land',
    waypointCityIds: [
      'NA-REHOBOTH',     // ~85 km
      'NA-MARIENTAL',    // ~170 km
      'NA-KEETMANSHOOP', // ~215 km — 南部の中心
      'NA-GRUNAU',       // ~130 km
      'NA-KARASBURG',    // ~50 km
      'ZA-KEIMOES',      // ~230 km, NA-ZA border (オレンジ川沿い砂漠)
      'ZA-UPINGTON',     // ~40 km — 北ケープの灌漑都市
      'ZA-OLIFANTSHOEK', // ~155 km
      'ZA-KURUMAN',      // ~90 km — 「カラハリの目」
      'ZA-VRYBURG',      // ~140 km — 畜産の中心
      'ZA-KLERKSDORP',   // ~195 km
      'ZA-JOHANNESBURG', // ~155 km
      // Johannesburg → Pretoria ~55 km
    ],
    notes: 'ウィントフック→レホボト→マリエンタル→キートマンスフープ→グリューナウ→カラスブルク→[国境]→ケイモス→アピントン→オリファンツフック→クルマン→フライブルフ→クラークスドルプ→ヨハネスブルク→プレトリア',
  },

  {
    fromCapitalId: 'ZA',
    toCapitalId: 'SZ',
    routeType: 'land',
    waypointCityIds: [
      'ZA-WITBANK',  // ~100 km — エムパランガ
      'ZA-ERMELO',   // ~105 km — ハイベルトの分岐
      // Ermelo → Mbabane ~120 km, ZA-SZ border
    ],
    notes: 'プレトリア→ウィットバンク→エルメロ→[国境]→ムババーネ',
  },

  // Mbabane → Maseru through KwaZulu-Natal / Free State: Newcastle →
  // Ladysmith → Harrismith → Bethlehem → Ficksburg border.
  {
    fromCapitalId: 'SZ',
    toCapitalId: 'LS',
    routeType: 'land',
    waypointCityIds: [
      'ZA-NEWCASTLE',   // ~200 km
      'ZA-LADYSMITH',   // ~90 km — ボーア戦争の町
      'ZA-HARRISMITH',  // ~70 km
      'ZA-BETHLEHEM',   // ~80 km — 東フリーステート
      'ZA-FICKSBURG',   // ~70 km, ZA-LS border (チェリーの町)
      // Ficksburg → Maseru ~70 km
    ],
    notes: 'ムババーネ→ニューカッスル→レディスミス→ハリスミス→ベツレヘム→フィックスバーグ→[国境]→マセル',
  },

  // Lesotho → Angola — south to Cape Town via Bloemfontein and the N1
  // Karoo (Colesberg → Beaufort West → Worcester), then the long
  // ~2,800 km Atlantic/Namib-coast hop up to Luanda (no road, sea/desert).
  {
    fromCapitalId: 'LS',
    toCapitalId: 'AO',
    routeType: 'mixed',
    waypointCityIds: [
      'ZA-BLOEMFONTEIN',  // ~130 km — 司法首都
      'ZA-COLESBERG',     // ~210 km — N1の宿場
      'ZA-RICHMOND',      // ~135 km — 大カルー
      'ZA-BEAUFORTWEST',  // ~165 km — カルーの中心
      'ZA-LAINGSBURG',    // ~185 km
      'ZA-WORCESTER',     // ~140 km — ワインの谷
      'ZA-PAARL',         // ~45 km — ワイン産地
      'ZA-CAPETOWN',      // ~55 km — 喜望峰の都市
      // Cape Town → Luanda ~2,800 km (大西洋・ナミブ海岸、道なし=直線)
    ],
    // [0=Maseru, 1=Bloemfontein, 2=Colesberg, 3=Richmond, 4=Beaufort West,
    //  5=Laingsburg, 6=Worcester, 7=Paarl, 8=Cape Town, 9=Luanda]
    // 8→9 is the long Atlantic/Namib-coast hop with no road.
    seaSegments: [[8, 9]],
    notes: 'マセル→ブルームフォンテーン→コールズバーグ→リッチモンド→ボーフォートウェスト→レインズバーグ→ウースター→パール→ケープタウン→[~2,800km 大西洋岸]→ルアンダ',
  },

  // Luanda → Kinshasa up the Angolan coast (N'zeto → Soyo at the Congo
  // mouth), across into DRC at Matadi, then up to Kinshasa.
  {
    fromCapitalId: 'AO',
    toCapitalId: 'CD',
    routeType: 'land',
    waypointCityIds: [
      'AO-NZETO',    // ~185 km — 海岸の町
      'AO-SOYO',     // ~135 km — コンゴ川河口の石油の町
      'CD-MATADI',   // ~125 km, AO-CD border — コンゴ川の港
      'CD-KISANTU',  // ~200 km — 植物園の町
      // Kisantu → Kinshasa ~80 km
    ],
    notes: 'ルアンダ→ンゼト→ソヨ→[国境]→マタディ→キサントゥ→キンシャサ',
  },

  // DRC → Republic of Congo — just a ferry across the Congo River.
  {
    fromCapitalId: 'CD',
    toCapitalId: 'CG',
    routeType: 'mixed',
    seaSegments: [[0, 1]], // Congo River crossing (~10 km)
    notes: 'キンシャサ→[コンゴ川フェリー ~10km]→ブラザビル',
  },

  // Brazzaville → Libreville via the RN1 (Mindouli → Loutété → Dolisie),
  // then NW into Gabon (Tchibanga → Mouila → Lambaréné). The
  // Dolisie→Tchibanga border stretch (~240 km) is dense forest with no
  // town.
  {
    fromCapitalId: 'CG',
    toCapitalId: 'GA',
    routeType: 'land',
    waypointCityIds: [
      'CG-MINDOULI',   // ~90 km — プール県
      'CG-LOUTETE',    // ~90 km — セメント工業
      'CG-DOLISIE',    // ~105 km — 第三の都市
      'GA-TCHIBANGA',  // ~240 km, CG-GA border (森林 leg)
      'GA-NDENDE',     // ~65 km — ニャンガ州
      'GA-MOUILA',     // ~70 km — ングニエ州都
      'GA-LAMBARENE',  // ~160 km — シュバイツァーの町
      'GA-BIFOUN',     // ~45 km
      'GA-KANGO',      // ~60 km
      // Kango → Libreville ~80 km
    ],
    notes: 'ブラザビル→ミンドゥリ→ルテテ→ドリジー→[国境・森林]→チバンガ→ンデンデ→ムイラ→ランバレネ→ビフン→カンゴ→リーブルヴィル',
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

  // Yaoundé → Bangui via the eastern Cameroon forest road (Ayos →
  // Abong-Mbang → Bertoua → Batouri), crossing into CAR at Berbérati.
  {
    fromCapitalId: 'CM',
    toCapitalId: 'CF',
    routeType: 'land',
    waypointCityIds: [
      'CM-AYOS',        // ~115 km — ニョン川
      'CM-ABONGMBANG',  // ~75 km — 上ニョン
      'CM-BERTOUA',     // ~85 km — 東部州都
      'CM-BATOURI',     // ~80 km — 金鉱とカカオ
      'CF-BERBERATI',   // ~160 km, CM-CF border — CAR西部
      'CF-CARNOT',      // ~75 km
      'CF-BODA',        // ~190 km
      'CF-MBAIKI',      // ~75 km — ロバイエの林業
      // Mbaïki → Bangui ~90 km
    ],
    notes: 'ヤウンデ→アヨス→アボン・ンバン→ベルトゥア→バトゥリ→[国境]→ベルベラティ→カルノ→ボダ→ンバイキ→バンギ',
  },

  // Bangui → Abuja the long way around through Cameroon: west to Bouar,
  // cross to Garoua-Boulaï, up the Adamawa plateau (Ngaoundéré → Garoua),
  // into Nigeria at Yola, then across the NE (Gombe → Bauchi → Jos) to
  // Abuja.
  {
    fromCapitalId: 'CF',
    toCapitalId: 'NG',
    routeType: 'land',
    waypointCityIds: [
      'CF-BOSSEMBELE',    // ~140 km from Bangui
      'CF-YALOKE',        // ~60 km
      'CF-BOUAR',         // ~180 km — 巨石遺跡の町
      'CM-GAROUABOULAI',  // ~115 km, CF-CM border
      'CM-MEIGANGA',      // ~75 km — アダマワ高原
      'CM-NGAOUNDERE',    // ~125 km — 高原鉄道の終点
      'CM-GAROUA',        // ~220 km — ベヌエ川 (高原降下)
      'NG-YOLA',          // ~100 km, CM-NG border — アダマワ州都
      'NG-NUMAN',         // ~60 km — ベヌエ・ゴンゴラ合流
      'NG-GOMBE',         // ~130 km — 北東部州都
      'NG-BAUCHI',        // ~145 km — ヤンカリの玄関
      'NG-JOS',           // ~110 km — 高原都市
      'NG-AKWANGA',       // ~125 km — ナサラワ
      // Akwanga → Abuja ~100 km
    ],
    notes: 'バンギ→ボッセンベレ→ヤロケ→ブアール→[国境]→ガルア・ブライ→メイガンガ→ンガウンデレ→ガルア→[国境]→ヨラ→ヌマン→ゴンベ→バウチ→ジョス→アクワンガ→アブジャ',
  },

  {
    fromCapitalId: 'NG',
    toCapitalId: 'BJ',
    routeType: 'land',
    waypointCityIds: [
      'NG-LOKOJA',     // ~165 km from Abuja — 二大河の合流
      'NG-EGBE',       // ~140 km — コギ州南西
      'NG-ILORIN',     // ~115 km — クワラ州都
      'NG-OGBOMOSHO',  // ~50 km — ヨルバの商都
      'NG-IBADAN',     // ~90 km
      'NG-LAGOS',      // ~115 km
      // Lagos → Porto-Novo ~85 km, NG-BJ border
    ],
    notes: 'アブジャ→ロコジャ→エグベ→イロリン→オグボモショ→イバダン→ラゴス→[国境]→ポルトノボ',
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

  // Accra → Yamoussoukro via Kumasi, then down to the coast and west
  // along it (Cape Coast → Takoradi → Elubo border → Aboisso → Abidjan).
  {
    fromCapitalId: 'GH',
    toCapitalId: 'CI',
    routeType: 'land',
    waypointCityIds: [
      'GH-KUMASI',      // ~200 km — アシャンティの古都
      'GH-CAPECOAST',   // ~180 km — 奴隷貿易の城塞
      'GH-TAKORADI',    // ~60 km — 西部の港
      'GH-ELUBO',       // ~120 km, GH-CI border — タノ川
      'CI-ABOISSO',     // ~60 km
      'CI-ABIDJAN',     // ~90 km — 経済の中心
      // Abidjan → Yamoussoukro ~215 km
    ],
    notes: 'アクラ→クマシ→ケープコースト→タコラディ→[国境]→エルボ→アボワッソ→アビジャン→ヤムスクロ',
  },

  // Yamoussoukro → Ouagadougou north via Bouaké → Ferkessédougou →
  // Ouangolodougou border → Banfora → Bobo-Dioulasso → Koudougou.
  {
    fromCapitalId: 'CI',
    toCapitalId: 'BF',
    routeType: 'land',
    waypointCityIds: [
      'CI-BOUAKE',          // ~100 km — 第二の都市
      'CI-FERKESSEDOUGOU',  // ~210 km — 北部の鉄道分岐
      'CI-OUANGOLO',        // ~40 km, near CI-BF border
      'BF-BANFORA',         // ~85 km — カスケード
      'BF-BOBODIOULASSO',   // ~80 km — 第二の都市
      'BF-HOUNDE',          // ~90 km — 綿花地帯
      'BF-BOROMO',          // ~70 km
      'BF-KOUDOUGOU',       // ~85 km — 第三の都市
      // Koudougou → Ouagadougou ~90 km
    ],
    notes: 'ヤムスクロ→ブアケ→フェルケセドゥグ→ワンゴロドゥグ→[国境]→バンフォラ→ボボ・ディウラッソ→ウンデ→ボロモ→クドゥグ→ワガドゥグー',
  },

  // Ouagadougou → Monrovia SW through Burkina (Koudougou → Bobo →
  // Banfora) then down the western Côte d'Ivoire highlands (Odienné →
  // Touba → Man → Danané) into Guinée Forestière (Nzérékoré) and Liberia
  // (Ganta → Gbarnga → Kakata).
  {
    fromCapitalId: 'BF',
    toCapitalId: 'LR',
    routeType: 'land',
    // Koudougou/Boromo/Houndé/Bobo-Dioulasso/Banfora/Ferkessédougou already
    // walked on CI→BF (arriving Ouagadougou via the same corridor);
    // re-listing them here overwrote their km. Directions still draws the
    // real road back down that corridor toward Boundiali.
    waypointCityIds: [
      'CI-BOUNDIALI',       // ~140 km
      'CI-ODIENNE',         // ~120 km — 北西部
      'CI-TOUBA',           // ~135 km
      'CI-MAN',             // ~100 km — 西部の山地
      'CI-DANANE',          // ~70 km
      'GN-NZEREKORE',       // ~90 km, CI-GN border — ギニア森林地帯
      'LR-GANTA',           // ~55 km, GN-LR border
      'LR-GBARNGA',         // ~60 km
      'LR-KAKATA',          // ~110 km
      // Kakata → Monrovia ~50 km
    ],
    notes: 'ワガドゥグー→クドゥグ→ボロモ→ウンデ→ボボ・ディウラッソ→バンフォラ→[国境]→フェルケセドゥグ→ブンジアリ→オジエンネ→トゥバ→マン→ダナネ→[国境]→ンゼレコレ→[国境]→ガンタ→グバルンガ→カカタ→モンロビア',
  },

  // Monrovia → Freetown via Tubmanburg → the Mano River border at Zimmi
  // → Pujehun → Bo → Moyamba.
  {
    fromCapitalId: 'LR',
    toCapitalId: 'SL',
    routeType: 'land',
    waypointCityIds: [
      'LR-TUBMANBURG',  // ~65 km — ボミの旧鉄鉱山
      'SL-ZIMMI',       // ~75 km, LR-SL border — マノ川
      'SL-PUJEHUN',     // ~45 km
      'SL-BO',          // ~70 km — 第二の都市
      'SL-MOYAMBA',     // ~80 km
      // Moyamba → Freetown ~95 km
    ],
    notes: 'モンロビア→タブマンバーグ→[国境・マノ川]→ジミ→プジェフン→ボー→モヤンバ→フリータウン',
  },

  {
    fromCapitalId: 'SL',
    toCapitalId: 'GN',
    routeType: 'land',
    notes: 'フリータウン→[国境 ~330km]→コナクリ',
  },

  // Conakry → Bissau up the coast (Boffa → Boké), crossing into
  // Guinea-Bissau at Québo, then Gabú → Bafatá.
  {
    fromCapitalId: 'GN',
    toCapitalId: 'GW',
    routeType: 'land',
    waypointCityIds: [
      'GN-BOFFA',  // ~75 km — リオ・ポンゴ
      'GN-BOKE',   // ~90 km — ボーキサイトの町
      'GN-QUEBO',  // ~85 km, GN-GW border
      'GW-GABU',   // ~135 km — 東部の交易都市
      'GW-BAFATA', // ~50 km — ジェバ川
      // Bafatá → Bissau ~70 km
    ],
    notes: 'コナクリ→ボファ→ボケ→[国境]→ケボ→ガブ→バファタ→ビサウ',
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
