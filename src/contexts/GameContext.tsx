import { createContext, useReducer, useEffect, type ReactNode } from 'react';
import type {
  GameState,
  PlayerState,
  GameConfig,
  BetSlot,
  SicBoRoll,
  BonusEvent,
  Boost,
} from '../types';
import { routeData } from '../data';
import { cities } from '../data/cities';
import { squareIndexAtKm } from '../data/generateRoute';
import {
  isRealLifeVisitedCapital,
  isRealLifeVisitedCity,
} from '../data/realLifeVisited';
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
function effectiveMultiplier(boosts: Boost[] | undefined, now: number): number {
  if (!boosts || boosts.length === 0) return 1.0;
  let m = 1;
  for (const b of boosts) {
    if (b.expiresAt > now && Number.isFinite(b.multiplier)) {
      m *= b.multiplier;
    }
  }
  return Number.isFinite(m) && m > 0 ? m : 1.0;
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
      const capKm = routeData.capitalDistances[cap.id];
      if (capKm == null) continue;
      if (capKm > localStart && capKm <= localEnd) {
        if (!newCapitalsSet.has(cap.id)) {
          newCapitalsSet.add(cap.id);
          // No landing/pass-through distinction: in the continuous distance
          // model the player crosses every capital exactly once with no
          // mechanic to "stop on" one. Real-life-visited capitals award
          // a bigger bonus for the 思い出 effect.
          const irl = isRealLifeVisitedCapital(cap.id);
          const tokens = irl ? 5 : 2;
          bonusTokens += tokens;
          events.push({
            kind: irl ? 'capital-landing' : 'capital',
            amount: tokens,
            label: irl
              ? `★ ${cap.nameJa}（${cap.countryJa}）懐かしの首都！`
              : `🏛 ${cap.nameJa}（${cap.countryJa}）通過`,
            timestamp: now,
          });
        }
      }
    }
    // Cities crossed in this lap window
    for (const cid of Object.keys(routeData.cityDistances)) {
      const cityKm = routeData.cityDistances[cid];
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
    const tokens = irl ? 3 : 1;
    bonusTokens += tokens;
    events.push({
      kind: irl ? 'city-irl' : 'city',
      amount: tokens,
      label: irl
        ? `★ 懐かしの${city.nameJa}を再訪`
        : `${city.nameJa}に立ち寄り`,
      timestamp: now,
    });
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
  stepsPerDie: 1000, // v8: 5000→1000 — more frequent betting to suit slow walking
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
  if (loaded) return loaded;
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
  | { type: 'RESET_GAME' };

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
      const newKm = oldKm + conv.km;

      // Detect capital/city crossings between oldKm and newKm.
      const cross = detectCrossings(
        oldKm,
        newKm,
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
      return {
        ...state,
        player: {
          ...state.player,
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
          visitedCapitals: cross.newCapitals,
          visitedCities: cross.newCities,
          completedLaps: state.player.completedLaps + cross.completedLaps,
          claimedMilestones: ms.newClaimed,
          recentBonuses: allEvents.length
            ? [...allEvents, ...(state.player.recentBonuses ?? [])].slice(0, MAX_RECENT_BONUSES)
            : state.player.recentBonuses,
          lastUpdated: now,
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
      const newKm = oldKm + conv.km;

      // Detect crossings between oldKm and newKm.
      const cross = detectCrossings(
        oldKm,
        newKm,
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
      return {
        ...state,
        player: {
          ...state.player,
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
          visitedCapitals: cross.newCapitals,
          visitedCities: cross.newCities,
          completedLaps: state.player.completedLaps + cross.completedLaps,
          claimedMilestones: ms.newClaimed,
          recentBonuses: allEvents.length
            ? [...allEvents, ...(state.player.recentBonuses ?? [])].slice(0, MAX_RECENT_BONUSES)
            : state.player.recentBonuses,
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

      // Evaluate the bet → new boost window. Stacks on top of any active
      // boosts (multiplicatively): chaining wins compounds the speedup,
      // which is the whole point per the user's "倍を積み上げて" model.
      const result = evaluateBetWindow(bets, dice);
      const now = Date.now();
      const newBoost: Boost = {
        multiplier: result.multiplier,
        expiresAt: now + result.windowMs,
        createdAt: now,
      };
      const stackedBoosts = [
        ...pruneExpiredBoosts(state.player.boosts, now),
        newBoost,
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

      return {
        ...state,
        player: {
          ...state.player,
          // Bet tokens are spent, no advance.
          availableDice: Math.max(0, state.player.availableDice - totalBet),
          // Stack the new boost on top of any active ones (instead of
          // the v6 single-slot overwrite).
          boosts: stackedBoosts,
          sicBoHistory: [...(state.player.sicBoHistory ?? []), sicBoRoll],
          recentBonuses: [event, ...(state.player.recentBonuses ?? [])].slice(0, MAX_RECENT_BONUSES),
          lastUpdated: now,
        },
      };
    }

    case 'UPDATE_CONFIG': {
      return {
        ...state,
        config: { ...state.config, ...action.config },
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

  return (
    <GameContext.Provider value={{ state, dispatch }}>
      {children}
    </GameContext.Provider>
  );
}
