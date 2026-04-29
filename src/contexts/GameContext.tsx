import { createContext, useReducer, useEffect, type ReactNode } from 'react';
import type {
  GameState,
  PlayerState,
  GameConfig,
  DiceRoll,
  BetSlot,
  SicBoRoll,
} from '../types';
import { routeData } from '../data';
import { loadGameState, saveGameState, clearGameState } from '../utils/storage';
import { rollDice, isTriple, evaluateAllBets, totalBetAmount } from '../utils/sicbo';

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
    startDate: Date.now(),
    lastUpdated: Date.now(),
    completedLaps: 0,
  };
}

function createInitialState(): GameState {
  return {
    player: createInitialPlayer(),
    config: DEFAULT_CONFIG,
    version: 1,
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
      return {
        ...state,
        player: {
          ...state.player,
          totalStepsEntered: state.player.totalStepsEntered + action.steps,
          availableDice: Math.min(state.player.availableDice + newDice, state.config.maxDice),
          stepsTowardNextDie: remainder,
          lastUpdated: Date.now(),
        },
      };
    }

    case 'SYNC_FROM_GOOGLE_FIT': {
      // Steps fetched from Google Fit between lastSyncTimestamp and now.
      // Same logic as ADD_STEPS, plus update lastSyncTimestamp.
      const totalSteps = state.player.stepsTowardNextDie + action.steps;
      const newDice = Math.floor(totalSteps / state.config.stepsPerDie);
      const remainder = totalSteps % state.config.stepsPerDie;
      return {
        ...state,
        player: {
          ...state.player,
          totalStepsEntered: state.player.totalStepsEntered + action.steps,
          availableDice: Math.min(state.player.availableDice + newDice, state.config.maxDice),
          stepsTowardNextDie: remainder,
          lastSyncTimestamp: action.syncTimestamp,
          lastUpdated: Date.now(),
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

      const tokensAfter =
        state.player.availableDice - totalBet + advanced.bonusTokens;

      return {
        ...state,
        player: {
          ...state.player,
          currentSquareIndex: advanced.toIndex,
          availableDice: Math.max(0, Math.min(tokensAfter, state.config.maxDice)),
          sicBoHistory: [...(state.player.sicBoHistory ?? []), sicBoRoll],
          visitedCapitals: advanced.newVisited,
          completedLaps: advanced.completedLaps,
          lastUpdated: Date.now(),
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
