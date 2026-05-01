import { useContext, useMemo } from 'react';
import { GameContext } from '../contexts/GameContext';
import { routeData } from '../data';
import { cities } from '../data/cities';
import type { BetSlot } from '../types';

export interface UpcomingStop {
  squareIndex: number;
  squaresAway: number;
  kind: 'capital' | 'city';
  nameJa: string;
  countryJa?: string;
  visitedInRealLife?: boolean;
}

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

    // Walk forward and collect the next few "stops" (capitals + waypoint cities).
    // Used to show "次: 宮崎(3) → 長崎(5) → 福岡(7) → ソウル(11)".
    const upcomingStops: UpcomingStop[] = [];
    const MAX_STOPS = 6;
    for (
      let step = 1;
      step <= routeData.totalSquares && upcomingStops.length < MAX_STOPS;
      step++
    ) {
      const idx = (player.currentSquareIndex + step) % routeData.totalSquares;
      const sq = routeData.squares[idx];
      if (sq.isCapital && sq.capitalId) {
        const cap = routeData.capitals.find((c) => c.id === sq.capitalId);
        if (cap) {
          upcomingStops.push({
            squareIndex: idx,
            squaresAway: step,
            kind: 'capital',
            nameJa: cap.nameJa,
            countryJa: cap.countryJa,
          });
          // Stop after the next capital — beyond that is "the next chapter".
          break;
        }
      } else if (sq.cityId) {
        const city = cities.find((c) => c.id === sq.cityId);
        if (city) {
          upcomingStops.push({
            squareIndex: idx,
            squaresAway: step,
            kind: 'city',
            nameJa: city.nameJa,
            countryJa: city.countryJa,
            visitedInRealLife: city.visitedInRealLife,
          });
        }
      }
    }

    return {
      currentSquare,
      currentSegment,
      nextCapital,
      squaresToNext,
      currentCapital,
      progressPercent,
      visitedCount,
      totalCapitals,
      upcomingStops,
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
