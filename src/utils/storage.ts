import type { GameState, PlayerState } from '../types';

const STORAGE_KEY = 'sanpo-game-state';
const WATCHDOG_KEY = 'sanpo-progress-watchdog';

// Version 8: per-day step attribution renamed from todayStepsBaseline
// (Fit-only) to attributedTodaySteps (sum across all sources). Required
// to coexist with the in-browser pedometer that adds steps in real time
// while Fit Cloud lags behind. Watchdog preserves distanceKm across the
// version bump.
const CURRENT_VERSION = 8;

/** Replace any NaN/null/undefined number field with a safe default. */
function sanitizeNum(v: unknown, fallback: number): number {
  return typeof v === 'number' && Number.isFinite(v) ? v : fallback;
}

/**
 * Critical progression fields kept in their own localStorage key, decoupled
 * from the (versioned) full GameState. The point: when the game state
 * shape changes (CURRENT_VERSION bump) and we'd otherwise return null
 * and reset the player to Tokyo, the loader can still recover the player's
 * distance, visited list, milestones, etc. from this side-channel.
 *
 * The user reported "たびたび東京駅に戻る" (often goes back to Tokyo Station).
 * Code path tracing shows the only way distanceKm can be 0 is via
 * createInitialPlayer(), which only runs when loadGameState() returns null.
 * Most likely trigger: deploy bumps CURRENT_VERSION → old saved state is
 * dropped → reset. This watchdog protects against that without requiring
 * us to write hand-rolled migrations every version bump.
 */
interface ProgressWatchdog {
  distanceKm: number;
  totalStepsEntered: number;
  visitedCapitals: string[];
  visitedCities: string[];
  claimedMilestones: number[];
  completedLaps: number;
  /** Wall-clock when this snapshot was written. Used to break ties. */
  updatedAt: number;
}

function readWatchdog(): ProgressWatchdog | null {
  try {
    const raw = localStorage.getItem(WATCHDOG_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<ProgressWatchdog>;
    return {
      distanceKm: sanitizeNum(parsed.distanceKm, 0),
      totalStepsEntered: sanitizeNum(parsed.totalStepsEntered, 0),
      visitedCapitals: Array.isArray(parsed.visitedCapitals)
        ? parsed.visitedCapitals.filter((s): s is string => typeof s === 'string')
        : [],
      visitedCities: Array.isArray(parsed.visitedCities)
        ? parsed.visitedCities.filter((s): s is string => typeof s === 'string')
        : [],
      claimedMilestones: Array.isArray(parsed.claimedMilestones)
        ? parsed.claimedMilestones.filter(
            (n): n is number => typeof n === 'number' && Number.isFinite(n),
          )
        : [],
      completedLaps: sanitizeNum(parsed.completedLaps, 0),
      updatedAt: sanitizeNum(parsed.updatedAt, 0),
    };
  } catch {
    return null;
  }
}

function writeWatchdog(player: PlayerState): void {
  try {
    const w: ProgressWatchdog = {
      distanceKm: sanitizeNum(player.distanceKm, 0),
      totalStepsEntered: sanitizeNum(player.totalStepsEntered, 0),
      visitedCapitals: player.visitedCapitals ?? [],
      visitedCities: player.visitedCities ?? [],
      claimedMilestones: player.claimedMilestones ?? [],
      completedLaps: sanitizeNum(player.completedLaps, 0),
      updatedAt: Date.now(),
    };
    localStorage.setItem(WATCHDOG_KEY, JSON.stringify(w));
  } catch {
    // ignore
  }
}

/**
 * Result of a load attempt. `state` is the full game state if recoverable
 * (either fresh-version match or hybrid from watchdog). `recoveredFromWatchdog`
 * tells the caller "you might want to flag this in the UI".
 */
export interface LoadResult {
  state: GameState;
  recoveredFromWatchdog: boolean;
}

export function loadGameState(): GameState | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as GameState;
      if (parsed.version === CURRENT_VERSION && parsed.player) {
        // Token-pace migration history:
        //   v1-v6: stepsPerDie 5000 (with a brief detour to 7000)
        //   v7   : 5000 again
        //   v8   : 1000 (much faster, suits the 1m/step distance model)
        // Force any stored value below v8's expectation up to 1000.
        if (parsed.config && parsed.config.stepsPerDie >= 5000) {
          parsed.config.stepsPerDie = 1000;
        }
        const p = parsed.player;
        p.distanceKm = sanitizeNum(p.distanceKm, 0);
        p.currentMultiplier = sanitizeNum(p.currentMultiplier, 1.0);
        p.multiplierUntil = sanitizeNum(p.multiplierUntil, 0);
        p.totalStepsEntered = sanitizeNum(p.totalStepsEntered, 0);
        p.stepsTowardNextDie = sanitizeNum(p.stepsTowardNextDie, 0);
        p.availableDice = sanitizeNum(p.availableDice, 0);
        p.completedLaps = sanitizeNum(p.completedLaps, 0);
        p.currentSquareIndex = sanitizeNum(p.currentSquareIndex, 0);
        return parsed;
      }
      // Version mismatch (fall through to watchdog recovery below).
      // We deliberately don't return null yet — we'd rather lose less
      // than reset to Tokyo every time we ship a schema change.
    }
  } catch {
    // Fall through to watchdog
  }

  // No state, or unparseable, or version mismatch. Try the watchdog.
  const w = readWatchdog();
  if (!w || w.distanceKm <= 0) return null;

  // Build a fresh state but carry the user's progress fields forward.
  // Caller (GameContext.getInitialState) will fall back to createInitialState
  // if we return null — but we have a watchdog with km > 0, so synthesize
  // a hybrid state. We mark the version as CURRENT so it gets saved as
  // current shape on the next state change.
  return null; // The hybrid is built by buildRecoveredState below.
}

/**
 * Build a "best effort" GameState from the watchdog when the main save
 * is missing/invalid. Caller passes its createInitialState() so we don't
 * have to import GameContext (cycle).
 */
export function buildRecoveredState(
  fallbackState: GameState,
): GameState | null {
  const w = readWatchdog();
  if (!w || w.distanceKm <= 0) return null;
  return {
    ...fallbackState,
    player: {
      ...fallbackState.player,
      distanceKm: w.distanceKm,
      totalStepsEntered: w.totalStepsEntered,
      visitedCapitals:
        w.visitedCapitals.length > 0
          ? w.visitedCapitals
          : fallbackState.player.visitedCapitals,
      visitedCities: w.visitedCities,
      claimedMilestones: w.claimedMilestones,
      completedLaps: w.completedLaps,
    },
  };
}

export function saveGameState(state: GameState): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    // quota exceeded - silently fail
  }
  // Always update the watchdog, even if the main save failed (we want
  // the most recent progress numbers persisted somewhere).
  if (state.player) writeWatchdog(state.player);
}

export function clearGameState(): void {
  localStorage.removeItem(STORAGE_KEY);
  localStorage.removeItem(WATCHDOG_KEY);
}
