import { createContext, useReducer, useEffect, type ReactNode } from 'react';
import type {
  GameState,
  PlayerState,
  GameConfig,
  BetSlot,
  SicBoRoll,
  BonusEvent,
  Boost,
  DailyRecord,
} from '../types';
import { routeData } from '../data';
import { cities } from '../data/cities';
import { squareIndexAtKm } from '../data/generateRoute';
import {
  isRealLifeVisitedCapital,
  isRealLifeVisitedCity,
} from '../data/realLifeVisited';
import {
  getCapitalKm,
  getCityKm,
  subscribeOverrides,
} from '../services/playerPath';
import {
  loadGameState,
  saveGameState,
  clearGameState,
  buildRecoveredState,
} from '../utils/storage';
import {
  rollDice,
  isTriple,
  totalBetAmount,
  evaluateBetWindow,
  LOSS_MULTIPLIER,
} from '../utils/sicbo';

// Step-count milestones: { threshold, bonus tokens, label }.
// Sorted ascending so we can pick the largest crossed threshold easily.
const MILESTONES: Array<{ steps: number; tokens: number; label: string }> = [
  { steps: 10_000, tokens: 1, label: '1万歩達成' },
  { steps: 100_000, tokens: 2, label: '10万歩達成' },
  { steps: 1_000_000, tokens: 3, label: '100万歩達成' },
  { steps: 10_000_000, tokens: 5, label: '1000万歩達成' },
  { steps: 100_000_000, tokens: 5, label: '1億歩達成 — 特別演出！' },
];

const MAX_RECENT_BONUSES = 8;

// Distance gained per step at 1.0× effective multiplier.
// 1m/step on purpose: walking is intentionally slow at base rate
// ("1歩は1歩としてカウント"), and Sic Bo wins are the way to actually
// accelerate by stacking multiplier windows.
const KM_PER_STEP = 0.001;

/**
 * Effective speed multiplier at time `now` = product of all unexpired
 * Boost entries. Empty / all expired = 1.0×.
 */
/** Hard floor and cap for the displayed/applied effective multiplier.
 *  Floor 0.25 = 1km/h zone (turtle), prevents penalty stacking from
 *  reaching speeds where the marker basically halts. Cap raised to
 *  1000 (= 4000 km/h, well into 🚀 territory): single triple-N alone
 *  pays ×180, and compound wins (e.g. triple ×30 ⇨ 大 ×3 next round)
 *  used to dead-end at the previous ×30 cap, swallowing the second
 *  hit. The new ceiling lets compound boosts compound visibly while
 *  still guarding against runaway. */
const EFFECTIVE_MULT_FLOOR = 0.25;
const EFFECTIVE_MULT_CAP = 1000;

function effectiveMultiplier(boosts: Boost[] | undefined, now: number): number {
  if (!boosts || boosts.length === 0) return 1.0;
  let m = 1;
  for (const b of boosts) {
    if (b.expiresAt > now && Number.isFinite(b.multiplier)) {
      m *= b.multiplier;
    }
  }
  if (!Number.isFinite(m) || m <= 0) return 1.0;
  if (m < EFFECTIVE_MULT_FLOOR) return EFFECTIVE_MULT_FLOOR;
  if (m > EFFECTIVE_MULT_CAP) return EFFECTIVE_MULT_CAP;
  return m;
}

/** Drop expired Boost entries. Returns the same array reference if nothing changed. */
function pruneExpiredBoosts(boosts: Boost[] | undefined, now: number): Boost[] {
  if (!boosts || boosts.length === 0) return [];
  const live = boosts.filter((b) => b.expiresAt > now);
  return live.length === boosts.length ? boosts : live;
}

/**
 * Convert N steps walked at the current point in time into km moved,
 * accounting for any active multiplier window. If the window expires
 * mid-step-batch, the remaining steps are credited at 1.0x.
 */
function stepsToKm(
  steps: number,
  player: PlayerState,
  now: number,
): { km: number; prunedBoosts: Boost[] } {
  if (steps <= 0) {
    return { km: 0, prunedBoosts: pruneExpiredBoosts(player.boosts, now) };
  }
  // Effective multiplier is the product of all currently-active boosts.
  // Note: this is a per-call snapshot — if a boost expires mid-step-batch
  // we DON'T split the batch (steps come in chunks of 10s of seconds, so
  // close enough). Pruning happens after.
  const m = effectiveMultiplier(player.boosts, now);
  const prunedBoosts = pruneExpiredBoosts(player.boosts, now);
  return { km: steps * KM_PER_STEP * m, prunedBoosts };
}

/**
 * Walk forward from `oldKm` to `newKm` and detect any capital / city
 * crossings. Awards the appropriate bonus tokens + emits BonusEvents.
 * Handles wrap-around (multi-lap progress in a single batch).
 */
function detectCrossings(
  oldKm: number,
  newKm: number,
  visitedCapitals: string[],
  visitedCities: string[],
  now: number,
): {
  newCapitals: string[];
  newCities: string[];
  bonusTokens: number;
  events: BonusEvent[];
  completedLaps: number;
} {
  const total = routeData.totalDistanceKm;
  let bonusTokens = 0;
  const events: BonusEvent[] = [];
  const newCapitalsSet = new Set(visitedCapitals);
  const newCitiesSet = new Set(visitedCities);
  let laps = 0;

  // Walk in one or more wrap-around laps.
  let cursor = oldKm;
  while (cursor < newKm) {
    const lapEnd = Math.floor(cursor / total + 1) * total;
    const segEnd = Math.min(newKm, lapEnd);
    // Look for capitals between cursor (exclusive) and segEnd (inclusive)
    // within the current lap.
    const lapStart = Math.floor(cursor / total) * total;
    const localStart = cursor - lapStart;
    const localEnd = segEnd - lapStart;
    for (const cap of routeData.capitals) {
      const origKm = routeData.capitalDistances[cap.id];
      if (origKm == null) continue;
      const capKm = getCapitalKm(cap.id, origKm);
      if (capKm > localStart && capKm <= localEnd) {
        if (!newCapitalsSet.has(cap.id)) {
          newCapitalsSet.add(cap.id);
          // Bonuses stack: every new capital awards +5, and if the
          // user has actually been there in real life, an additional
          // +5 思い出ボーナス is granted. Emitted as two separate
          // events so the toast/recent-bonuses UI shows the breakdown.
          const irl = isRealLifeVisitedCapital(cap.id);
          bonusTokens += 5;
          events.push({
            kind: 'capital',
            amount: 5,
            label: `🏛 ${cap.nameJa}（${cap.countryJa}）通過 +5`,
            timestamp: now,
            source: 'walk',
          });
          if (irl) {
            bonusTokens += 5;
            events.push({
              kind: 'capital-landing',
              amount: 5,
              label: `★ 懐かしの${cap.nameJa} 思い出ボーナス +5`,
              timestamp: now,
              source: 'walk',
            });
          }
        }
      }
    }
    // Cities crossed in this lap window
    for (const cid of Object.keys(routeData.cityDistances)) {
      const cityKm = getCityKm(cid, routeData.cityDistances[cid]);
      if (cityKm > localStart && cityKm <= localEnd) {
        if (!newCitiesSet.has(cid)) {
          newCitiesSet.add(cid);
          // city is looked up below
        }
      }
    }
    if (segEnd >= lapEnd) {
      laps++;
      cursor = lapEnd;
    } else {
      cursor = segEnd;
    }
  }

  // Build city events with proper labels (irl bonus etc.)
  const newCityIds = Array.from(newCitiesSet).filter(
    (id) => !visitedCities.includes(id),
  );
  for (const cid of newCityIds) {
    const city = cities.find((c) => c.id === cid);
    if (!city) continue;
    const irl = city.visitedInRealLife === true || isRealLifeVisitedCity(cid);
    // Stackable: base city +3, plus +3 思い出 if IRL-visited.
    bonusTokens += 3;
    events.push({
      kind: 'city',
      amount: 3,
      label: `📍 ${city.nameJa} 立ち寄り +3`,
      timestamp: now,
      source: 'walk',
    });
    if (irl) {
      bonusTokens += 3;
      events.push({
        kind: 'city-irl',
        amount: 3,
        label: `★ 懐かしの${city.nameJa} 思い出ボーナス +3`,
        source: 'walk',
        timestamp: now,
      });
    }
  }

  return {
    newCapitals: Array.from(newCapitalsSet),
    newCities: Array.from(newCitiesSet),
    bonusTokens,
    events,
    completedLaps: laps,
  };
}

/** Compute milestone bonuses crossed by going from oldTotal → newTotal. */
function checkMilestones(
  oldTotal: number,
  newTotal: number,
  alreadyClaimed: number[],
  now: number,
): { tokens: number; events: BonusEvent[]; newClaimed: number[] } {
  const claimed = new Set(alreadyClaimed);
  let tokens = 0;
  const events: BonusEvent[] = [];
  for (const m of MILESTONES) {
    if (claimed.has(m.steps)) continue;
    // Crossed milestone if newTotal hit it but oldTotal hadn't.
    if (newTotal >= m.steps && oldTotal < m.steps) {
      tokens += m.tokens;
      claimed.add(m.steps);
      events.push({
        kind: 'milestone',
        amount: m.tokens,
        label: m.label,
        timestamp: now,
      });
    }
  }
  return { tokens, events, newClaimed: Array.from(claimed) };
}

const DEFAULT_CONFIG: GameConfig = {
  // v10: 777→500 — balanced for ~10k歩/day yielding 20 chips/day.
  // At 1m/step + ×3 win-EV Sic Bo, this targets ~600km/day average for
  // a ~1.5 year world tour pace.
  stepsPerDie: 500,
  maxDice: 100,      // v8: 5→100 — lets the player hoard for sea-crossing 爆速 sessions
};

/** Hard ceiling for total tokens including capital/city bonus overflow. */
const TOKEN_HARD_CEILING_FACTOR = 1.5;

/**
 * Combine carried tokens, walking-earned tokens, and bonus tokens.
 *
 * - Walking-earned tokens respect maxDice (don't waste cap-busting walks
 *   that produce more tokens than the cap allows).
 * - Bonus tokens (capital/city/milestone) IGNORE the soft cap because the
 *   user shouldn't lose meaningful one-shot rewards just for happening to
 *   be at cap when they cross a capital.
 * - A hard ceiling at maxDice × N prevents unbounded hoarding.
 * - We never lower an already-carried high count just because walking
 *   would exceed the cap; carried > cap is allowed (left over from
 *   previous bonuses) and walking simply doesn't add to it.
 */
function combineDice(
  carried: number,
  walking: number,
  bonus: number,
  cap: number,
): number {
  const walkedTo = Math.min(carried + walking, Math.max(cap, carried));
  return Math.min(walkedTo + bonus, cap * TOKEN_HARD_CEILING_FACTOR);
}

function startOfDayMs(now: number): number {
  const d = new Date(now);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

type BorderInfo = NonNullable<PlayerState['pendingBorder']>;

type StopRec = {
  id: string;
  km: number;
  country: string;
  kind: 'city' | 'capital';
};

/**
 * Build the route's ordered stop list with current (override-aware)
 * km values. O(N log N) per call (~450 stops → sub-ms), called from
 * each border-detection action.
 */
function orderedStops(): StopRec[] {
  // CRITICAL: use raw routeData.*Distances (NOT snap-km override).
  // This list is consumed by findNextBorderStop / listMissedBorders /
  // RECHECK_CROSSINGS which compare against player.distanceKm — and
  // player.distanceKm is a raw km accumulator (1.4× road-factor scale)
  // because that's what ADD_STEPS / SYNC produce. Mixing snap km
  // (some stops with override, some without) here would produce a
  // sort order inconsistent with the player position scale, causing
  // border arms at the wrong country (e.g. "KR 入国審査" arming when
  // the player is already past Pyongyang).
  const stops: StopRec[] = [];
  for (const cap of routeData.capitals) {
    const km = routeData.capitalDistances[cap.id];
    if (km == null) continue;
    stops.push({
      id: cap.id,
      km,
      country: cap.id,
      kind: 'capital',
    });
  }
  for (const city of cities) {
    const km = routeData.cityDistances[city.id];
    if (km == null) continue;
    stops.push({
      id: city.id,
      km,
      country: city.countryId,
      kind: 'city',
    });
  }
  stops.sort((a, b) => a.km - b.km);
  return stops;
}

/**
 * Per-capital immigration model. The roll fires when the player
 * reaches the CAPITAL of a country that hasn't been cleared yet —
 * never at an intermediate city, never at the country's first border
 * city. This sidesteps the raw-km vs road-km position drift: the
 * judgement target is a single point (the capital), so even when the
 * internal distance lags the map, the roll just appears slightly late
 * at the capital rather than mis-firing in the wrong country.
 *
 * `crossedSet` = cleared capital ids (= country codes, ROLL_BORDER
 * wins). `visitedSet` = visitedCapitals (already credited some other
 * way). A capital in EITHER set never re-arms — this is what stops a
 * long-passed capital (Seoul/Busan etc.) from reappearing.
 *
 * Arrival is judged by the player's CURRENT position only: the
 * forward pass arms a capital exactly when this batch walks across
 * it. The single bounded exception is the capital of the country the
 * player is currently standing in (most recent capital behind) — see
 * the catch-up block below. The start capital (Tokyo / JP) never
 * arms.
 */
// 香港 / マカオ / 台湾 are recognised as their own countries (B option):
// their entry city arms an immigration roll and counts toward the country
// total, even though geometrically they remain waypoint cities (no route
// restructure, no capital added). Map: waypoint city id → ISO country code.
const BORDER_CITY_COUNTRIES: Record<string, string> = {
  'CN-HONGKONG': 'HK',
  'MO-MACAU': 'MO',
  'TW-TAIPEI': 'TW',
};

function findNextBorderStop(
  oldKm: number,
  newKm: number,
  crossedSet: Set<string>,
  visitedSet?: Set<string>,
): BorderInfo | null {
  const startCapId = routeData.capitals[0]?.id;
  // Capitals in km order. Uses snap-corrected km (getCapitalKm
  // override, pushed by MapView from the real road polyline) so the
  // border judgement agrees with what the user SEES — the stop list
  // and map use the same overrides. With raw 1.4×-factor km only,
  // the map can show Beijing already passed while raw distance still
  // sits short of Beijing's raw km, and the roll never fires (the
  // exact "北京出ない" failure). Out-of-window capitals fall back to
  // raw km, which is safe: they only ever arm once the player is
  // near, by which point MapView has pushed their override.
  const caps = routeData.capitals
    .map((c) => {
      const raw = routeData.capitalDistances[c.id];
      return {
        id: c.id,
        km: raw == null ? null : getCapitalKm(c.id, raw),
        country: c.id,
        kind: 'capital' as 'capital' | 'city',
      };
    })
    .concat(
      // 香港/マカオ/台湾: their entry city is treated as a country border.
      Object.entries(BORDER_CITY_COUNTRIES).map(([cid, code]) => {
        const raw = routeData.cityDistances[cid];
        return {
          id: cid,
          km: raw == null ? null : getCityKm(cid, raw),
          country: code,
          kind: 'city' as 'capital' | 'city',
        };
      }),
    )
    .filter((c) => c.km != null)
    .sort((a, b) => (a.km as number) - (b.km as number));
  // 1) Forward arm — fires exactly when THIS batch carries the
  //    player's position across the capital. Current-position-based,
  //    never retroactive.
  for (const c of caps) {
    if (c.id === startCapId) continue;
    if (crossedSet.has(c.id)) continue;
    if (visitedSet && visitedSet.has(c.id)) continue;
    const km = c.km as number;
    if (km <= oldKm || km > newKm) continue;
    return {
      kind: c.kind,
      id: c.id,
      atKm: km,
      country: c.country,
      cost: 1 + Math.floor(Math.random() * 5),
    };
  }

  // 2) Bounded catch-up — ONLY the capital of the country the player
  //    is currently in (= the single most recent capital behind
  //    oldKm). If its roll was lost (e.g. a migration cleared the
  //    pendingBorder while a catch-up step batch jumped past the
  //    capital — how Beijing went missing), it would otherwise stay
  //    un-credited forever, since per-capital crediting happens only
  //    via the roll. The scan stops at the most recent behind
  //    capital: if that one is already cleared/visited, NOTHING arms,
  //    so older capitals (Seoul etc.) can never resurface. Arming a
  //    behind-capital never rewinds distance — the walk clamp is
  //    Math.max(oldKm, …) and ROLL_BORDER resolves with
  //    Math.max(distanceKm, …).
  let lastBehind:
    | { id: string; km: number; country: string; kind: 'capital' | 'city' }
    | null = null;
  for (const c of caps) {
    const km = c.km as number;
    if (km <= oldKm)
      lastBehind = { id: c.id, km, country: c.country, kind: c.kind };
    else break;
  }
  if (
    lastBehind &&
    lastBehind.id !== startCapId &&
    !crossedSet.has(lastBehind.id) &&
    !(visitedSet && visitedSet.has(lastBehind.id))
  ) {
    return {
      kind: lastBehind.kind,
      id: lastBehind.id,
      atKm: lastBehind.km,
      country: lastBehind.country,
      cost: 1 + Math.floor(Math.random() * 5),
    };
  }
  return null;
}

/** All uncrossed border-stops with km <= localKm. Used by RETRY to
 *  find missed borders the player walked past silently. Returns them
 *  in route-km order (earliest first). */
function listMissedBorders(
  localKm: number,
  crossedSet: Set<string>,
): BorderInfo[] {
  const stops = orderedStops();
  const out: BorderInfo[] = [];
  let prevCountry: string | null = null;
  for (const s of stops) {
    const isBorder = prevCountry !== null && prevCountry !== s.country;
    prevCountry = s.country;
    if (!isBorder) continue;
    if (crossedSet.has(s.id)) continue;
    if (s.km > localKm) continue;
    out.push({
      kind: s.kind,
      id: s.id,
      atKm: s.km,
      country: s.country,
      cost: 1 + Math.floor(Math.random() * 5),
    });
  }
  return out;
}

/** Fallback border-roll cost for pre-cost saves (pendingBorder.cost
 *  may be undefined on a state loaded before the random fee existed). */
const BORDER_ROLL_COST = 1;

/**
 * Target wall-clock for the one-shot launch reset. 5/7 2026 00:00 JST
 * = 5/6 2026 15:00 UTC. Hardcoded as a UTC instant so the trigger is
 * identical regardless of the device's local timezone.
 */
const LAUNCH_RESET_AT_MS = Date.UTC(2026, 4, 6, 15, 0, 0);

const MAX_DAILY_HISTORY = 60;

/**
 * If the previous attributedDayStart is older than today, push a
 * DailyRecord for that finished day and reset today-accumulators.
 * Returns a partial PlayerState patch the caller merges in. Idempotent
 * — safe to call on every state-mutating action.
 */
function closeOutDayIfNeeded(
  player: PlayerState,
  now: number,
): Partial<PlayerState> {
  const today = startOfDayMs(now);
  const prev = player.attributedDayStart;
  if (!prev || prev === today) return {};
  const record: DailyRecord = {
    dayStart: prev,
    steps: player.attributedTodaySteps ?? 0,
    km: player.todayKm ?? 0,
    sicBoWins: player.todaySicBoWins ?? 0,
    sicBoLosses: player.todaySicBoLosses ?? 0,
    newCapitals: player.todayNewCapitals ?? 0,
    newCities: player.todayNewCities ?? 0,
  };
  // Drop empty days (no activity) so the history view isn't padded
  // with placeholders.
  const empty =
    record.steps === 0 &&
    record.km === 0 &&
    record.sicBoWins === 0 &&
    record.sicBoLosses === 0 &&
    record.newCapitals === 0 &&
    record.newCities === 0;
  const history = empty
    ? player.dailyHistory ?? []
    : [...(player.dailyHistory ?? []), record].slice(-MAX_DAILY_HISTORY);
  return {
    dailyHistory: history,
    todayKm: 0,
    todayNewCapitals: 0,
    todayNewCities: 0,
    todaySicBoWins: 0,
    todaySicBoLosses: 0,
    todayMaxMultiplier: undefined,
    todayMinMultiplier: undefined,
    todayMultiplierDayStart: undefined,
  };
}

function createInitialPlayer(): PlayerState {
  return {
    distanceKm: 0,
    currentSquareIndex: 0,
    currentMultiplier: 1.0, // legacy field, not consulted at runtime
    multiplierUntil: 0, // legacy field
    boosts: [],
    availableDice: 0,
    totalStepsEntered: 0,
    stepsTowardNextDie: 0,
    diceHistory: [],
    visitedCapitals: [routeData.capitals[0].id], // start at Tokyo
    visitedCities: [],
    claimedMilestones: [],
    recentBonuses: [],
    startDate: Date.now(),
    lastUpdated: Date.now(),
    completedLaps: 0,
    borderRollsWon: [],
    crossedBorders: [],
  };
}

function createInitialState(): GameState {
  return {
    player: createInitialPlayer(),
    config: DEFAULT_CONFIG,
    version: 9,
  };
}

/**
 * Launch-time normalization. The ONLY rule for the recurring path:
 * NEVER touch distanceKm automatically. Distance is moved exclusively
 * by step crediting (ADD_STEPS / SYNC_FROM_GOOGLE_FIT). This function
 * only fills the `crossedBorders` field if missing (legacy saves
 * predate it). Everything else passes through.
 */
function normalizeLoadedState(loaded: GameState): GameState {
  if (loaded.player.crossedBorders) return loaded;
  return {
    ...loaded,
    player: { ...loaded.player, crossedBorders: [] },
  };
}

// NOTE (warp fix): restoreDistanceOnce + clearStuckBorder were removed.
// They were one-time, run-once-per-install migrations that force-set
// distanceKm (and silently credited stops) from the
// (dailyHistory.km + todayKm) walked-total proxy. That proxy OVER-counts
// vs real distance because todayKm keeps accumulating while distanceKm
// sits clamped at a border — so the "restore" warped players forward on
// the first launch after a new install. Per the iron rule, distance is
// never auto-mutated at launch; backward correction is user-initiated
// via SET_DISTANCE_KM only.

function getInitialState(): GameState {
  const loaded = loadGameState();
  if (loaded) {
    // Launch-time normalization ONLY — NEVER auto-mutate distanceKm.
    // The old restoreDistanceOnce / clearStuckBorder one-time migrations
    // were removed: they force-overwrote distance from the inflated
    // (dailyHistory.km + todayKm) proxy, which over-counts every time the
    // player sat clamped at a border. On the first launch after a fresh
    // install that warped the player forward (e.g. 運城 → 武漢, ~+427km).
    // Backward correction is now exclusively user-initiated via
    // SET_DISTANCE_KM (HamburgerMenu → 🔧 現在地を補正).
    return normalizeLoadedState(loaded);
  }
  // Loader returned null. Try the watchdog (progress side-channel) before
  // resetting the player to Tokyo Station. The user reported "たびたび
  // 東京駅に戻る" — most likely cause is a CURRENT_VERSION bump dropping
  // the saved state on a deploy. Watchdog preserves distanceKm + visited
  // lists across schema changes.
  const fresh = createInitialState();
  const recovered = buildRecoveredState(fresh);
  return recovered ?? fresh;
}

// Legacy applyAdvance(squares-based) removed. Crossings now detected
// via detectCrossings() in distance space.

// Actions
type GameAction =
  | { type: 'ADD_STEPS'; steps: number }
  | { type: 'SYNC_FROM_GOOGLE_FIT'; steps: number; syncTimestamp: number }
  | { type: 'ROLL_SICBO'; bets: BetSlot[]; dice?: [number, number, number] }
  | { type: 'UPDATE_CONFIG'; config: Partial<GameConfig> }
  | { type: 'CLAIM_LOGIN_BONUS' }
  | { type: 'CHECK_SCHEDULED_RESET' }
  | { type: 'RECHECK_CROSSINGS' }
  | { type: 'RETRY_LAST_MISSED_BORDER' }
  | { type: 'FORCE_LAUNCH_RESET' }
  | { type: 'ROLL_BORDER'; choice: 'red' | 'black'; outcome: 'win' | 'lose'; cardLabel: string }
  | { type: 'SET_DISTANCE_KM'; km: number }
  | { type: 'RESET_GAME' };

const LOGIN_BONUS_CHIPS = 5;

function gameReducer(state: GameState, action: GameAction): GameState {
  switch (action.type) {
    case 'ADD_STEPS': {
      const now = Date.now();
      // Tokens still accrue from raw step count (stepsPerDie = 5000).
      const totalSteps = state.player.stepsTowardNextDie + action.steps;
      const newDice = Math.floor(totalSteps / state.config.stepsPerDie);
      const remainder = totalSteps % state.config.stepsPerDie;

      // Track per-day contribution so a later Fit sync doesn't double-count
      // steps the pedometer (or manual input) already credited.
      const dayStart = (() => {
        const d = new Date(now);
        d.setHours(0, 0, 0, 0);
        return d.getTime();
      })();
      const sameDay = state.player.attributedDayStart === dayStart;
      const newAttributed =
        (sameDay ? state.player.attributedTodaySteps ?? 0 : 0) + action.steps;

      // Convert steps to km via the stacked-boost multiplier.
      const conv = stepsToKm(action.steps, state.player, now);
      const oldKm = state.player.distanceKm;
      const fullNewKm = oldKm + conv.km;

      // Border-gamble clamp:
      //   - If we already have a pending border, walking can't pass it.
      //   - Otherwise, if this batch would cross a new capital, stop
      //     at that capital and arm the border roll.
      // Either way the player banks chips from the steps but stops
      // physically advancing past the boundary.
      const existingBorder = state.player.pendingBorder ?? null;
      const crossedSet = new Set(state.player.crossedBorders ?? []);
      const visitedCapSet = new Set(state.player.visitedCapitals ?? []);
      const newBorder = existingBorder
        ? null
        : findNextBorderStop(oldKm, fullNewKm, crossedSet, visitedCapSet);
      const pendingBorder = existingBorder ?? newBorder ?? undefined;
      const borderCap = pendingBorder?.atKm;
      // Remember the original target so ROLL_BORDER can keep advancing
      // through additional borders in the same step batch after a win.
      // Keep the MAX of any existing target and fullNewKm — otherwise
      // every HC poll while clamped at a border would shrink target to
      // the latest poll's fullNewKm, throwing away the original
      // "intended reach" the RETRY/first-arm recorded.
      const borderAdvanceTarget =
        pendingBorder && borderCap != null && borderCap < fullNewKm
          ? Math.max(state.player.borderAdvanceTarget ?? 0, fullNewKm)
          : state.player.borderAdvanceTarget;
      // Use a small epsilon so detectCrossings doesn't credit the border
      // stop itself — that's deferred to ROLL_BORDER on a successful
      // roll. Cities on the way (within the same already-visited country)
      // are still credited.
      // A BEHIND border (catch-up arm for an already-passed capital,
      // e.g. Beijing missed during a 500km/h boost jump) is a
      // mission-only revival: the roll is playable but walking must
      // NOT freeze and distance must NOT rewind — so the clamp is
      // skipped entirely. Only a border at/ahead of the current
      // position (normal forward arm, where distance sits exactly at
      // borderCap) blocks progress.
      const isBehindBorder = borderCap != null && borderCap < oldKm;
      const clampedNewKm =
        !isBehindBorder && borderCap != null && borderCap < fullNewKm
          ? borderCap
          : fullNewKm;
      const newKm = Math.max(oldKm, clampedNewKm);
      const detectKm =
        borderCap != null && borderCap === newKm ? borderCap - 0.001 : newKm;

      // Snapshot today's starting position the first time we register
      // any step contribution after a day boundary.
      const todayStartKm = sameDay ? state.player.todayStartKm ?? oldKm : oldKm;

      // Detect capital/city crossings between oldKm and detectKm.
      const cross = detectCrossings(
        oldKm,
        detectKm,
        state.player.visitedCapitals,
        state.player.visitedCities ?? [],
        now,
      );

      // Milestone bonuses on cumulative steps.
      const oldStepTotal = state.player.totalStepsEntered;
      const newStepTotal = oldStepTotal + action.steps;
      const ms = checkMilestones(
        oldStepTotal,
        newStepTotal,
        state.player.claimedMilestones ?? [],
        now,
      );

      const allEvents = [...cross.events, ...ms.events];
      const dayClose = closeOutDayIfNeeded(state.player, now);
      const newCapsToday =
        cross.newCapitals.length - state.player.visitedCapitals.length;
      const newCitiesToday =
        cross.newCities.length - (state.player.visitedCities ?? []).length;
      return {
        ...state,
        player: {
          ...state.player,
          ...dayClose,
          distanceKm: newKm,
          currentSquareIndex: squareIndexAtKm(routeData, newKm),
          boosts: conv.prunedBoosts,
          totalStepsEntered: newStepTotal,
          availableDice: combineDice(
            state.player.availableDice,
            newDice,
            ms.tokens + cross.bonusTokens,
            state.config.maxDice,
          ),
          stepsTowardNextDie: remainder,
          attributedTodaySteps: newAttributed,
          attributedDayStart: dayStart,
          todayStartKm,
          pendingBorder,
          borderAdvanceTarget,
          visitedCapitals: cross.newCapitals,
          visitedCities: cross.newCities,
          completedLaps: state.player.completedLaps + cross.completedLaps,
          claimedMilestones: ms.newClaimed,
          recentBonuses: allEvents.length
            ? [...allEvents, ...(state.player.recentBonuses ?? [])].slice(0, MAX_RECENT_BONUSES)
            : state.player.recentBonuses,
          lastUpdated: now,
          todayKm:
            ((dayClose.todayKm ?? state.player.todayKm) ?? 0) + conv.km,
          todayNewCapitals:
            ((dayClose.todayNewCapitals ?? state.player.todayNewCapitals) ?? 0) +
            Math.max(0, newCapsToday),
          todayNewCities:
            ((dayClose.todayNewCities ?? state.player.todayNewCities) ?? 0) +
            Math.max(0, newCitiesToday),
        },
      };
    }

    case 'SYNC_FROM_GOOGLE_FIT': {
      // action.steps = ABSOLUTE today total from Fit. We credit only the
      // PORTION not yet attributed to distanceKm by any source. This way
      // the in-browser pedometer and the periodic Fit sync can both run
      // concurrently without ever crediting the same steps twice.
      const todayAbsolute = action.steps;
      const d = new Date(action.syncTimestamp);
      d.setHours(0, 0, 0, 0);
      const todayStart = d.getTime();

      const sameDay = state.player.attributedDayStart === todayStart;
      const attributedSoFar = sameDay
        ? state.player.attributedTodaySteps ?? 0
        : 0;

      // Credit the delta — today's absolute total from HC minus what's
      // already been attributed (via the foreground pedometer or prior
      // syncs). Earlier we suppressed the first sync of the day to dodge
      // a '+6732歩' jump bug, but that lost every step walked before the
      // app was opened — which is most of them when the phone is in
      // a pocket and HC is the only counter running. The
      // `todayAbsolute - attributedSoFar` math already prevents
      // double-counting whatever the pedometer credited in foreground,
      // so the special case isn't needed.
      const contribution = Math.max(0, todayAbsolute - attributedSoFar);
      const newAttributed = Math.max(attributedSoFar, todayAbsolute);

      const now = Date.now();
      const totalSteps = state.player.stepsTowardNextDie + contribution;
      const newDice = Math.floor(totalSteps / state.config.stepsPerDie);
      const remainder = totalSteps % state.config.stepsPerDie;

      // Convert the new contribution to km using active multiplier.
      const conv = stepsToKm(contribution, state.player, now);
      const oldKm = state.player.distanceKm;
      const fullNewKm = oldKm + conv.km;

      // Border-gamble clamp (same as ADD_STEPS).
      const existingBorder = state.player.pendingBorder ?? null;
      const crossedSet = new Set(state.player.crossedBorders ?? []);
      const visitedCapSet = new Set(state.player.visitedCapitals ?? []);
      const newBorder = existingBorder
        ? null
        : findNextBorderStop(oldKm, fullNewKm, crossedSet, visitedCapSet);
      const pendingBorder = existingBorder ?? newBorder ?? undefined;
      const borderCap = pendingBorder?.atKm;
      // Keep the MAX of any existing target and fullNewKm — otherwise
      // every HC poll while clamped at a border would shrink target to
      // the latest poll's fullNewKm, throwing away the original
      // "intended reach" the RETRY/first-arm recorded.
      const borderAdvanceTarget =
        pendingBorder && borderCap != null && borderCap < fullNewKm
          ? Math.max(state.player.borderAdvanceTarget ?? 0, fullNewKm)
          : state.player.borderAdvanceTarget;
      // Same as ADD_STEPS: a behind (catch-up) border is mission-only —
      // never freezes walking, never rewinds distance.
      const isBehindBorder = borderCap != null && borderCap < oldKm;
      const clampedNewKm =
        !isBehindBorder && borderCap != null && borderCap < fullNewKm
          ? borderCap
          : fullNewKm;
      const newKm = Math.max(oldKm, clampedNewKm);
      const detectKm =
        borderCap != null && borderCap === newKm ? borderCap - 0.001 : newKm;

      const todayStartKm = sameDay ? state.player.todayStartKm ?? oldKm : oldKm;

      // Detect crossings between oldKm and detectKm.
      const cross = detectCrossings(
        oldKm,
        detectKm,
        state.player.visitedCapitals,
        state.player.visitedCities ?? [],
        now,
      );

      const oldStepTotal = state.player.totalStepsEntered;
      const newStepTotal = oldStepTotal + contribution;
      const ms = checkMilestones(
        oldStepTotal,
        newStepTotal,
        state.player.claimedMilestones ?? [],
        now,
      );

      const allEvents = [...cross.events, ...ms.events];
      const dayClose = closeOutDayIfNeeded(state.player, now);
      const newCapsToday =
        cross.newCapitals.length - state.player.visitedCapitals.length;
      const newCitiesToday =
        cross.newCities.length - (state.player.visitedCities ?? []).length;
      return {
        ...state,
        player: {
          ...state.player,
          ...dayClose,
          distanceKm: newKm,
          currentSquareIndex: squareIndexAtKm(routeData, newKm),
          boosts: conv.prunedBoosts,
          totalStepsEntered: newStepTotal,
          availableDice: combineDice(
            state.player.availableDice,
            newDice,
            ms.tokens + cross.bonusTokens,
            state.config.maxDice,
          ),
          stepsTowardNextDie: remainder,
          lastSyncTimestamp: action.syncTimestamp,
          attributedTodaySteps: newAttributed,
          attributedDayStart: todayStart,
          todayStartKm,
          pendingBorder,
          borderAdvanceTarget,
          visitedCapitals: cross.newCapitals,
          visitedCities: cross.newCities,
          completedLaps: state.player.completedLaps + cross.completedLaps,
          claimedMilestones: ms.newClaimed,
          recentBonuses: allEvents.length
            ? [...allEvents, ...(state.player.recentBonuses ?? [])].slice(0, MAX_RECENT_BONUSES)
            : state.player.recentBonuses,
          todayKm:
            ((dayClose.todayKm ?? state.player.todayKm) ?? 0) + conv.km,
          todayNewCapitals:
            ((dayClose.todayNewCapitals ?? state.player.todayNewCapitals) ?? 0) +
            Math.max(0, newCapsToday),
          todayNewCities:
            ((dayClose.todayNewCities ?? state.player.todayNewCities) ?? 0) +
            Math.max(0, newCitiesToday),
          lastUpdated: now,
        },
      };
    }

    case 'ROLL_SICBO': {
      const bets = action.bets;
      const totalBet = totalBetAmount(bets);
      if (totalBet <= 0) return state;
      if (totalBet > state.player.availableDice) return state;

      const dice = action.dice ?? rollDice();
      const sum = dice[0] + dice[1] + dice[2];
      const triple = isTriple(dice);
      const tripleValue = triple ? dice[0] : undefined;

      // Evaluate the bet → new boost window(s). When MULTIPLE bets win
      // on the same roll (e.g. 大 + total-12 both hit on a 12), each
      // winning multiplier is pushed as its own Boost so the effective
      // multiplier (product across the stack) reflects every win and
      // each boost expires on its own 30-min timer.
      const result = evaluateBetWindow(bets, dice);
      const now = Date.now();
      // Each per-bet outcome (win or lose) becomes its own Boost so they
      // stack multiplicatively with existing boosts and expire on
      // independent 30-min timers. The effective multiplier (clamped by
      // floor/cap in effectiveMultiplier()) reflects everything live.
      const newBoosts: Boost[] = result.outcomeMultipliers.map((m) => ({
        multiplier: m,
        expiresAt: now + result.windowMs,
        createdAt: now,
      }));
      const stackedBoosts = [
        ...pruneExpiredBoosts(state.player.boosts, now),
        ...newBoosts,
      ];

      const sicBoRoll: SicBoRoll = {
        dice,
        sum,
        isTriple: triple,
        tripleValue,
        timestamp: now,
        bets,
        // Repurpose totalAdvance as a flag of the multiplier (×N) won.
        totalAdvance: result.won ? result.multiplier : 0,
        fromSquare: state.player.currentSquareIndex,
        toSquare: state.player.currentSquareIndex,
      };

      // Toast for the result.
      const hours = Math.floor(result.windowMs / 3_600_000);
      const minutes = Math.round((result.windowMs % 3_600_000) / 60_000);
      const durLabel =
        hours > 0 ? `${hours}時間${minutes > 0 ? `${minutes}分` : ''}` : `${minutes}分`;
      const event: BonusEvent = result.won
        ? {
            kind: 'milestone',
            amount: 0,
            label: `×${result.multiplier} 加速 ${durLabel}！`,
            timestamp: now,
            source: 'sicbo',
          }
        : {
            kind: 'city',
            amount: 0,
            label: `ハズレ… ×${LOSS_MULTIPLIER} ${durLabel}`,
            timestamp: now,
            source: 'sicbo',
          };

      // Sample the post-roll effective multiplier for today's max/min
      // tracking. Fresh day → reset both to current value. Same day →
      // tighten the band. Wins/losses share the same day-rollover key.
      const effAfter = effectiveMultiplier(stackedBoosts, now);
      const dayMs = startOfDayMs(now);
      const sameMultDay = state.player.todayMultiplierDayStart === dayMs;
      const newMaxMult = sameMultDay
        ? Math.max(state.player.todayMaxMultiplier ?? effAfter, effAfter)
        : effAfter;
      const newMinMult = sameMultDay
        ? Math.min(state.player.todayMinMultiplier ?? effAfter, effAfter)
        : effAfter;
      const baseWins = sameMultDay ? state.player.todaySicBoWins ?? 0 : 0;
      const baseLosses = sameMultDay ? state.player.todaySicBoLosses ?? 0 : 0;
      const dayClose = closeOutDayIfNeeded(state.player, now);
      return {
        ...state,
        player: {
          ...state.player,
          ...dayClose,
          // Bet tokens are spent, no advance.
          availableDice: Math.max(0, state.player.availableDice - totalBet),
          // Stack the new boost on top of any active ones (instead of
          // the v6 single-slot overwrite).
          boosts: stackedBoosts,
          sicBoHistory: [...(state.player.sicBoHistory ?? []), sicBoRoll],
          recentBonuses: [event, ...(state.player.recentBonuses ?? [])].slice(0, MAX_RECENT_BONUSES),
          lastUpdated: now,
          todayMaxMultiplier: newMaxMult,
          todayMinMultiplier: newMinMult,
          todayMultiplierDayStart: dayMs,
          todaySicBoWins: baseWins + (result.won ? 1 : 0),
          todaySicBoLosses: baseLosses + (result.won ? 0 : 1),
        },
      };
    }

    case 'UPDATE_CONFIG': {
      return {
        ...state,
        config: { ...state.config, ...action.config },
      };
    }

    case 'CLAIM_LOGIN_BONUS': {
      const now = Date.now();
      const d = new Date(now);
      d.setHours(0, 0, 0, 0);
      const todayStart = d.getTime();
      // Already claimed today? No-op.
      if ((state.player.lastLoginDayStart ?? 0) >= todayStart) {
        return state;
      }
      const event: BonusEvent = {
        kind: 'milestone',
        amount: LOGIN_BONUS_CHIPS,
        label: `🎁 ログインボーナス +${LOGIN_BONUS_CHIPS}`,
        timestamp: now,
      };
      return {
        ...state,
        player: {
          ...state.player,
          availableDice: Math.min(
            state.config.maxDice,
            state.player.availableDice + LOGIN_BONUS_CHIPS,
          ),
          lastLoginDayStart: todayStart,
          recentBonuses: [event, ...(state.player.recentBonuses ?? [])].slice(
            0,
            MAX_RECENT_BONUSES,
          ),
          lastUpdated: now,
        },
      };
    }

    case 'ROLL_BORDER': {
      const pb = state.player.pendingBorder;
      if (!pb) return state;
      const cost = pb.cost ?? BORDER_ROLL_COST;
      if (state.player.availableDice < cost) return state;
      // Resolve display info for the border stop (city or capital).
      const stopName = (() => {
        if (pb.kind === 'capital') {
          return routeData.capitals.find((c) => c.id === pb.id)?.nameJa ?? pb.id;
        }
        return cities.find((c) => c.id === pb.id)?.nameJa ?? pb.id;
      })();
      const countryCap = routeData.capitals.find((c) => c.id === pb.country);
      const countryNameJa = countryCap?.countryJa ?? pb.country;

      const now = Date.now();
      const win = action.outcome === 'win';
      const spent = state.player.availableDice - cost;
      if (!win) {
        const event: BonusEvent = {
          kind: 'city',
          amount: 0,
          label: `🎴 ${stopName} 入国審査 ハズレ (-${cost}🪙)`,
          timestamp: now,
          source: 'border',
        };
        return {
          ...state,
          player: {
            ...state.player,
            availableDice: spent,
            recentBonuses: [event, ...(state.player.recentBonuses ?? [])].slice(
              0,
              MAX_RECENT_BONUSES,
            ),
            lastUpdated: now,
          },
        };
      }

      // Win: clear the block, mark the stop visited, award the same
      // bonus the player would have gotten from a passive crossing.
      const events: BonusEvent[] = [
        {
          kind: pb.kind === 'capital' ? 'capital' : 'city',
          amount: 0,
          label: `🛂 ${countryNameJa} 入国成功`,
          timestamp: now,
          source: 'border',
        },
      ];
      let bonus = 0;
      let nextVisitedCapitals = state.player.visitedCapitals;
      let nextVisitedCities = state.player.visitedCities ?? [];
      if (pb.kind === 'capital') {
        const irl = isRealLifeVisitedCapital(pb.id);
        bonus += 5;
        events.push({
          kind: 'capital',
          amount: 5,
          label: `🏛 ${stopName} 通過 +5`,
          timestamp: now,
          source: 'border',
        });
        if (irl) {
          bonus += 5;
          events.push({
            kind: 'capital-landing',
            amount: 5,
            label: `★ 懐かしの${stopName} 思い出 +5`,
            timestamp: now,
            source: 'border',
          });
        }
        if (!nextVisitedCapitals.includes(pb.id)) {
          nextVisitedCapitals = [...nextVisitedCapitals, pb.id];
        }
      } else {
        const city = cities.find((c) => c.id === pb.id);
        const irl =
          city?.visitedInRealLife === true || isRealLifeVisitedCity(pb.id);
        bonus += 3;
        events.push({
          kind: 'city',
          amount: 3,
          label: `📍 ${stopName} 立ち寄り +3`,
          timestamp: now,
          source: 'border',
        });
        if (irl) {
          bonus += 3;
          events.push({
            kind: 'city-irl',
            amount: 3,
            label: `★ 懐かしの${stopName} 思い出 +3`,
            timestamp: now,
            source: 'border',
          });
        }
        if (!nextVisitedCities.includes(pb.id)) {
          nextVisitedCities = [...nextVisitedCities, pb.id];
        }
      }
      const prevWon = state.player.borderRollsWon ?? [];
      const nextWon = prevWon.includes(pb.country)
        ? prevWon
        : [...prevWon, pb.country];
      const prevCrossed = state.player.crossedBorders ?? [];
      const nextCrossed = prevCrossed.includes(pb.id)
        ? prevCrossed
        : [...prevCrossed, pb.id];

      // Try to advance toward borderAdvanceTarget — if there's another
      // uncrossed border in (current, target], arm it; otherwise jump
      // to target and clear it. Lets the player chain through several
      // borders without waiting for the next HC poll.
      const target = state.player.borderAdvanceTarget;
      const currentKm = pb.atKm;
      const visitedCapSetAfter = new Set(nextVisitedCapitals);
      const crossedSetAfterWin = new Set(nextCrossed);
      let chainPending: BorderInfo | undefined;
      let chainDistance = currentKm;
      let chainTarget = state.player.borderAdvanceTarget;
      if (typeof target === 'number' && target > currentKm) {
        const next = findNextBorderStop(
          currentKm,
          target,
          crossedSetAfterWin,
          visitedCapSetAfter,
        );
        if (next) {
          chainPending = next;
          chainDistance = next.atKm;
          chainTarget = target;
        } else {
          chainDistance = target;
          chainTarget = undefined;
        }
      } else {
        chainTarget = undefined;
      }

      // Never rewind: if this was a behind-current capital (its pending
      // border had been silently cleared and the player already walked
      // past its km), winning it must not pull distance back to the
      // capital. Clamp to the max of the current distance and the
      // chain target.
      const resolvedDistance = Math.max(state.player.distanceKm, chainDistance);

      return {
        ...state,
        player: {
          ...state.player,
          availableDice: combineDice(spent, 0, bonus, state.config.maxDice),
          visitedCapitals: nextVisitedCapitals,
          visitedCities: nextVisitedCities,
          pendingBorder: chainPending,
          borderAdvanceTarget: chainTarget,
          distanceKm: resolvedDistance,
          borderRollsWon: nextWon,
          crossedBorders: nextCrossed,
          recentBonuses: [...events, ...(state.player.recentBonuses ?? [])].slice(
            0,
            MAX_RECENT_BONUSES,
          ),
          lastUpdated: now,
        },
      };
    }

    case 'RECHECK_CROSSINGS': {
      // 用途: MapView が snap-cumulative km override を更新したとき、
      // 既に player.distanceKm が override 後の km を超えていれば
      // bonus 未発火の通過がある。それを catch-up。
      // 注意: 国境 stop (国が切り替わる stop) は silent にクレジットしない
      // — その stop は immigration draw の対象なので、未完了なら
      // pendingBorder にセットして距離をその km まで戻す。
      const now = Date.now();
      const km = state.player.distanceKm;
      const total = routeData.totalDistanceKm;
      const localKm = ((km % total) + total) % total;
      const visitedCapitalsSet = new Set(state.player.visitedCapitals);
      const visitedCitiesSet = new Set(state.player.visitedCities ?? []);
      // Per-capital border model: the immigration roll happens at each
      // country's CAPITAL, so capitals are deferred to the border draw
      // (never silently credited here). Every city — including a
      // country's first/border city like 釜山 — is a normal pass-by and
      // gets credited. So the deferred set is exactly the capital ids
      // (excluding the start capital, which never arms).
      const startCapId = routeData.capitals[0]?.id;
      const borderStopIds = new Set<string>();
      for (const cap of routeData.capitals) {
        if (cap.id !== startCapId) borderStopIds.add(cap.id);
      }
      // 香港/マカオ/台湾 are border cities — defer to the immigration roll,
      // never silently credit them here.
      for (const cid of Object.keys(BORDER_CITY_COUNTRIES)) {
        borderStopIds.add(cid);
      }
      let bonusTokens = 0;
      const events: BonusEvent[] = [];

      for (const cap of routeData.capitals) {
        if (visitedCapitalsSet.has(cap.id)) continue;
        if (borderStopIds.has(cap.id)) continue; // defer to border draw
        const orig = routeData.capitalDistances[cap.id];
        if (orig == null) continue;
        const capKm = getCapitalKm(cap.id, orig);
        if (!(capKm > 0 && capKm <= localKm)) continue;
        visitedCapitalsSet.add(cap.id);
        const irl = isRealLifeVisitedCapital(cap.id);
        bonusTokens += 5;
        events.push({
          kind: 'capital',
          amount: 5,
          label: `🏛 ${cap.nameJa}(${cap.countryJa}) 通過 +5`,
          timestamp: now,
          source: 'walk',
        });
        if (irl) {
          bonusTokens += 5;
          events.push({
            kind: 'capital-landing',
            amount: 5,
            label: `★ 懐かしの${cap.nameJa} 思い出ボーナス +5`,
            timestamp: now,
            source: 'walk',
          });
        }
      }
      for (const city of cities) {
        if (visitedCitiesSet.has(city.id)) continue;
        if (borderStopIds.has(city.id)) continue; // defer to border draw
        const orig = routeData.cityDistances[city.id];
        if (orig == null) continue;
        const cityKm = getCityKm(city.id, orig);
        if (!(cityKm > 0 && cityKm <= localKm)) continue;
        visitedCitiesSet.add(city.id);
        const irl =
          city.visitedInRealLife === true || isRealLifeVisitedCity(city.id);
        bonusTokens += 3;
        events.push({
          kind: 'city',
          amount: 3,
          label: `📍 ${city.nameJa} 立ち寄り +3`,
          timestamp: now,
          source: 'walk',
        });
        if (irl) {
          bonusTokens += 3;
          events.push({
            kind: 'city-irl',
            amount: 3,
            label: `★ 懐かしの${city.nameJa} 思い出ボーナス +3`,
            timestamp: now,
            source: 'walk',
          });
        }
      }

      // Retroactive arming removed — RECHECK only credits visited
      // non-border stops behind the player. Missed border-stops are
      // accepted as gone (clamping back on every override update
      // produced the same UX loop as the disabled RETRY).
      if (events.length === 0) return state;
      return {
        ...state,
        player: {
          ...state.player,
          visitedCapitals: Array.from(visitedCapitalsSet),
          visitedCities: Array.from(visitedCitiesSet),
          availableDice: combineDice(
            state.player.availableDice,
            0,
            bonusTokens,
            state.config.maxDice,
          ),
          recentBonuses: [...events, ...(state.player.recentBonuses ?? [])].slice(
            0,
            MAX_RECENT_BONUSES,
          ),
          lastUpdated: now,
        },
      };
    }

    case 'RETRY_LAST_MISSED_BORDER': {
      // Idempotent recovery for the old RECHECK silent-credit bug, now
      // per-stop. Finds the earliest uncrossed border stop with km <=
      // localKm, arms it, and saves the player's current km as the
      // advance target — so winning the chain returns them where they
      // were. Safe to dispatch on every mount.
      if (state.player.pendingBorder) return state;
      const km = state.player.distanceKm;
      const total = routeData.totalDistanceKm;
      const localKm = ((km % total) + total) % total;
      const crossedSet = new Set(state.player.crossedBorders ?? []);
      const missed = listMissedBorders(localKm, crossedSet);
      if (missed.length === 0) return state;
      const first = missed[0];
      return {
        ...state,
        player: {
          ...state.player,
          pendingBorder: first,
          borderAdvanceTarget: state.player.distanceKm,
          distanceKm: first.atKm,
          lastUpdated: Date.now(),
        },
      };
    }

    case 'CHECK_SCHEDULED_RESET': {
      const now = Date.now();
      const flag = state.player.scheduledResetAt;

      // Already fired (or skipped because we're past target on first load).
      if (flag === 0) return state;

      // First load: decide whether to schedule or skip.
      if (flag === undefined) {
        if (now >= LAUNCH_RESET_AT_MS) {
          // Past target on first load — don't retroactively wipe progress.
          return {
            ...state,
            player: { ...state.player, scheduledResetAt: 0 },
          };
        }
        return {
          ...state,
          player: { ...state.player, scheduledResetAt: LAUNCH_RESET_AT_MS },
        };
      }

      // Scheduled and target reached → fire reset.
      if (now >= flag) {
        clearGameState();
        const fresh = createInitialState();
        return {
          ...fresh,
          player: {
            ...fresh.player,
            scheduledResetAt: 0,
            // Use LAUNCH_RESET_AT_MS (= 5/7 00:00 JST) for startDate,
            // not now. This pins Day 1 to the launch instant whether
            // the reset fires exactly on schedule or a beat later.
            startDate: LAUNCH_RESET_AT_MS,
            // Day-1 login bonus is folded in here. Without this the
            // CLAIM_LOGIN_BONUS effect (only fires once per app mount)
            // would already have run on mount, leaving the freshly-
            // reset state at 0 chips with no bonus credit.
            availableDice: LOGIN_BONUS_CHIPS,
            lastLoginDayStart: startOfDayMs(now),
          },
        };
      }
      return state;
    }

    case 'FORCE_LAUNCH_RESET': {
      // Manual "5/7 Day 1 にリセット" trigger from the UI. Wipes all
      // progress and pins startDate at LAUNCH_RESET_AT_MS so the day
      // counter reads Day 1 the moment 5/7 00:00 JST hits, regardless
      // of whether the user pressed the button before or after that.
      // Clears scheduledResetAt to 0 so the auto-reset doesn't double-fire.
      // Includes the Day-1 login bonus inline (the auto-claim effect
      // only fires once per mount and won't re-trigger after this
      // dispatch).
      clearGameState();
      const fresh = createInitialState();
      const now = Date.now();
      return {
        ...fresh,
        player: {
          ...fresh.player,
          scheduledResetAt: 0,
          startDate: LAUNCH_RESET_AT_MS,
          availableDice: LOGIN_BONUS_CHIPS,
          lastLoginDayStart: startOfDayMs(now),
        },
      };
    }

    case 'SET_DISTANCE_KM': {
      // Manual distance correction (HamburgerMenu → 🔧 現在距離 を補正).
      // Fills visited capitals/cities/crossedBorders for every stop at
      // km' <= km and trims anything beyond — so the new position is
      // self-consistent and border rolls don't re-arm for stops the
      // player has effectively passed.
      const km = Math.max(
        0,
        Math.min(action.km, routeData.totalDistanceKm),
      );
      const startCap = routeData.capitals[0].id;

      const capsSet = new Set<string>([startCap]);
      for (const id of state.player.visitedCapitals) capsSet.add(id);
      for (const cap of routeData.capitals) {
        const capKm = routeData.capitalDistances[cap.id];
        if (capKm != null && capKm <= km) capsSet.add(cap.id);
      }
      const visitedCapitals = Array.from(capsSet).filter((id) => {
        if (id === startCap) return true;
        const capKm = routeData.capitalDistances[id];
        return capKm == null || capKm <= km;
      });

      const citiesSet = new Set<string>();
      for (const id of state.player.visitedCities ?? []) citiesSet.add(id);
      for (const city of cities) {
        const cityKm = routeData.cityDistances[city.id];
        if (cityKm != null && cityKm <= km) citiesSet.add(city.id);
      }
      const visitedCities = Array.from(citiesSet).filter((id) => {
        const cityKm = routeData.cityDistances[id];
        return cityKm == null || cityKm <= km;
      });

      // All border-stops (= where prev stop's country differs from this
      // stop's country) at km' <= km are marked as crossed so
      // findNextBorderStop doesn't re-arm them on the next walk batch.
      const crossedSet = new Set(state.player.crossedBorders ?? []);
      {
        type Stop = { id: string; km: number; country: string };
        const stops: Stop[] = [];
        for (const cap of routeData.capitals) {
          const cKm = routeData.capitalDistances[cap.id];
          if (cKm != null) stops.push({ id: cap.id, km: cKm, country: cap.id });
        }
        for (const city of cities) {
          const cKm = routeData.cityDistances[city.id];
          if (cKm != null) stops.push({ id: city.id, km: cKm, country: city.countryId });
        }
        stops.sort((a, b) => a.km - b.km);
        let prev: string | null = null;
        for (const s of stops) {
          if (prev !== null && prev !== s.country && s.km <= km) {
            crossedSet.add(s.id);
          }
          prev = s.country;
        }
      }
      const crossedBorders = Array.from(crossedSet).filter((id) => {
        const capKm = routeData.capitalDistances[id];
        const cityKm = routeData.cityDistances[id];
        const stopKm = capKm ?? cityKm;
        return stopKm == null || stopKm <= km;
      });

      // Snap today's accounting so distance doesn't get re-rewound by
      // any future logic that compares against todayStartKm+todayKm.
      const dayStart = (() => {
        const d = new Date();
        d.setHours(0, 0, 0, 0);
        return d.getTime();
      })();
      const sameDay = state.player.attributedDayStart === dayStart;
      const todayKmSoFar = sameDay ? (state.player.todayKm ?? 0) : 0;
      const todayStartKm = km - todayKmSoFar;

      return {
        ...state,
        player: {
          ...state.player,
          distanceKm: km,
          currentSquareIndex: squareIndexAtKm(routeData, km),
          visitedCapitals,
          visitedCities,
          crossedBorders,
          pendingBorder: undefined,
          borderAdvanceTarget: undefined,
          todayStartKm,
          lastUpdated: Date.now(),
        },
      };
    }

    case 'RESET_GAME': {
      clearGameState();
      return createInitialState();
    }

    default:
      return state;
  }
}

// Context
interface GameContextValue {
  state: GameState;
  dispatch: React.Dispatch<GameAction>;
}

export const GameContext = createContext<GameContextValue | null>(null);

export function GameProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(gameReducer, undefined, getInitialState);

  // Persist to localStorage on every change
  useEffect(() => {
    saveGameState(state);
  }, [state]);

  // One-shot launch reset (5/7 00:00 JST). Check on mount and every
  // 60 s thereafter so an open PWA also wipes itself at midnight without
  // requiring a refresh. The reducer guards against re-firing once
  // scheduledResetAt has been zeroed.
  useEffect(() => {
    dispatch({ type: 'CHECK_SCHEDULED_RESET' });
    const id = window.setInterval(
      () => dispatch({ type: 'CHECK_SCHEDULED_RESET' }),
      60_000,
    );
    return () => window.clearInterval(id);
  }, []);

  // Auto-claim daily login bonus on mount. The reducer is idempotent
  // (already-claimed-today is a no-op) so it's safe to dispatch on every
  // app open / SW reload.
  useEffect(() => {
    dispatch({ type: 'CLAIM_LOGIN_BONUS' });
  }, []);

  // ONE-TIME recovery for the 2026-06 startup warp. The removed
  // restoreDistanceOnce migration force-set distanceKm from the inflated
  // (Σ dailyHistory.km + todayKm) proxy and shoved the player ~1,100km past
  // 運城 into the 武漢→南京 stretch. We rebuild the true position =
  // 運城 (≈45% along the 西安→鄭州 leg — not a waypoint, so derived from the
  // two surrounding waypoints) + today's ACTUAL walk (distanceKm −
  // todayStartKm), and apply it ONCE via SET_DISTANCE_KM (which also trims
  // the falsely-credited stops between). Flag-gated and strictly
  // backward-only: it fires only when the player sits clearly AHEAD of the
  // rebuilt target (i.e. the ~1,100km warp gap is present), so a player who
  // is legitimately in this region — or has already corrected manually — is
  // never pulled back. Manual fine-tune remains in HamburgerMenu → 現在地を補正.
  useEffect(() => {
    const KEY = 'sanpo-yuncheng-warp-undo-v1';
    try {
      if (localStorage.getItem(KEY) === '1') return;
    } catch {
      return;
    }
    const xian = routeData.cityDistances['CN-XIAN'];
    const zz = routeData.cityDistances['CN-ZHENGZHOU'];
    if (xian != null && zz != null) {
      const yuncheng = xian + 0.45 * (zz - xian);
      const p = state.player;
      const todaysWalk = Math.max(
        0,
        p.distanceKm - (p.todayStartKm ?? p.distanceKm),
      );
      const corrected = yuncheng + todaysWalk;
      // Undo only a genuine forward warp: require the player to sit ≥300km
      // ahead of the rebuilt target. Never moves anyone forward.
      if (Number.isFinite(p.distanceKm) && p.distanceKm > corrected + 300) {
        dispatch({ type: 'SET_DISTANCE_KM', km: corrected });
      }
    }
    try {
      localStorage.setItem(KEY, '1');
    } catch {
      // ignore
    }
    // One-shot: intentionally read first-render state only.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Retroactive border-recovery (RETRY_LAST_MISSED_BORDER) is
  // intentionally NOT dispatched on mount any more. It clamped distance
  // back to the missed border's km on every launch, creating a UX loop
  // where the player kept getting rewound to the same border. Borders
  // are now only armed during forward walking via ADD_STEPS / SYNC;
  // anything silently skipped under the old bug is accepted as lost.

  // When MapView pushes new snap-cumulative km overrides, retroactively
  // award any bonuses for stops that the player already passed under
  // the original route km but whose override km also sits below
  // distanceKm. Idempotent (visited stops are skipped).
  useEffect(() => {
    return subscribeOverrides(() => {
      dispatch({ type: 'RECHECK_CROSSINGS' });
    });
  }, []);

  return (
    <GameContext.Provider value={{ state, dispatch }}>
      {children}
    </GameContext.Provider>
  );
}
