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
import { haversineDistance } from '../utils/geo';
import { loadGameState, saveGameState, clearGameState } from '../utils/storage';
import { rollDice, isTriple, evaluateAllBets, totalBetAmount } from '../utils/sicbo';

// Step-count milestones: { threshold, bonus tokens, label }.
// Sorted ascending so we can pick the largest crossed threshold easily.
const MILESTONES: Array<{ steps: number; tokens: number; label: string }> = [
  { steps: 10_000, tokens: 1, label: '1万歩達成' },
  { steps: 100_000, tokens: 2, label: '10万歩達成' },
  { steps: 1_000_000, tokens: 3, label: '100万歩達成' },
  { steps: 10_000_000, tokens: 5, label: '1000万歩達成' },
  { steps: 100_000_000, tokens: 5, label: '1億歩達成 — 特別演出！' },
];

// City visit bonus: stopping within this radius of an unvisited city
// counts as a visit. 200km is generous on purpose — at the world scale
// of the route, ~1 square ≈ 150km, so this means "you stopped basically
// near it".
const CITY_VISIT_RADIUS_KM = 200;

const MAX_RECENT_BONUSES = 8;

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
    currentSquareIndex: 0,
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
    version: 5,
  };
}

function getInitialState(): GameState {
  return loadGameState() ?? createInitialState();
}

/**
 * Apply N-square advance to player state. Handles:
 * - Lap wrapping
 * - Capital pass-through (first time only): +1 token
 * - Capital exact landing (first time only): +2 tokens (overrides the +1)
 *   (i.e., if it's both passed AND landed on a new capital, gets +2 not +3)
 *
 * Returns updated indices, visited list, completedLaps, and bonus tokens earned.
 */
function applyAdvance(state: GameState, advance: number) {
  const fromSquare = state.player.currentSquareIndex;
  let completedLaps = state.player.completedLaps;
  const newVisited = [...state.player.visitedCapitals];
  let bonusTokens = 0;

  if (advance <= 0) {
    return {
      toIndex: fromSquare,
      newVisited,
      completedLaps,
      bonusTokens: 0,
    };
  }

  // Walk each square between fromSquare+1 and fromSquare+advance.
  // The final square (fromSquare+advance) is the landing square.
  for (let i = fromSquare + 1; i <= fromSquare + advance; i++) {
    const idx = i % routeData.totalSquares;
    const square = routeData.squares[idx];
    if (square.isCapital && square.capitalId) {
      const isNew = !newVisited.includes(square.capitalId);
      const isLanding = i === fromSquare + advance;
      if (isNew) {
        // +2 if exact landing on new capital, otherwise +1 for pass-through
        bonusTokens += isLanding ? 2 : 1;
        newVisited.push(square.capitalId);
      }
    }
  }

  // Lap completion
  let toIndex = fromSquare + advance;
  while (toIndex >= routeData.totalSquares) {
    toIndex -= routeData.totalSquares;
    completedLaps++;
  }

  return { toIndex, newVisited, completedLaps, bonusTokens };
}

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
      const totalSteps = state.player.stepsTowardNextDie + action.steps;
      const newDice = Math.floor(totalSteps / state.config.stepsPerDie);
      const remainder = totalSteps % state.config.stepsPerDie;
      const oldTotal = state.player.totalStepsEntered;
      const newTotal = oldTotal + action.steps;
      const now = Date.now();
      const ms = checkMilestones(
        oldTotal,
        newTotal,
        state.player.claimedMilestones ?? [],
        now,
      );
      return {
        ...state,
        player: {
          ...state.player,
          totalStepsEntered: newTotal,
          availableDice: Math.min(
            state.player.availableDice + newDice + ms.tokens,
            state.config.maxDice,
          ),
          stepsTowardNextDie: remainder,
          claimedMilestones: ms.newClaimed,
          recentBonuses: ms.events.length
            ? [...ms.events, ...(state.player.recentBonuses ?? [])].slice(0, MAX_RECENT_BONUSES)
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

      const totalSteps = state.player.stepsTowardNextDie + delta;
      const newDice = Math.floor(totalSteps / state.config.stepsPerDie);
      const remainder = totalSteps % state.config.stepsPerDie;
      const oldTotal = state.player.totalStepsEntered;
      const newTotal = oldTotal + delta;
      const now = Date.now();
      const ms = checkMilestones(
        oldTotal,
        newTotal,
        state.player.claimedMilestones ?? [],
        now,
      );
      return {
        ...state,
        player: {
          ...state.player,
          totalStepsEntered: newTotal,
          availableDice: Math.min(
            state.player.availableDice + newDice + ms.tokens,
            state.config.maxDice,
          ),
          stepsTowardNextDie: remainder,
          lastSyncTimestamp: action.syncTimestamp,
          todayStepsBaseline: todayAbsolute,
          todayBaselineDayStart: todayStart,
          claimedMilestones: ms.newClaimed,
          recentBonuses: ms.events.length
            ? [...ms.events, ...(state.player.recentBonuses ?? [])].slice(0, MAX_RECENT_BONUSES)
            : state.player.recentBonuses,
          lastUpdated: now,
        },
      };
    }

    case 'ROLL_DIE': {
      if (state.player.availableDice <= 0) return state;

      const roll = Math.floor(Math.random() * 6) + 1;
      const fromSquare = state.player.currentSquareIndex;
      const advance = roll;
      const advanced = applyAdvance(state, advance);

      const diceRoll: DiceRoll = {
        roll,
        timestamp: Date.now(),
        fromSquare,
        toSquare: advanced.toIndex,
      };

      return {
        ...state,
        player: {
          ...state.player,
          currentSquareIndex: advanced.toIndex,
          availableDice: Math.min(
            state.player.availableDice - 1 + advanced.bonusTokens,
            state.config.maxDice,
          ),
          diceHistory: [...state.player.diceHistory, diceRoll],
          visitedCapitals: advanced.newVisited,
          completedLaps: advanced.completedLaps,
          lastUpdated: Date.now(),
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

      const { total: totalAdvance } = evaluateAllBets(bets, dice);

      const fromSquare = state.player.currentSquareIndex;
      const advanced = applyAdvance(state, totalAdvance);

      const sicBoRoll: SicBoRoll = {
        dice,
        sum,
        isTriple: triple,
        tripleValue,
        timestamp: Date.now(),
        bets,
        totalAdvance,
        fromSquare,
        toSquare: advanced.toIndex,
      };

      // City visit bonus — only when actually moving (totalAdvance > 0).
      // Find any city within CITY_VISIT_RADIUS_KM of the landing square
      // that the player hasn't visited yet. Real-life-visited cities pay
      // double (思い出ボーナス).
      const now = Date.now();
      const visitedCities = [...(state.player.visitedCities ?? [])];
      const cityBonusEvents: BonusEvent[] = [];
      let cityBonusTokens = 0;
      if (totalAdvance > 0) {
        const landing = routeData.squares[advanced.toIndex];
        for (const city of cities) {
          if (visitedCities.includes(city.id)) continue;
          const dKm = haversineDistance(landing.lat, landing.lng, city.lat, city.lng);
          if (dKm <= CITY_VISIT_RADIUS_KM) {
            visitedCities.push(city.id);
            const irl = city.visitedInRealLife === true;
            const tokens = irl ? 2 : 1;
            cityBonusTokens += tokens;
            cityBonusEvents.push({
              kind: irl ? 'city-irl' : 'city',
              amount: tokens,
              label: irl
                ? `★ 懐かしの${city.nameJa}を再訪`
                : `${city.nameJa}に立ち寄り`,
              timestamp: now,
            });
          }
        }
      }

      // Capital arrival events (track them as toasts too).
      const capitalEvents: BonusEvent[] = [];
      const previouslyVisited = new Set(state.player.visitedCapitals);
      for (const cid of advanced.newVisited) {
        if (!previouslyVisited.has(cid)) {
          const cap = routeData.capitals.find((c) => c.id === cid);
          if (cap) {
            // Approximate +2 if we LANDED on the capital, +1 if just passing.
            const landingSquare = routeData.squares[advanced.toIndex];
            const isLanding = landingSquare.capitalId === cid;
            capitalEvents.push({
              kind: isLanding ? 'capital-landing' : 'capital',
              amount: isLanding ? 2 : 1,
              label: isLanding
                ? `🏛 ${cap.nameJa}（${cap.countryJa}）到着！`
                : `🏛 ${cap.nameJa}を通過`,
              timestamp: now,
            });
          }
        }
      }

      const allNewEvents = [...capitalEvents, ...cityBonusEvents];
      const tokensAfter =
        state.player.availableDice - totalBet + advanced.bonusTokens + cityBonusTokens;

      return {
        ...state,
        player: {
          ...state.player,
          currentSquareIndex: advanced.toIndex,
          availableDice: Math.max(0, Math.min(tokensAfter, state.config.maxDice)),
          sicBoHistory: [...(state.player.sicBoHistory ?? []), sicBoRoll],
          visitedCapitals: advanced.newVisited,
          visitedCities,
          completedLaps: advanced.completedLaps,
          recentBonuses: allNewEvents.length
            ? [...allNewEvents, ...(state.player.recentBonuses ?? [])].slice(0, MAX_RECENT_BONUSES)
            : state.player.recentBonuses,
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
