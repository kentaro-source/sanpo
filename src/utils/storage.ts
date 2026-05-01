import type { GameState } from '../types';

const STORAGE_KEY = 'sanpo-game-state';
// Version 5: land/mixed segments now multiply great-circle by 1.4× to
// approximate road overhead, so square counts and per-segment indices
// changed. Old saves would put the player on a misaligned square.
const CURRENT_VERSION = 5;

export function loadGameState(): GameState | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as GameState;
    if (parsed.version !== CURRENT_VERSION) return null;
    // Migration: tuning made stepsPerDie 5000→7000→5000.
    // If config still at 7000 (intermediate value), revert to 5000.
    if (parsed.config && parsed.config.stepsPerDie === 7000) {
      parsed.config.stepsPerDie = 5000;
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
