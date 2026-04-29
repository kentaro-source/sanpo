import type { SicBoBetType, BetSlot } from '../types';

/**
 * Sic Bo (大小) payout multipliers.
 * Designed so each bet has expected value ≈ 3 squares per token.
 * Player advances `bet.amount × multiplier` squares when winning.
 */
export const SICBO_PAYOUTS: Record<string, number> = {
  big: 6,
  small: 6,
  odd: 6,
  even: 6,
  'total-4': 216,
  'total-5': 108,
  'total-6': 64,
  'total-7': 44,
  'total-8': 30,
  'total-9': 26,
  'total-10': 24,
  'total-11': 24,
  'total-12': 26,
  'total-13': 30,
  'total-14': 44,
  'total-15': 64,
  'total-16': 108,
  'total-17': 216,
  'any-triple': 108,
  'triple-1': 648,
  'triple-2': 648,
  'triple-3': 648,
  'triple-4': 648,
  'triple-5': 648,
  'triple-6': 648,
};

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
 * Evaluate a single bet against a roll. Returns the squares advanced (0 if lose).
 * Note: 大/小 lose on triples (Sic Bo standard).
 */
export function evaluateBet(
  bet: BetSlot,
  dice: [number, number, number],
): number {
  const sum = dice[0] + dice[1] + dice[2];
  const triple = isTriple(dice);
  const tripleValue = triple ? dice[0] : 0;
  const mult = payoutFor(bet.type);

  switch (bet.type) {
    case 'big':
      return !triple && sum >= 11 && sum <= 17 ? bet.amount * mult : 0;
    case 'small':
      return !triple && sum >= 4 && sum <= 10 ? bet.amount * mult : 0;
    case 'odd':
      return !triple && sum % 2 === 1 ? bet.amount * mult : 0;
    case 'even':
      return !triple && sum % 2 === 0 ? bet.amount * mult : 0;
    case 'any-triple':
      return triple ? bet.amount * mult : 0;
    default: {
      // total-N or triple-N
      if (bet.type.startsWith('total-')) {
        const n = parseInt(bet.type.slice('total-'.length), 10);
        return sum === n ? bet.amount * mult : 0;
      }
      if (bet.type.startsWith('triple-')) {
        const n = parseInt(bet.type.slice('triple-'.length), 10);
        return triple && tripleValue === n ? bet.amount * mult : 0;
      }
      return 0;
    }
  }
}

export function evaluateAllBets(
  bets: BetSlot[],
  dice: [number, number, number],
): { total: number; perBet: { bet: BetSlot; advance: number }[] } {
  const perBet = bets.map((bet) => ({ bet, advance: evaluateBet(bet, dice) }));
  const total = perBet.reduce((sum, x) => sum + x.advance, 0);
  return { total, perBet };
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
