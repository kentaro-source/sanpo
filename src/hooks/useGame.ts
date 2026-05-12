import { useContext, useMemo } from 'react';
import { GameContext } from '../contexts/GameContext';
import { routeData } from '../data';
import { cities } from '../data/cities';
import { positionAtKm, squareIndexAtKm } from '../data/generateRoute';
import { isRealLifeVisitedCapital } from '../data/realLifeVisited';
import { getCapitalKm, getCityKm } from '../services/playerPath';
import type { BetSlot } from '../types';

export interface UpcomingStop {
  squareIndex: number;
  /** km from current position to this stop. */
  kmAway: number;
  /** km from the previous stop (or from current pos for the first). */
  kmFromPrev: number;
  kind: 'capital' | 'city';
  nameJa: string;
  /** English / romanized name (for the InfoWindow-style detail row). */
  name?: string;
  countryJa?: string;
  /** ISO 3166-1 alpha-2 country code (for flag emoji rendering). */
  countryCode?: string;
  visitedInRealLife?: boolean;
  /** One-line trivia / description (cities only; capitals get country). */
  description?: string;
}

export function useGame() {
  const ctx = useContext(GameContext);
  if (!ctx) throw new Error('useGame must be used within GameProvider');

  const { state, dispatch } = ctx;
  const { player } = state;

  const derived = useMemo(() => {
    const total = routeData.totalDistanceKm;
    const distanceKm = player.distanceKm;
    const localKm = ((distanceKm % total) + total) % total;

    // Position on the route (interpolated for smooth map placement).
    const position = positionAtKm(routeData, distanceKm);
    const currentSquareIdx = squareIndexAtKm(routeData, distanceKm);
    const currentSquare = routeData.squares[currentSquareIdx];
    const currentSegment = routeData.segments[currentSquare.segmentIndex];

    // Next capital ahead (in km terms).
    const capitals = routeData.capitals;
    const capitalDistances = routeData.capitalDistances;
    // Use snap-cumulative km overrides when available (MapView populates
    // these for the visible window so route km matches what's drawn on
    // the map). Out-of-window stops fall back to routeData's
    // squares-coarse × 1.4 estimate.
    const capKmFor = (id: string): number | null => {
      const orig = capitalDistances[id];
      if (orig == null) return null;
      return getCapitalKm(id, orig);
    };
    const cityKmFor = (id: string): number | null => {
      const orig = routeData.cityDistances[id];
      if (orig == null) return null;
      return getCityKm(id, orig);
    };
    let nextCapital: typeof capitals[number] | null = null;
    let nextCapitalKm = Infinity;
    for (const cap of capitals) {
      const capKm = capKmFor(cap.id);
      if (capKm == null) continue;
      let delta = capKm - localKm;
      if (delta <= 0) delta += total; // wrap around
      if (delta > 0 && delta < nextCapitalKm) {
        nextCapitalKm = delta;
        nextCapital = cap;
      }
    }
    const kmToNextCapital = nextCapital ? nextCapitalKm : 0;

    // Are we standing right on a capital? (within 500m)
    const currentCapital = (() => {
      for (const cap of capitals) {
        const capKm = capKmFor(cap.id);
        if (capKm != null && Math.abs(capKm - localKm) < 0.5) return cap;
      }
      return null;
    })();

    const progressPercent = (localKm / total) * 100;
    const visitedCount = player.visitedCapitals.length;
    const totalCapitals = capitals.length;

    // Build the upcoming stop chain in km space. Walk forward through
    // capital + city km marks and collect the next ~6 stops.
    type Stop = { km: number; kind: 'capital' | 'city'; id: string };
    const allStops: Stop[] = [];
    for (const cap of capitals) {
      const km = capKmFor(cap.id);
      if (km != null) allStops.push({ km, kind: 'capital', id: cap.id });
    }
    for (const cid of Object.keys(routeData.cityDistances)) {
      const km = cityKmFor(cid);
      if (km != null) allStops.push({ km, kind: 'city', id: cid });
    }

    // Sort by relative km from current position (wrapping around).
    const stopsWithDelta = allStops
      .map((s) => {
        let delta = s.km - localKm;
        if (delta <= 0) delta += total;
        return { ...s, delta };
      })
      .filter((s) => s.delta > 0.01)
      .sort((a, b) => a.delta - b.delta);

    const upcomingStops: UpcomingStop[] = [];
    // Tuned down from 6 → 4 so each row in ProgressInfo is taller and
    // easier to tap without accidental neighbor hits. The last slot is
    // always reserved for the next capital so the player can always
    // see "where this leg ends" even when many cities crowd in front.
    const MAX_STOPS = 4;
    const MAX_CITIES = MAX_STOPS - 1;
    let prevDelta = 0;
    for (const s of stopsWithDelta) {
      if (s.kind === 'capital') {
        const cap = capitals.find((c) => c.id === s.id);
        if (cap) {
          upcomingStops.push({
            squareIndex: 0, // unused now, kept for type compat
            kmAway: s.delta,
            kmFromPrev: s.delta - prevDelta,
            kind: 'capital',
            nameJa: cap.nameJa,
            name: cap.name,
            countryJa: cap.countryJa,
            countryCode: cap.id,
            visitedInRealLife: isRealLifeVisitedCapital(cap.id),
            description: `${cap.country} の首都`,
          });
          prevDelta = s.delta;
          break; // stop chain ends at next capital
        }
      } else {
        // Skip cities once we've filled the city slots — keep the
        // remaining iterations searching for the next capital.
        if (upcomingStops.length >= MAX_CITIES) continue;
        const city = cities.find((c) => c.id === s.id);
        if (city) {
          upcomingStops.push({
            squareIndex: 0,
            kmAway: s.delta,
            kmFromPrev: s.delta - prevDelta,
            kind: 'city',
            nameJa: city.nameJa,
            name: city.name,
            countryJa: city.countryJa,
            countryCode: city.countryId,
            visitedInRealLife: city.visitedInRealLife,
            description: city.description,
          });
          prevDelta = s.delta;
        }
      }
    }

    // Active multiplier stack — effective multiplier = product of
    // unexpired Boost entries, clamped to [0.25, 30] (1km/h floor,
    // 120km/h cap) to match the gameplay constraints.
    const now = Date.now();
    const liveBoosts = (player.boosts ?? []).filter((b) => b.expiresAt > now);
    let effectiveMult = 1;
    for (const b of liveBoosts) {
      if (Number.isFinite(b.multiplier)) effectiveMult *= b.multiplier;
    }
    if (!Number.isFinite(effectiveMult) || effectiveMult <= 0) effectiveMult = 1;
    if (effectiveMult < 0.25) effectiveMult = 0.25;
    if (effectiveMult > 1000) effectiveMult = 1000;
    const multiplierActive = liveBoosts.length > 0 && effectiveMult !== 1;
    // Time until the SOONEST boost expires (when stack starts shrinking).
    const multiplierMsLeft = liveBoosts.length
      ? Math.max(0, Math.min(...liveBoosts.map((b) => b.expiresAt)) - now)
      : 0;

    return {
      currentSquare,
      currentSegment,
      position,
      distanceKm,
      localKm,
      nextCapital,
      kmToNextCapital,
      currentCapital,
      progressPercent,
      visitedCount,
      totalCapitals,
      upcomingStops,
      multiplierActive,
      multiplierMsLeft,
      effectiveMultiplier: effectiveMult,
      activeBoosts: liveBoosts,
    };
  }, [
    player.distanceKm,
    player.visitedCapitals.length,
    player.boosts,
  ]);

  const addSteps = (steps: number) => dispatch({ type: 'ADD_STEPS', steps });
  const syncFromGoogleFit = (steps: number, syncTimestamp: number) =>
    dispatch({ type: 'SYNC_FROM_GOOGLE_FIT', steps, syncTimestamp });
  const rollSicBo = (bets: BetSlot[], dice?: [number, number, number]) =>
    dispatch({ type: 'ROLL_SICBO', bets, dice });
  const rollBorder = (
    choice: 'red' | 'black',
    outcome: 'win' | 'lose',
    cardLabel: string,
  ) => dispatch({ type: 'ROLL_BORDER', choice, outcome, cardLabel });
  const forceLaunchReset = () => dispatch({ type: 'FORCE_LAUNCH_RESET' });
  const resetGame = () => dispatch({ type: 'RESET_GAME' });

  return {
    ...derived,
    player,
    config: state.config,
    routeData,
    addSteps,
    syncFromGoogleFit,
    rollSicBo,
    rollBorder,
    forceLaunchReset,
    resetGame,
  };
}
