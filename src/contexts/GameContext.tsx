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
          });
          if (irl) {
            bonusTokens += 5;
            events.push({
              kind: 'capital-landing',
              amount: 5,
              label: `★ 懐かしの${cap.nameJa} 思い出ボーナス +5`,
              timestamp: now,
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
    });
    if (irl) {
      bonusTokens += 3;
      events.push({
        kind: 'city-irl',
        amount: 3,
        label: `★ 懐かしの${city.nameJa} 思い出ボーナス +3`,
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

/**
 * Set of country codes the player has already entered. Capitals.id is
 * itself the ISO alpha-2 code, so `visitedCapitals` already contains
 * country codes; we additionally fold in the country of every visited
 * city so a city-only border crossing (e.g. Busan in KR) marks Korea
 * as entered without waiting for the player to also reach Seoul.
 */
function visitedCountrySet(
  visitedCapitals: string[],
  visitedCities: string[],
): Set<string> {
  const out = new Set(visitedCapitals);
  for (const cid of visitedCities) {
    const city = cities.find((c) => c.id === cid);
    if (city) out.add(city.countryId);
  }
  return out;
}

type BorderInfo = NonNullable<PlayerState['pendingBorder']>;

/**
 * Find the first stop (city OR capital) between oldKm (exclusive) and
 * newKm (inclusive) whose country has not yet been entered. That stop
 * marks the country boundary — the player is clamped here until they
 * win the border draw. Uses km order so the FIRST foreign stop wins
 * (Busan over Seoul on a JP→KR leg).
 */
function findNextBorder(
  oldKm: number,
  newKm: number,
  visitedCountries: Set<string>,
): BorderInfo | null {
  let best: BorderInfo | null = null;
  const consider = (km: number, info: BorderInfo) => {
    if (visitedCountries.has(info.country)) return;
    if (km <= oldKm || km > newKm) return;
    if (!best || km < best.atKm) best = info;
  };
  for (const cap of routeData.capitals) {
    const orig = routeData.capitalDistances[cap.id];
    if (orig == null) continue;
    const km = getCapitalKm(cap.id, orig);
    consider(km, { kind: 'capital', id: cap.id, atKm: km, country: cap.id });
  }
  for (const city of cities) {
    const orig = routeData.cityDistances[city.id];
    if (orig == null) continue;
    const km = getCityKm(city.id, orig);
    consider(km, {
      kind: 'city',
      id: city.id,
      atKm: km,
      country: city.countryId,
    });
  }
  // The immigration draw demands a random 1–5 chip "fee" — fixed once
  // here for this border ("borders take your money" satire).
  const picked = best as BorderInfo | null;
  if (picked) picked.cost = 1 + Math.floor(Math.random() * 5);
  return picked;
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
  };
}

function createInitialState(): GameState {
  return {
    player: createInitialPlayer(),
    config: DEFAULT_CONFIG,
    version: 9,
  };
}

function getInitialState(): GameState {
  const loaded = loadGameState();
  if (loaded) {
    return loaded;
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
      const visitedCountries = visitedCountrySet(
        state.player.visitedCapitals,
        state.player.visitedCities ?? [],
      );
      const newBorder = existingBorder
        ? null
        : findNextBorder(oldKm, fullNewKm, visitedCountries);
      const pendingBorder = existingBorder ?? newBorder ?? undefined;
      const borderCap = pendingBorder?.atKm;
      // Use a small epsilon so detectCrossings doesn't credit the border
      // stop itself — that's deferred to ROLL_BORDER on a successful
      // roll. Cities on the way (within the same already-visited country)
      // are still credited.
      const newKm =
        borderCap != null && borderCap < fullNewKm ? borderCap : fullNewKm;
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

      // First Fit sync OF TODAY: adopt the absolute as baseline without
      // crediting it. We deliberately key off lastSyncTimestamp (not
      // attributedTodaySteps) because attributedTodaySteps can be > 0 by
      // the time the first Fit sync arrives — the pedometer is auto-on
      // and may have already added a few (real or false-positive) steps
      // before Fit's first response lands. Crediting Fit's accumulated
      // daily total on top of those would yank the player far ahead
      // (the '+6732歩 三軒茶屋' bug).
      const lastSyncMs = state.player.lastSyncTimestamp ?? 0;
      const isFirstFitSyncToday = lastSyncMs < todayStart;

      const contribution = isFirstFitSyncToday
        ? 0
        : Math.max(0, todayAbsolute - attributedSoFar);
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
      const visitedCountries = visitedCountrySet(
        state.player.visitedCapitals,
        state.player.visitedCities ?? [],
      );
      const newBorder = existingBorder
        ? null
        : findNextBorder(oldKm, fullNewKm, visitedCountries);
      const pendingBorder = existingBorder ?? newBorder ?? undefined;
      const borderCap = pendingBorder?.atKm;
      const newKm =
        borderCap != null && borderCap < fullNewKm ? borderCap : fullNewKm;
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
          }
        : {
            kind: 'city',
            amount: 0,
            label: `ハズレ… ×${LOSS_MULTIPLIER} ${durLabel}`,
            timestamp: now,
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
        });
        if (irl) {
          bonus += 5;
          events.push({
            kind: 'capital-landing',
            amount: 5,
            label: `★ 懐かしの${stopName} 思い出 +5`,
            timestamp: now,
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
        });
        if (irl) {
          bonus += 3;
          events.push({
            kind: 'city-irl',
            amount: 3,
            label: `★ 懐かしの${stopName} 思い出 +3`,
            timestamp: now,
          });
        }
        if (!nextVisitedCities.includes(pb.id)) {
          nextVisitedCities = [...nextVisitedCities, pb.id];
        }
      }
      return {
        ...state,
        player: {
          ...state.player,
          availableDice: combineDice(spent, 0, bonus, state.config.maxDice),
          visitedCapitals: nextVisitedCapitals,
          visitedCities: nextVisitedCities,
          pendingBorder: undefined,
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
      // 注意: 未訪問国の停車地は silent にクレジットしない — その停車地
      // は国境ロールの対象なので、未着手なら pendingBorder にセットして
      // 距離をその km まで戻す（国境を素通りさせない）。
      const now = Date.now();
      const km = state.player.distanceKm;
      const total = routeData.totalDistanceKm;
      const localKm = ((km % total) + total) % total;
      const visitedCapitalsSet = new Set(state.player.visitedCapitals);
      const visitedCitiesSet = new Set(state.player.visitedCities ?? []);
      const visitedCountries = visitedCountrySet(
        state.player.visitedCapitals,
        state.player.visitedCities ?? [],
      );
      let bonusTokens = 0;
      const events: BonusEvent[] = [];

      // The earliest stop in an unvisited country that the player has
      // somehow already walked past — arm pendingBorder instead of
      // silently crediting it.
      let missedBorderKm = Infinity;
      let missedBorderInfo: BorderInfo | null = null;
      const considerMissed = (info: BorderInfo) => {
        if (info.atKm < missedBorderKm) {
          missedBorderKm = info.atKm;
          missedBorderInfo = info;
        }
      };

      for (const cap of routeData.capitals) {
        if (visitedCapitalsSet.has(cap.id)) continue;
        const orig = routeData.capitalDistances[cap.id];
        if (orig == null) continue;
        const capKm = getCapitalKm(cap.id, orig);
        if (!(capKm > 0 && capKm <= localKm)) continue;
        if (!visitedCountries.has(cap.id)) {
          considerMissed({
            kind: 'capital',
            id: cap.id,
            atKm: capKm,
            country: cap.id,
          });
          continue;
        }
        visitedCapitalsSet.add(cap.id);
        const irl = isRealLifeVisitedCapital(cap.id);
        bonusTokens += 5;
        events.push({
          kind: 'capital',
          amount: 5,
          label: `🏛 ${cap.nameJa}（${cap.countryJa}）通過 +5`,
          timestamp: now,
        });
        if (irl) {
          bonusTokens += 5;
          events.push({
            kind: 'capital-landing',
            amount: 5,
            label: `★ 懐かしの${cap.nameJa} 思い出ボーナス +5`,
            timestamp: now,
          });
        }
      }
      for (const city of cities) {
        if (visitedCitiesSet.has(city.id)) continue;
        const orig = routeData.cityDistances[city.id];
        if (orig == null) continue;
        const cityKm = getCityKm(city.id, orig);
        if (!(cityKm > 0 && cityKm <= localKm)) continue;
        if (!visitedCountries.has(city.countryId)) {
          considerMissed({
            kind: 'city',
            id: city.id,
            atKm: cityKm,
            country: city.countryId,
          });
          continue;
        }
        visitedCitiesSet.add(city.id);
        const irl =
          city.visitedInRealLife === true || isRealLifeVisitedCity(city.id);
        bonusTokens += 3;
        events.push({
          kind: 'city',
          amount: 3,
          label: `📍 ${city.nameJa} 立ち寄り +3`,
          timestamp: now,
        });
        if (irl) {
          bonusTokens += 3;
          events.push({
            kind: 'city-irl',
            amount: 3,
            label: `★ 懐かしの${city.nameJa} 思い出ボーナス +3`,
            timestamp: now,
          });
        }
      }

      // Arm the missed border (if any) and clamp player back to its km.
      // Don't overwrite an already-pending border.
      const mb = missedBorderInfo as BorderInfo | null;
      let nextPending = state.player.pendingBorder;
      let nextDistance = state.player.distanceKm;
      if (mb && !nextPending) {
        mb.cost = 1 + Math.floor(Math.random() * 5);
        nextPending = mb;
        nextDistance = Math.max(0, mb.atKm - 0.001);
      }

      if (events.length === 0 && !mb) return state;
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
          distanceKm: nextDistance,
          pendingBorder: nextPending,
          recentBonuses: [...events, ...(state.player.recentBonuses ?? [])].slice(
            0,
            MAX_RECENT_BONUSES,
          ),
          lastUpdated: now,
        },
      };
    }

    case 'RETRY_LAST_MISSED_BORDER': {
      // One-shot recovery: the older RECHECK_CROSSINGS would silently
      // credit a country's entry city as visited (skipping the border
      // draw). For saves where that already happened, this action picks
      // the latest such country (highest-capital-km among capitals not
      // visited but with cities visited) and re-arms its earliest stop
      // as a pendingBorder, un-crediting the city. The GameProvider
      // dispatches this once per save, gated by a localStorage flag.
      if (state.player.pendingBorder) return state;
      const visitedCapitalsSet = new Set(state.player.visitedCapitals);
      const visitedCitiesSet = new Set(state.player.visitedCities ?? []);

      let pickedCountry: string | null = null;
      let pickedCapitalKm = -Infinity;
      for (const cap of routeData.capitals) {
        if (visitedCapitalsSet.has(cap.id)) continue;
        const hasCity = (state.player.visitedCities ?? []).some((cityId) => {
          const c = cities.find((cc) => cc.id === cityId);
          return c?.countryId === cap.id;
        });
        if (!hasCity) continue;
        const capOrig = routeData.capitalDistances[cap.id];
        if (capOrig == null) continue;
        const capKm = getCapitalKm(cap.id, capOrig);
        if (capKm > pickedCapitalKm) {
          pickedCapitalKm = capKm;
          pickedCountry = cap.id;
        }
      }
      if (!pickedCountry) return state;

      // Earliest visited city in that country = the silent-skipped
      // entry stop. Un-credit it and arm pendingBorder there.
      let earliestCityId: string | null = null;
      let earliestCityKm = Infinity;
      for (const c of cities) {
        if (c.countryId !== pickedCountry) continue;
        if (!visitedCitiesSet.has(c.id)) continue;
        const orig = routeData.cityDistances[c.id];
        if (orig == null) continue;
        const km = getCityKm(c.id, orig);
        if (km < earliestCityKm) {
          earliestCityKm = km;
          earliestCityId = c.id;
        }
      }
      if (!earliestCityId) return state;

      visitedCitiesSet.delete(earliestCityId);
      const cost = 1 + Math.floor(Math.random() * 5);
      const armed: NonNullable<PlayerState['pendingBorder']> = {
        kind: 'city',
        id: earliestCityId,
        atKm: earliestCityKm,
        country: pickedCountry,
        cost,
      };
      return {
        ...state,
        player: {
          ...state.player,
          visitedCities: Array.from(visitedCitiesSet),
          pendingBorder: armed,
          distanceKm: Math.max(0, earliestCityKm - 0.001),
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

  // One-shot recovery for saves where the old RECHECK_CROSSINGS silently
  // credited a border-crossing city as visited (skipping the immigration
  // draw). Gated by a localStorage flag so it runs at most once per
  // install. Going forward, RECHECK now arms pendingBorder instead of
  // silent-crediting unvisited-country stops, so this hook is just a
  // back-compat catch-up.
  useEffect(() => {
    const KEY = 'sanpo-retry-missed-border-once-v1';
    try {
      if (localStorage.getItem(KEY) === '1') return;
      dispatch({ type: 'RETRY_LAST_MISSED_BORDER' });
      localStorage.setItem(KEY, '1');
    } catch {
      // localStorage unavailable — best-effort skip.
    }
  }, []);

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
