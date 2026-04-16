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
