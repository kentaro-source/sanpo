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
  /** 実生活で訪問した都市は思い出ボーナス対象 */
  visitedInRealLife?: boolean;
}

export interface Square {
  index: number;
  lat: number;
  lng: number;
  segmentIndex: number;
  localIndex: number;
  isCapital: boolean;
  capitalId?: string;
  /** Set when a waypoint city sits on this square (for display + bonus logic). */
  cityId?: string;
  /** Cumulative distance from start (km). Player position is now distance-based. */
  cumulativeKm: number;
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
  /** Capital ID → cumulative km from start. */
  capitalDistances: Record<string, number>;
  /** City ID → cumulative km from start. */
  cityDistances: Record<string, number>;
}

/**
 * Real-world route classification for each segment.
 * - 'land': drivable land route (use Directions API)
 * - 'sea': pure sea crossing (manual waypoints for actual shipping/ferry routes)
 * - 'mixed': part land, part sea (e.g., island hops via ferries)
 * - 'fantasy': no realistic route exists (e.g., trans-Pacific)
 */
export type SegmentRouteType = 'land' | 'sea' | 'mixed' | 'fantasy';

export interface SegmentMeta {
  fromCapitalId: string;
  toCapitalId: string;
  routeType: SegmentRouteType;
  /** Optional manual waypoints [lat, lng] for sea/mixed/fantasy curation. */
  manualWaypoints?: [number, number][];
  /** Optional notes (ferry name, geographic note, etc.) */
  notes?: string;
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

export interface Boost {
  multiplier: number;
  /** Unix ms when this entry expires and stops contributing. */
  expiresAt: number;
  /** Wall-clock when this boost was created (for UI ordering). */
  createdAt: number;
}

export interface PlayerState {
  /** Distance from start of route (km). Continuous position. */
  distanceKm: number;
  /**
   * @deprecated Kept for migration / map fallback. Derive from distanceKm
   * via routeData.squares cumulativeKm instead.
   */
  currentSquareIndex: number;
  /**
   * @deprecated Single-window model from v6. Now superseded by `boosts`.
   * Kept on the type so old (v6) saves still load without TS errors.
   * Effective multiplier at runtime = product of unexpired entries in `boosts`.
   */
  currentMultiplier: number;
  /** @deprecated See currentMultiplier. */
  multiplierUntil: number;
  /**
   * Stack of active speed-multiplier windows. Each Sic Bo win/loss
   * appends one entry; the effective multiplier at any moment is
   * the product of all entries whose `expiresAt > now`. This lets the
   * player chain multiple wins for compounding speedup without losing
   * the prior window the way the v6 single-slot model did.
   */
  boosts?: Boost[];
  /** Last seen step count for diff-based input (legacy add-steps still uses stepsTowardNextDie). */
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
  /**
   * @deprecated v8 replaced this with `attributedTodaySteps`.
   * Kept on the type so v6/v7 saves still type-check during load.
   */
  todayStepsBaseline?: number;
  /** @deprecated see todayStepsBaseline. */
  todayBaselineDayStart?: number;
  /**
   * Sum of steps already credited to distanceKm today, regardless of
   * source (Fit sync, in-browser pedometer, manual input). Used for
   * cross-source double-count prevention: when Fit syncs with an
   * absolute today-total, contribution = max(0, todayAbsolute - attributedTodaySteps),
   * so steps the pedometer already counted aren't credited a second time.
   */
  attributedTodaySteps?: number;
  /** start-of-day ms for the day attributedTodaySteps applies to */
  attributedDayStart?: number;
  // Step-count milestones already claimed (10k/100k/1M/10M/100M etc.).
  claimedMilestones?: number[];
  // City IDs the player has visited via stopping within range. For the
  // city-visit bonus and 思い出 highlighting on the map.
  visitedCities?: string[];
  // Recent bonus events for transient toast display. Newest first.
  recentBonuses?: BonusEvent[];
  /**
   * Local-midnight ms of the last day the user claimed the daily login
   * bonus. Used to gate one bonus per day (no streak tracking — fixed
   * +5 chips per fresh day, per spec D).
   */
  lastLoginDayStart?: number;
  /**
   * Per-day rollup of activity, pushed when the day boundary
   * (attributedDayStart) advances. Capped at 60 days. Surfaced via
   * HamburgerMenu's 「📊 日別記録」 history view.
   */
  dailyHistory?: DailyRecord[];
  /** Today-in-progress accumulators that get rolled into dailyHistory
   *  when the day boundary crosses. Reset to zero on rollover. */
  todayKm?: number;
  todayNewCapitals?: number;
  todayNewCities?: number;
  /**
   * Sentinel for the one-shot launch reset (5/7 00:00 JST).
   * - undefined: not yet initialized (first load); reducer will set
   *   to LAUNCH_RESET_AT_MS or 0 depending on current clock
   * - > 0: scheduled — when Date.now() reaches this value, reset fires
   * - 0: reset has already fired (or skipped because we're past target)
   */
  scheduledResetAt?: number;
  /**
   * Highest / lowest effective speed multiplier observed today, sampled
   * after each Sic Bo roll. Used by ShareToX to brag about the day's
   * peak (and admit the day's slog). Reset when the day rolls over,
   * keyed by todayMultiplierDayStart.
   */
  todayMaxMultiplier?: number;
  todayMinMultiplier?: number;
  /** Local-midnight ms of the day todayMax/MinMultiplier applies to. */
  todayMultiplierDayStart?: number;
  /**
   * Sic Bo win/loss tally for the day. Resets when the day rolls over,
   * keyed by todayMultiplierDayStart (shared with the multiplier band).
   * ShareToX surfaces these as "🎲 N勝M負" so X posts read as a casino
   * progress report alongside the route.
   */
  todaySicBoWins?: number;
  todaySicBoLosses?: number;
  /**
   * distanceKm at the moment of today's first step contribution
   * (snapshotted on day-rollover). Used by ShareToX to display
   * "今日: <start city> → <current city>" — the day's actual route
   * rather than the long-haul segment goal. Resets each new day.
   */
  todayStartKm?: number;
  /**
   * If set, the player has walked up to a country border and is blocked
   * from advancing further until they win the immigration card draw.
   * The border is the FIRST stop (city or capital) of a country the
   * player has not yet entered — so for a Tokyo→Seoul leg, the border
   * fires at Busan (first KR city), not Seoul.
   *
   * - kind: whether the border stop is a regular city or a capital
   * - id: the city or capital id (used to look up name/flag)
   * - atKm: cumulativeKm of the border. distanceKm cannot exceed this
   *   while pendingBorder is set.
   * - country: ISO alpha-2 of the country being entered. On a winning
   *   roll, the country is added to the visited set so the rest of
   *   the country (including its capital) doesn't re-trigger a border.
   * - cost: chips the immigration draw demands (random 1–5, fixed per
   *   border). Each attempt spends this many — "borders take your
   *   money" satire. Optional for back-compat with pre-cost saves.
   */
  pendingBorder?: {
    kind: 'city' | 'capital';
    id: string;
    atKm: number;
    country: string;
    cost?: number;
  };
  /**
   * Country IDs (ISO alpha-2) where the entry border-draw has been won
   * (or completed). Used by RETRY_LAST_MISSED_BORDER to skip countries
   * that the player has already legitimately played — without this we
   * couldn't tell "city visited via legit border win" apart from "city
   * silently credited by the old RECHECK bug".
   */
  borderRollsWon?: string[];
}

export interface DailyRecord {
  /** Unix ms of midnight local time for this day. */
  dayStart: number;
  /** Steps walked that day (whatever source credited them). */
  steps: number;
  /** km of route progress made that day (after multiplier). */
  km: number;
  /** Sic Bo wins / losses count for the day. */
  sicBoWins: number;
  sicBoLosses: number;
  /** Capitals newly visited that day. */
  newCapitals: number;
  /** Cities newly visited that day. */
  newCities: number;
}

export type BonusEventKind = 'milestone' | 'city' | 'city-irl' | 'capital' | 'capital-landing';

export interface BonusEvent {
  kind: BonusEventKind;
  amount: number;       // tokens awarded
  label: string;        // human readable, e.g. "10万歩達成"
  timestamp: number;
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
