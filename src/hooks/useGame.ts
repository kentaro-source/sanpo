import { useContext, useMemo } from 'react';
import { GameContext } from '../contexts/GameContext';
import { routeData } from '../data';
import type { BetSlot } from '../types';

export function useGame() {
  const ctx = useContext(GameContext);
  if (!ctx) throw new Error('useGame must be used within GameProvider');

  const { state, dispatch } = ctx;
  const { player } = state;

  const derived = useMemo(() => {
    const currentSquare = routeData.squares[player.currentSquareIndex];
    const currentSegment = routeData.segments[currentSquare.segmentIndex];

    // Find next capital
    let nextCapitalIndex = -1;
    for (let i = player.currentSquareIndex + 1; i < routeData.totalSquares + player.currentSquareIndex; i++) {
      const idx = i % routeData.totalSquares;
      const sq = routeData.squares[idx];
      if (sq.isCapital && sq.capitalId) {
        nextCapitalIndex = idx;
        break;
      }
    }

    const nextCapital = nextCapitalIndex >= 0
      ? routeData.capitals.find(c => c.id === routeData.squares[nextCapitalIndex].capitalId)
      : null;

    // Squares remaining to next capital
    const squaresToNext = nextCapitalIndex >= 0
      ? (nextCapitalIndex > player.currentSquareIndex
          ? nextCapitalIndex - player.currentSquareIndex
          : routeData.totalSquares - player.currentSquareIndex + nextCapitalIndex)
      : 0;

    // Current capital (if standing on one)
    const currentCapital = currentSquare.isCapital && currentSquare.capitalId
      ? routeData.capitals.find(c => c.id === currentSquare.capitalId) ?? null
      : null;

    const progressPercent = (player.currentSquareIndex / routeData.totalSquares) * 100;
    const visitedCount = player.visitedCapitals.length;
    const totalCapitals = routeData.capitals.length;

    return {
      currentSquare,
      currentSegment,
      nextCapital,
      squaresToNext,
      currentCapital,
      progressPercent,
      visitedCount,
      totalCapitals,
    };
  }, [player.currentSquareIndex, player.visitedCapitals.length]);

  const addSteps = (steps: number) => dispatch({ type: 'ADD_STEPS', steps });
  const syncFromGoogleFit = (steps: number, syncTimestamp: number) =>
    dispatch({ type: 'SYNC_FROM_GOOGLE_FIT', steps, syncTimestamp });
  const rollDie = () => dispatch({ type: 'ROLL_DIE' });
  const rollSicBo = (bets: BetSlot[], dice?: [number, number, number]) =>
    dispatch({ type: 'ROLL_SICBO', bets, dice });
  const resetGame = () => dispatch({ type: 'RESET_GAME' });

  return {
    ...derived,
    player,
    config: state.config,
    routeData,
    addSteps,
    syncFromGoogleFit,
    rollDie,
    rollSicBo,
    resetGame,
  };
}
