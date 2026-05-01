import type { GameState } from '../types';

const STORAGE_KEY = 'sanpo-game-state';
// Version 6: distance-based player position (player.distanceKm replaces
// currentSquareIndex). Sic Bo now sets a multiplier window instead of
// directly advancing. Square count/indices completely recalibrated.
const CURRENT_VERSION = 6;

/** Replace any NaN/null/undefined number field with a safe default. */
function sanitizeNum(v: unknown, fallback: number): number {
  return typeof v === 'number' && Number.isFinite(v) ? v : fallback;
}

export function loadGameState(): GameState | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as GameState;
    if (parsed.version !== CURRENT_VERSION) return null;
    // Migration: tuning made stepsPerDie 5000→7000→5000.
    if (parsed.config && parsed.config.stepsPerDie === 7000) {
      parsed.config.stepsPerDie = 5000;
    }
    // Sanitize numeric player fields. Saving NaN serializes to null in
    // JSON, which deserializes back as null and propagates as NaN forever
    // unless we repair it.
    if (parsed.player) {
      const p = parsed.player;
      p.distanceKm = sanitizeNum(p.distanceKm, 0);
      p.currentMultiplier = sanitizeNum(p.currentMultiplier, 1.0);
      p.multiplierUntil = sanitizeNum(p.multiplierUntil, 0);
      p.totalStepsEntered = sanitizeNum(p.totalStepsEntered, 0);
      p.stepsTowardNextDie = sanitizeNum(p.stepsTowardNextDie, 0);
      p.availableDice = sanitizeNum(p.availableDice, 0);
      p.completedLaps = sanitizeNum(p.completedLaps, 0);
      p.currentSquareIndex = sanitizeNum(p.currentSquareIndex, 0);
    }
    return parsed;
  } catch {
    return null;
  }
}

export function saveGameState(state: GameState): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    // quota exceeded - silently fail
  }
}

export function clearGameState(): void {
  localStorage.removeItem(STORAGE_KEY);
}
