/**
 * Cities/capitals the user has visited in real life.
 * When player passes near these in-game (proximity 200km), they get a "memory bonus" (+2🎲 vs +1🎲 normal).
 *
 * Source: CLAUDE.md travel history (2026-04-29 update).
 */
export const REAL_LIFE_VISITED_CITY_IDS = new Set<string>([
  // 日本: 全47都道府県の県庁所在地を訪問済み（cities.tsに収録ある分のみ）
  'JP-OSAKA',
  'JP-KYOTO',
  'JP-NAGOYA',
  'JP-FUKUOKA',
  'JP-NAGASAKI',
  'JP-MIYAZAKI',
  'JP-SAPPORO',
  'JP-YOKOHAMA',
  'JP-KOBE',
  'JP-NARA',

  // 韓国 (×3 visits)
  'KR-BUSAN',
  'KR-CHEONGJU',

  // 中国 (×2 visits, capital未訪問)
  'CN-DALIAN',
  'CN-SHANGHAI',
  'CN-ZHUHAI',
  'CN-HONGKONG',

  // マカオ (UN非加盟)
  'MO-MACAU',

  // 台湾 (UN非加盟)
  'TW-TAIPEI',
  'TW-TAINAN',
  'TW-TAICHUNG',
  'TW-KAOHSIUNG',

  // インド (capital未訪問)
  'IN-KOLKATA',

  // イタリア
  'IT-MILAN',
  'IT-VENICE',
  'IT-FLORENCE',

  // カザフスタン (capital未訪問、アルマトイのみ)
  'KZ-ALMATY',

  // ロシア (capital未訪問、極東のみ)
  'RU-VLADIVOSTOK',
  'RU-KHABAROVSK',

  // アメリカ (capital未訪問)
  'US-LASVEGAS',

  // アイスランド
  'IS-AKUREYRI',

  // オーストラリア (capital未訪問)
  'AU-PERTH',
  'AU-MELBOURNE',
  'AU-SYDNEY',
  'AU-GOLDCOAST',

  // ミャンマー (capital未訪問)
  'MM-YANGON',

  // マレーシア
  'MY-MALACCA',

  // フィリピン
  'PH-CEBU',

  // ベトナム (×2 visits)
  'VN-HOIAN',

  // カンボジア (capital未訪問)
  'KH-SIEMREAP',
]);

/** UN加盟国の首都で、実生活で訪問済みの国（首都自体を訪問）*/
export const REAL_LIFE_VISITED_CAPITAL_IDS = new Set<string>([
  'JP', // 東京 (日本47都道府県全制覇)
  'KR', // ソウル (韓国×3)
  // 'KP' は未訪問
  // 'CN' (北京) は未訪問
  // 'MN' (UB) は未訪問
  'VN', // ハノイ (ベトナム×2の中で訪問していると仮定)
  'LA', // ビエンチャン
  'KH', // プノンペン
  'TH', // バンコク
  // 'MM' (ネピドー) はミャンマー訪問だがcapital未訪問
  // 'BD' は未訪問
  // 'IN' は未訪問
  'ID', // ジャカルタ (インドネシア訪問)
  'TL', // ディリ (東ティモール訪問)
  'PH', // マニラ (フィリピン訪問)
  'BN', // バンダルスリブガワン (ブルネイ訪問)
  'MY', // クアラルンプール (マレーシア訪問)
  'SG', // シンガポール
  // 'AU' (キャンベラ) 未訪問
  // 'US' (ワシントンDC) 未訪問
  'IS', // レイキャビク (アイスランド訪問)
  'FI', // ヘルシンキ (フィンランド訪問)
  'IT', // ローマ (イタリア訪問)
  'KZ', // アスタナ - 未訪問の可能性あり、要確認
  'RU', // モスクワ - 未訪問の可能性あり、要確認
]);

export function isRealLifeVisitedCity(cityId: string): boolean {
  return REAL_LIFE_VISITED_CITY_IDS.has(cityId);
}

export function isRealLifeVisitedCapital(capitalId: string): boolean {
  return REAL_LIFE_VISITED_CAPITAL_IDS.has(capitalId);
}
