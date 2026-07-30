import type { GameState, PlayerState } from '../types';

const STORAGE_KEY = 'sanpo-game-state';
const WATCHDOG_KEY = 'sanpo-progress-watchdog';

// Version 9: capitals.ts reordered — Caucasus (GE, AM, AZ) moved from
// the Europe block (positions 98-100) to immediately after Cyprus
// (positions 44-46) so the chain flows naturally from the Middle East
// into the Caucasus. Square indices and segment boundaries shift; old
// saves drop through the version check, watchdog preserves distanceKm.
const CURRENT_VERSION = 9;

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
  // v9 expansion — also preserve in-flight progress bar / token state
  // so that a CURRENT_VERSION bump doesn't reset the player's
  // 'progress to next chip', their available tokens, or today's
  // accumulated step attribution. Without these fields the user
  // visibly loses progress on every schema bump even though the
  // distance was preserved.
  stepsTowardNextDie?: number;
  availableDice?: number;
  attributedTodaySteps?: number;
  attributedDayStart?: number;
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
      stepsTowardNextDie: sanitizeNum(parsed.stepsTowardNextDie, 0),
      availableDice: sanitizeNum(parsed.availableDice, 0),
      attributedTodaySteps: sanitizeNum(parsed.attributedTodaySteps, 0),
      attributedDayStart: sanitizeNum(parsed.attributedDayStart, 0),
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
      stepsTowardNextDie: sanitizeNum(player.stepsTowardNextDie, 0),
      availableDice: sanitizeNum(player.availableDice, 0),
      attributedTodaySteps: sanitizeNum(player.attributedTodaySteps, 0),
      attributedDayStart: sanitizeNum(player.attributedDayStart, 0),
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
        //   v9   : 777 (lucky 7s)
        //   v10  : 500 — chips ~2x faster, targets 1.5y world-tour pace
        // Force any stale stored value above 500 down to 500.
        if (parsed.config && parsed.config.stepsPerDie > 500) {
          parsed.config.stepsPerDie = 500;
        }
        // Token-cap history: 5 (v1-v8 initial) → 50 → 100 (v8 mid-session bumps).
        // Anyone still under 100 didn't get the new bonus economy yet — bump.
        if (parsed.config && parsed.config.maxDice < 100) {
          parsed.config.maxDice = 100;
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
        // Lazy-init todayStartKm for users coming from earlier builds
        // where this field didn't exist. Without this, ShareToX's daily
        // route line stays hidden until the next ADD_STEPS fires.
        if (
          typeof p.todayStartKm !== 'number' ||
          !Number.isFinite(p.todayStartKm)
        ) {
          p.todayStartKm = p.distanceKm;
        }
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
  // Recover even if distanceKm = 0 — totalSteps / token state still matter
  // for the player. Only bail if there's literally nothing in the watchdog.
  if (!w) return null;
  const hasAnyProgress =
    w.distanceKm > 0 ||
    w.totalStepsEntered > 0 ||
    (w.stepsTowardNextDie ?? 0) > 0 ||
    (w.availableDice ?? 0) > 0;
  if (!hasAnyProgress) return null;
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
      stepsTowardNextDie: w.stepsTowardNextDie ?? 0,
      availableDice: w.availableDice ?? 0,
      attributedTodaySteps: w.attributedTodaySteps,
      attributedDayStart: w.attributedDayStart,
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

/**
 * Export the whole save as text the user can copy somewhere safe.
 *
 * Progress lives only in this device's localStorage: hundreds of days of
 * walking would be lost to a broken/lost phone, a factory reset, or the
 * WebView's data being cleared. The watchdog only protects against schema
 * bumps on the SAME device, so it is no help there.
 *
 * Includes the watchdog alongside the state so an import can restore both.
 */
export function exportSaveText(): string {
  let state: unknown = null;
  let watchdog: unknown = null;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    state = raw ? JSON.parse(raw) : null;
  } catch {
    state = null;
  }
  try {
    const raw = localStorage.getItem(WATCHDOG_KEY);
    watchdog = raw ? JSON.parse(raw) : null;
  } catch {
    watchdog = null;
  }
  return JSON.stringify(
    { kind: 'sanpo-save', exportedAt: Date.now(), state, watchdog },
    null,
    2,
  );
}

/**
 * Restore a save produced by exportSaveText.
 *
 * Deliberately strict: a malformed paste must NOT wipe a working save, so
 * everything is validated before anything is written. Returns a message for
 * the UI rather than throwing.
 */
export function importSaveText(
  text: string,
): { ok: true; distanceKm: number } | { ok: false; error: string } {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text.trim());
  } catch {
    return { ok: false, error: 'JSON として読めません' };
  }
  if (!parsed || typeof parsed !== 'object') {
    return { ok: false, error: '中身が空です' };
  }
  const box = parsed as {
    kind?: unknown;
    state?: { player?: { distanceKm?: unknown }; version?: unknown } | null;
    watchdog?: unknown;
  };
  if (box.kind !== 'sanpo-save') {
    return { ok: false, error: 'せかいさんぽのバックアップではありません' };
  }
  const st = box.state;
  const km = st?.player?.distanceKm;
  if (!st || typeof km !== 'number' || !Number.isFinite(km) || km < 0) {
    return { ok: false, error: '距離データが壊れています' };
  }
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(st));
    if (box.watchdog && typeof box.watchdog === 'object') {
      localStorage.setItem(WATCHDOG_KEY, JSON.stringify(box.watchdog));
    }
  } catch (e) {
    return { ok: false, error: `保存に失敗: ${String(e)}` };
  }
  return { ok: true, distanceKm: km };
}

export function clearGameState(): void {
  localStorage.removeItem(STORAGE_KEY);
  localStorage.removeItem(WATCHDOG_KEY);
}
