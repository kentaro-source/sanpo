import { useContext, useEffect, useMemo, useState } from 'react';
import { GameContext } from '../contexts/GameContext';
import { routeData } from '../data';
import { cities } from '../data/cities';
import { segmentClassifications } from '../data/segmentMeta';
import { positionAtKm, squareIndexAtKm } from '../data/generateRoute';
import { isRealLifeVisitedCapital } from '../data/realLifeVisited';

/** City IDs that are explicit route waypoints. Non-waypoint cities are
 *  only "projected" onto the nearest route point (for pass-by bonuses)
 *  and must NOT appear in the upcoming-stops list — projecting e.g.
 *  光州 (off to the side of the KR route) makes it look like a stop on
 *  a leg it isn't actually on. */
const WAYPOINT_CITY_IDS = new Set<string>(
  segmentClassifications.flatMap((s) => s.waypointCityIds ?? []),
);
import {
  getCapitalKm,
  getCityKm,
  subscribeOverrides,
} from '../services/playerPath';
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

  // Bump on every playerPath override change so the useMemo below
  // re-runs and picks up the new snap-cumulative km values. Module-level
  // override map is invisible to React's reconciler otherwise.
  const [overrideVersion, setOverrideVersion] = useState(0);
  useEffect(() => {
    return subscribeOverrides(() => setOverrideVersion((v) => v + 1));
  }, []);

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
    // 香港/マカオ/台湾 are recognised as separate countries: counted once
    // their immigration roll is won (their code lands in borderRollsWon).
    const MICRO_COUNTRIES = ['HK', 'MO', 'TW'];
    const microVisited = (player.borderRollsWon ?? []).filter((c) =>
      MICRO_COUNTRIES.includes(c),
    ).length;
    const visitedCount = player.visitedCapitals.length + microVisited;
    const totalCapitals = capitals.length + MICRO_COUNTRIES.length;

    // Build the upcoming stop chain in km space. Walk forward through
    // capital + city km marks and collect the next ~6 stops.
    type Stop = { km: number; kind: 'capital' | 'city'; id: string };
    const allStops: Stop[] = [];
    for (const cap of capitals) {
      const km = capKmFor(cap.id);
      if (km != null) allStops.push({ km, kind: 'capital', id: cap.id });
    }
    for (const cid of Object.keys(routeData.cityDistances)) {
      // Only real route waypoints — skip projected off-route cities.
      if (!WAYPOINT_CITY_IDS.has(cid)) continue;
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
    // Show the next few stops regardless of leg/capital boundaries so
    // the chain stays interesting — the player sees cities AND capitals
    // beyond the current leg's end, not just up to the next capital.
    // Kept at 4 so the bottom panel height (and the 現在地 button
    // clearance above it) stays as tuned.
    const MAX_STOPS = 4;
    let prevDelta = 0;
    for (const s of stopsWithDelta) {
      if (upcomingStops.length >= MAX_STOPS) break;
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
        }
      } else {
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
    player.borderRollsWon?.length,
    player.boosts,
    overrideVersion,
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
  const retryMissedBorder = () =>
    dispatch({ type: 'RETRY_LAST_MISSED_BORDER' });
  const setDistanceKm = (km: number) =>
    dispatch({ type: 'SET_DISTANCE_KM', km });

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
    retryMissedBorder,
    setDistanceKm,
  };
}
