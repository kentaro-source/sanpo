import { createContext, useReducer, useEffect, type ReactNode } from 'react';
import type { GameState, PlayerState, GameConfig, DiceRoll } from '../types';
import { routeData } from '../data';
import { loadGameState, saveGameState, clearGameState } from '../utils/storage';

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

// Actions
type GameAction =
  | { type: 'ADD_STEPS'; steps: number }
  | { type: 'ROLL_DIE' }
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

    case 'ROLL_DIE': {
      if (state.player.availableDice <= 0) return state;

      const roll = Math.floor(Math.random() * 6) + 1;
      const fromSquare = state.player.currentSquareIndex;
      let newIndex = fromSquare + roll;
      let completedLaps = state.player.completedLaps;

      // Handle lap completion
      if (newIndex >= routeData.totalSquares) {
        newIndex = newIndex % routeData.totalSquares;
        completedLaps++;
      }

      // Check for capitals passed or landed on
      const newVisited = [...state.player.visitedCapitals];
      const start = fromSquare + 1;
      const end = fromSquare + roll;
      for (let i = start; i <= end; i++) {
        const idx = i % routeData.totalSquares;
        const square = routeData.squares[idx];
        if (square.isCapital && square.capitalId && !newVisited.includes(square.capitalId)) {
          newVisited.push(square.capitalId);
        }
      }

      // Bonus: landing exactly on a capital gives +1 die
      const landedSquare = routeData.squares[newIndex];
      const capitalBonus = landedSquare.isCapital && landedSquare.capitalId !== routeData.capitals[0].id ? 1 : 0;

      const diceRoll: DiceRoll = {
        roll,
        timestamp: Date.now(),
        fromSquare,
        toSquare: newIndex,
      };

      return {
        ...state,
        player: {
          ...state.player,
          currentSquareIndex: newIndex,
          availableDice: Math.min(state.player.availableDice - 1 + capitalBonus, state.config.maxDice),
          diceHistory: [...state.player.diceHistory, diceRoll],
          visitedCapitals: newVisited,
          completedLaps,
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
