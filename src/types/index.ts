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

export interface PlayerState {
  currentSquareIndex: number;
  availableDice: number;
  totalStepsEntered: number;
  stepsTowardNextDie: number;
  diceHistory: DiceRoll[];
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
