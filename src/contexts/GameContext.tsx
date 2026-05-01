import { createContext, useReducer, useEffect, type ReactNode } from 'react';
import type {
  GameState,
  PlayerState,
  GameConfig,
  DiceRoll,
  BetSlot,
  SicBoRoll,
  BonusEvent,
} from '../types';
import { routeData } from '../data';
import { cities } from '../data/cities';
import { squareIndexAtKm } from '../data/generateRoute';
import { loadGameState, saveGameState, clearGameState } from '../utils/storage';
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

// Distance gained per step at 1.0x multiplier.
const KM_PER_STEP = 0.1; // 100m per step

/**
 * Convert N steps walked at the current point in time into km moved,
 * accounting for any active multiplier window. If the window expires
 * mid-step-batch, the remaining steps are credited at 1.0x.
 */
function stepsToKm(
  steps: number,
  player: PlayerState,
  now: number,
): { km: number; remainingMultiplierUntil: number; remainingMultiplier: number } {
  if (steps <= 0) {
    return {
      km: 0,
      remainingMultiplierUntil: player.multiplierUntil,
      remainingMultiplier: player.currentMultiplier,
    };
  }
  // If multiplier already expired, no bonus.
  if (player.multiplierUntil <= now) {
    return {
      km: steps * KM_PER_STEP,
      remainingMultiplierUntil: 0,
      remainingMultiplier: 1.0,
    };
  }
  // Multiplier is active for the entire batch. We don't sub-divide steps
  // proportionally to wall-clock time within the sync window — practically
  // the user walks all the steps "now" and they all benefit from the
  // active multiplier.
  return {
    km: steps * KM_PER_STEP * player.currentMultiplier,
    remainingMultiplierUntil: player.multiplierUntil,
    remainingMultiplier: player.currentMultiplier,
  };
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
          // +2 if this is the landing position, +1 for pass-through.
          const isLanding = Math.abs(localEnd - capKm) < 0.5; // 500m tolerance
          const tokens = isLanding ? 2 : 1;
          bonusTokens += tokens;
          events.push({
            kind: isLanding ? 'capital-landing' : 'capital',
            amount: tokens,
            label: isLanding
              ? `🏛 ${cap.nameJa}（${cap.countryJa}）到着！`
              : `🏛 ${cap.nameJa}を通過`,
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
    const irl = city.visitedInRealLife === true;
    const tokens = irl ? 2 : 1;
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
  stepsPerDie: 5000,
  maxDice: 5,
};

function createInitialPlayer(): PlayerState {
  return {
    distanceKm: 0,
    currentSquareIndex: 0,
    currentMultiplier: 1.0,
    multiplierUntil: 0,
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
    version: 6,
  };
}

function getInitialState(): GameState {
  return loadGameState() ?? createInitialState();
}

// Legacy applyAdvance(squares-based) removed. Crossings now detected
// via detectCrossings() in distance space.

// Actions
type GameAction =
  | { type: 'ADD_STEPS'; steps: number }
  | { type: 'SYNC_FROM_GOOGLE_FIT'; steps: number; syncTimestamp: number }
  | { type: 'ROLL_DIE' } // legacy single-die roll (kept for now)
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

      // Convert steps to km via current multiplier window.
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
          currentMultiplier: conv.remainingMultiplier,
          multiplierUntil: conv.remainingMultiplierUntil,
          totalStepsEntered: newStepTotal,
          availableDice: Math.min(
            state.player.availableDice + newDice + ms.tokens + cross.bonusTokens,
            state.config.maxDice,
          ),
          stepsTowardNextDie: remainder,
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
      // action.steps is the ABSOLUTE total step count for today (since
      // start-of-day in local time), not an incremental delta. We compute
      // the delta from the last seen baseline so that late-arriving Fit
      // data still gets credited correctly on a subsequent poll.
      const todayAbsolute = action.steps;
      const d = new Date(action.syncTimestamp);
      d.setHours(0, 0, 0, 0);
      const todayStart = d.getTime();

      // First sync after upgrade (no baseline tracked yet) — adopt the
      // current absolute value as the baseline without crediting steps.
      // This avoids double-counting steps already credited under the old
      // incremental sync model.
      const isFirstSyncAfterUpgrade =
        state.player.todayBaselineDayStart === undefined;

      // If the day has rolled over since the last sync, reset baseline.
      const baseline = isFirstSyncAfterUpgrade
        ? todayAbsolute
        : state.player.todayBaselineDayStart === todayStart
          ? state.player.todayStepsBaseline ?? 0
          : 0;

      // Negative delta (e.g. Fit data correction) → ignore, don't subtract.
      const delta = Math.max(0, todayAbsolute - baseline);
      // Only ratchet the baseline UP within a day. Otherwise a transient
      // API hiccup that returned 0 would lower the baseline, then the next
      // successful sync (returning the real total) would credit it all
      // again, double-counting. Same-day baseline is monotonically increasing.
      const newBaseline = Math.max(baseline, todayAbsolute);

      const now = Date.now();
      const totalSteps = state.player.stepsTowardNextDie + delta;
      const newDice = Math.floor(totalSteps / state.config.stepsPerDie);
      const remainder = totalSteps % state.config.stepsPerDie;

      // Convert delta steps to km using active multiplier.
      const conv = stepsToKm(delta, state.player, now);
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
      const newStepTotal = oldStepTotal + delta;
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
          currentMultiplier: conv.remainingMultiplier,
          multiplierUntil: conv.remainingMultiplierUntil,
          totalStepsEntered: newStepTotal,
          availableDice: Math.min(
            state.player.availableDice + newDice + ms.tokens + cross.bonusTokens,
            state.config.maxDice,
          ),
          stepsTowardNextDie: remainder,
          lastSyncTimestamp: action.syncTimestamp,
          todayStepsBaseline: newBaseline,
          todayBaselineDayStart: todayStart,
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

    case 'ROLL_DIE': {
      // Legacy 1-die roll. Distance-based: each pip = 50 km of advance
      // (rough analogue of an old single square). Mostly unused now that
      // Sic Bo drives gameplay via multiplier windows.
      if (state.player.availableDice <= 0) return state;
      const roll = Math.floor(Math.random() * 6) + 1;
      const now = Date.now();
      const oldKm = state.player.distanceKm;
      const newKm = oldKm + roll * 50;
      const cross = detectCrossings(
        oldKm,
        newKm,
        state.player.visitedCapitals,
        state.player.visitedCities ?? [],
        now,
      );
      const diceRoll: DiceRoll = {
        roll,
        timestamp: now,
        fromSquare: state.player.currentSquareIndex,
        toSquare: squareIndexAtKm(routeData, newKm),
      };
      return {
        ...state,
        player: {
          ...state.player,
          distanceKm: newKm,
          currentSquareIndex: squareIndexAtKm(routeData, newKm),
          availableDice: Math.min(
            state.player.availableDice - 1 + cross.bonusTokens,
            state.config.maxDice,
          ),
          diceHistory: [...state.player.diceHistory, diceRoll],
          visitedCapitals: cross.newCapitals,
          visitedCities: cross.newCities,
          completedLaps: state.player.completedLaps + cross.completedLaps,
          recentBonuses: cross.events.length
            ? [...cross.events, ...(state.player.recentBonuses ?? [])].slice(0, MAX_RECENT_BONUSES)
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

      // New: evaluate the bet → multiplier window. Doesn't advance the
      // player directly; instead sets player.currentMultiplier and
      // player.multiplierUntil so future steps benefit/suffer.
      const result = evaluateBetWindow(bets, dice);
      const now = Date.now();
      const multiplierUntil = now + result.windowMs;

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
          // Overwrite any active multiplier.
          currentMultiplier: result.multiplier,
          multiplierUntil,
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
