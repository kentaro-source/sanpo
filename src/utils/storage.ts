import type { GameState } from '../types';

const STORAGE_KEY = 'sanpo-game-state';
const CURRENT_VERSION = 1;

export function loadGameState(): GameState | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as GameState;
    if (parsed.version !== CURRENT_VERSION) return null;
    // Migration: old default 5000 steps/die -> 7000 (game balance tuning)
    if (parsed.config && parsed.config.stepsPerDie === 5000) {
      parsed.config.stepsPerDie = 7000;
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
