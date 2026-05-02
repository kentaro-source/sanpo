import type { SicBoBetType, BetSlot } from '../types';

/**
 * Sic Bo (大小) payout multipliers — STANDARD (real-casino) payouts.
 * Used as the speed multiplier in the distance-based model: winning a
 * bet sets the player's walking-speed multiplier to this value for a
 * time window. Time = BOOST_BUDGET / multiplier so all bets give
 * roughly equivalent total boost.
 */
export const SICBO_PAYOUTS: Record<string, number> = {
  big: 2,
  small: 2,
  odd: 2,
  even: 2,
  'total-4': 60,
  'total-5': 30,
  'total-6': 17,
  'total-7': 12,
  'total-8': 8,
  'total-9': 7,
  'total-10': 6,
  'total-11': 6,
  'total-12': 7,
  'total-13': 8,
  'total-14': 12,
  'total-15': 17,
  'total-16': 30,
  'total-17': 60,
  'any-triple': 30,
  'triple-1': 180,
  'triple-2': 180,
  'triple-3': 180,
  'triple-4': 180,
  'triple-5': 180,
  'triple-6': 180,
};

/**
 * Boost budget = multiplier × hours. Down from v7's 48 to v8's 8 since
 * (a) maxDice 5→100 and bonus chips bypass the cap let the player
 * chain many bets per session, and (b) practical sessions are minutes
 * to a couple of hours, so long windows mostly went unused anyway.
 * The 大/小 ×2 anchor lands at 4h — long enough to cover an average
 * walking session with one bet, short enough that chained wins matter.
 *   ×2   → 4h     (大/小/単/双)
 *   ×6   → 1h20m  (合計10/11)
 *   ×12  → 40m    (合計7/14)
 *   ×30  → 16m    (合計5/16, 任意ゾロ目)
 *   ×60  → 8m     (合計4/17)
 *   ×180 → ~3m    (特定ゾロ目)
 */
export const BOOST_BUDGET_HOURS = 8;

/** Window duration (in ms) for a winning multiplier of `mult`. */
export function windowMsForMultiplier(mult: number): number {
  if (mult <= 0) return 0;
  return Math.round((BOOST_BUDGET_HOURS / mult) * 60 * 60 * 1000);
}

/** Penalty multiplier when the player loses a Sic Bo bet. */
export const LOSS_MULTIPLIER = 0.5;
/** Penalty window uses the same duration as a win at the bet's payout. */
export function lossWindowMsForBet(payout: number): number {
  // Symmetric: a 大 loss is 24h × 0.5, a triple loss is 16min × 0.5, etc.
  return windowMsForMultiplier(payout);
}

export function payoutFor(betType: SicBoBetType): number {
  return SICBO_PAYOUTS[betType] ?? 0;
}

export function isBetType(s: string): s is SicBoBetType {
  return s in SICBO_PAYOUTS;
}

export function rollDice(): [number, number, number] {
  return [
    Math.floor(Math.random() * 6) + 1,
    Math.floor(Math.random() * 6) + 1,
    Math.floor(Math.random() * 6) + 1,
  ];
}

export function isTriple(dice: [number, number, number]): boolean {
  return dice[0] === dice[1] && dice[1] === dice[2];
}

/**
 * Did this bet WIN against the given dice? (true/false).
 * Note: 大/小/奇/偶 lose on triples (Sic Bo standard).
 */
export function betWon(bet: BetSlot, dice: [number, number, number]): boolean {
  const sum = dice[0] + dice[1] + dice[2];
  const triple = isTriple(dice);
  const tripleValue = triple ? dice[0] : 0;

  switch (bet.type) {
    case 'big':
      return !triple && sum >= 11 && sum <= 17;
    case 'small':
      return !triple && sum >= 4 && sum <= 10;
    case 'odd':
      return !triple && sum % 2 === 1;
    case 'even':
      return !triple && sum % 2 === 0;
    case 'any-triple':
      return triple;
    default: {
      if (bet.type.startsWith('total-')) {
        const n = parseInt(bet.type.slice('total-'.length), 10);
        return sum === n;
      }
      if (bet.type.startsWith('triple-')) {
        const n = parseInt(bet.type.slice('triple-'.length), 10);
        return triple && tripleValue === n;
      }
      return false;
    }
  }
}

/**
 * Legacy advance evaluation (squares-based). Retained as a no-op stub
 * for any old callers; new code uses evaluateBetWindow.
 */
export function evaluateBet(
  _bet: BetSlot,
  _dice: [number, number, number],
): number {
  return 0;
}

export function evaluateAllBets(
  bets: BetSlot[],
  _dice: [number, number, number],
): { total: number; perBet: { bet: BetSlot; advance: number }[] } {
  // Stub: no longer drives advance directly.
  return { total: 0, perBet: bets.map((bet) => ({ bet, advance: 0 })) };
}

/**
 * Evaluate a roll against the player's bets and return the highest-payout
 * winning multiplier window. (If no wins, returns the loss window for the
 * highest-payout bet placed — symmetric penalty.)
 */
export function evaluateBetWindow(
  bets: BetSlot[],
  dice: [number, number, number],
): { multiplier: number; windowMs: number; won: boolean; payout: number } {
  let bestWinPayout = 0;
  let bestBetPayout = 0;
  for (const bet of bets) {
    const payout = payoutFor(bet.type);
    if (payout > bestBetPayout) bestBetPayout = payout;
    if (betWon(bet, dice) && payout > bestWinPayout) {
      bestWinPayout = payout;
    }
  }
  if (bestWinPayout > 0) {
    return {
      multiplier: bestWinPayout,
      windowMs: windowMsForMultiplier(bestWinPayout),
      won: true,
      payout: bestWinPayout,
    };
  }
  return {
    multiplier: LOSS_MULTIPLIER,
    windowMs: lossWindowMsForBet(bestBetPayout || 2),
    won: false,
    payout: bestBetPayout,
  };
}

/** Total tokens placed across all bets. */
export function totalBetAmount(bets: BetSlot[]): number {
  return bets.reduce((sum, b) => sum + b.amount, 0);
}

/** Get human-readable Japanese label for a bet type. */
export function betLabelJa(type: SicBoBetType): string {
  if (type === 'big') return '大';
  if (type === 'small') return '小';
  if (type === 'odd') return '奇';
  if (type === 'even') return '偶';
  if (type === 'any-triple') return 'ゾロ目（どれでも）';
  if (type.startsWith('total-')) return `合計${type.slice(6)}`;
  if (type.startsWith('triple-')) return `${type.slice(7)}のゾロ目`;
  return type;
}
