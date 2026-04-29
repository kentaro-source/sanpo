export type Region = 'asia' | 'middle-east' | 'africa' | 'europe' | 'americas' | 'oceania';

export interface Capital {
  id: string;          // ISO 3166-1 alpha-2
  name: string;        // English
  nameJa: string;      // Japanese
  country: string;     // English
  countryJa: string;   // Japanese
  lat: number;
  lng: number;
  region: Region;
}

export type CityType = 'metropolis' | 'historic' | 'tourist' | 'gourmet';

export interface City {
  id: string;          // unique id, e.g. "JP-OSAKA"
  name: string;        // English
  nameJa: string;      // Japanese
  countryId: string;   // ISO 3166-1 alpha-2 of the country
  countryJa: string;
  lat: number;
  lng: number;
  type: CityType;
  description: string; // 短い日本語紹介
}

export interface Square {
  index: number;
  lat: number;
  lng: number;
  segmentIndex: number;
  localIndex: number;
  isCapital: boolean;
  capitalId?: string;
}

export interface Segment {
  fromCapitalId: string;
  toCapitalId: string;
  distanceKm: number;
  squareCount: number;
  startSquareIndex: number;
}

export interface RouteData {
  capitals: Capital[];
  segments: Segment[];
  squares: Square[];
  totalSquares: number;
  totalDistanceKm: number;
}

export interface DiceRoll {
  roll: number;
  timestamp: number;
  fromSquare: number;
  toSquare: number;
}

// === Sic Bo (大小) ===

export type SicBoBetType =
  | 'big'        // 大: sum 11-17 (no triples)
  | 'small'      // 小: sum 4-10 (no triples)
  | 'odd'        // 奇: sum is odd
  | 'even'       // 偶: sum is even
  | `total-${number}`   // total-4, total-5, ..., total-17
  | 'any-triple'        // 任意ゾロ目
  | `triple-${number}`; // triple-1, triple-2, ..., triple-6

export interface BetSlot {
  type: SicBoBetType;
  amount: number; // tokens placed
}

export interface SicBoRoll {
  dice: [number, number, number];
  sum: number;
  isTriple: boolean;
  tripleValue?: number;
  timestamp: number;
  bets: BetSlot[];
  totalAdvance: number;
  fromSquare: number;
  toSquare: number;
}

export interface PlayerState {
  currentSquareIndex: number;
  availableDice: number;
  totalStepsEntered: number;
  stepsTowardNextDie: number;
  diceHistory: DiceRoll[];
  sicBoHistory?: SicBoRoll[];
  visitedCapitals: string[];
  startDate: number;
  lastUpdated: number;
  completedLaps: number;
  // Google Fit sync state
  lastSyncTimestamp?: number; // unix ms - last time we successfully pulled from Google Fit
}

export interface GameConfig {
  stepsPerDie: number;
  maxDice: number;
}

export interface GameState {
  player: PlayerState;
  config: GameConfig;
  version: number;
}
