import type { SicBoBetType, BetSlot } from '../types';

/**
 * Sic Bo (大小) payout multipliers — STANDARD (real-casino) payouts.
 * Used as the speed multiplier in the distance-based model: winning a
 * bet sets the player's walking-speed multiplier to this value for a
 * time window. Time = BOOST_BUDGET / multiplier so all bets give
 * roughly equivalent total boost.
 */
export const SICBO_PAYOUTS: Record<string, number> = {
  // ×2 系 are bumped to ×3 (deviation from real Sic Bo) so that
  // big/small/odd/even become the highest-EV bets in our system —
  // matches the gameplay goal of "the safe bet is also the best bet."
  big: 3,
  small: 3,
  odd: 3,
  even: 3,
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

/** Win probability per bet type (used to derive lose multipliers). */
const WIN_PROB: Record<string, number> = {
  big: 0.486,
  small: 0.486,
  odd: 0.486,
  even: 0.486,
  'total-4': 0.014,
  'total-5': 0.028,
  // 6/9/12/15 exclude their triple combo (2-2-2 / 3-3-3 / 4-4-4 / 5-5-5):
  // a ゾロ目 now loses sum bets too, so those combos no longer count as a
  // win — see betWon(). (e.g. 合計12 is 24/216, not 25/216.)
  'total-6': 0.042,
  'total-7': 0.069,
  'total-8': 0.097,
  'total-9': 0.111,
  'total-10': 0.125,
  'total-11': 0.125,
  'total-12': 0.111,
  'total-13': 0.097,
  'total-14': 0.069,
  'total-15': 0.042,
  'total-16': 0.028,
  'total-17': 0.014,
  'any-triple': 0.0278,
  'triple-1': 0.00463,
  'triple-2': 0.00463,
  'triple-3': 0.00463,
  'triple-4': 0.00463,
  'triple-5': 0.00463,
  'triple-6': 0.00463,
};

/**
 * Per-bet-type lose multiplier. The boost magnitude applied as a
 * 30-min penalty when this specific bet loses. Tiered to make
 * big/small/odd/even the +EV "safe & best" bets, sums slightly +EV,
 * triples slightly −EV (lottery feel).
 */
export function loseMultiplierFor(betType: SicBoBetType): number {
  if (
    betType === 'big' || betType === 'small' ||
    betType === 'odd' || betType === 'even'
  ) {
    return 0.5; // dramatic halving on the headline bets
  }
  if (betType === 'any-triple' || betType.startsWith('triple-')) {
    return 0.85; // triple bets: lottery, slightly negative EV
  }
  // Sum bets: lose = 1 − win_prob (calibrated to ~+1-12% EV).
  const p = WIN_PROB[betType] ?? 0.5;
  return 1 - p;
}

/**
 * Fixed window for all wins/losses, regardless of multiplier.
 *
 * v8 simplification (replacing v7's budget = mult × time formula): the
 * old model normalized total mult-hours per win, which made ×180 wins
 * feel like a fast 'same-payoff-just-shorter' tap rather than a casino
 * jackpot. Fixed window keeps the multiplier mostly proportional to
 * win value, so ×180 wins are dramatically more impactful than ×2.
 *
 * 30 min chosen because (a) it matches a typical walking session, so
 * the boost gets used up rather than expiring on a break, and (b) at
 * ~1000歩/10min cadence three bets can overlap inside one window —
 * enough stacking to feel rewarding without runaway compounding.
 */
export const BOOST_WINDOW_MS = 30 * 60 * 1000;

/** Window duration (in ms) for a winning multiplier. Constant under v8. */
export function windowMsForMultiplier(_mult: number): number {
  return BOOST_WINDOW_MS;
}

/** Penalty multiplier when the player loses a Sic Bo bet. */
export const LOSS_MULTIPLIER = 0.5;
/** Penalty window — same fixed length as a win. */
export function lossWindowMsForBet(_payout: number): number {
  return BOOST_WINDOW_MS;
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
 * Note: 大/小/奇/偶 AND 合計 (sum) bets all lose on a triple (Sic Bo
 * standard) — only any-triple / triple-N win on a ゾロ目.
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
        // A ゾロ目 (triple) loses sum bets too: 4-4-4 must NOT win 合計12.
        // Only any-triple / triple-N pay out on a triple.
        return !triple && sum === n;
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
 * Evaluate a roll against the player's bets.
 *
 * - If ANY bets win, every winning bet's payout becomes a separate
 *   boost multiplier (so 大 + total-12 both hitting → ×2 AND ×7
 *   stacked, effective ×14). The reducer pushes each as its own Boost
 *   entry in `boosts[]` and they expire independently.
 * - If no bets win, a single LOSS_MULTIPLIER (×0.5) penalty boost is
 *   applied, regardless of how many bets were placed.
 *
 * `multiplier` is kept on the return shape as the EFFECTIVE multiplier
 * (= product of winning payouts) for callers that just want one number;
 * `winningMultipliers[]` carries the individual values for stacking.
 */
export interface BetEvaluation {
  /** Effective multiplier (product of all per-bet outcomes — wins payout, losses lose_mult). */
  multiplier: number;
  /** Window length for each emitted boost (fixed). */
  windowMs: number;
  /** Did at least one bet win? */
  won: boolean;
  /** Per-bet outcome multipliers — wins use payout, losses use loseMultiplierFor(). */
  outcomeMultipliers: number[];
  /** Highest payout that was bet — used for diagnostics / labels. */
  payout: number;
}

/**
 * Evaluate a roll against the player's bets and produce one
 * outcome-multiplier per bet (linear-by-chip-count for wins, single
 * lose-multiplier for losses regardless of chip count).
 *
 * The reducer pushes each outcome as its own Boost, so they stack
 * multiplicatively with the existing boost stack and expire on
 * independent timers. This means:
 *   - 大 + 合計-12 both win on a 12-roll → two boost entries
 *     (×3 and ×7 respectively, with linear chip multiplier baked in)
 *   - 大 only wins on 13 → one ×3 boost + one ×0.5 boost (12 lost)
 *   - All bets lose → one lose-multiplier boost per bet
 */
export function evaluateBetWindow(
  bets: BetSlot[],
  dice: [number, number, number],
): BetEvaluation {
  const outcomeMultipliers: number[] = [];
  let won = false;
  let bestBetPayout = 0;
  for (const bet of bets) {
    const payout = payoutFor(bet.type);
    if (payout > bestBetPayout) bestBetPayout = payout;
    if (betWon(bet, dice)) {
      won = true;
      // Linear chip scaling on win: 5-chip 大 win → ×(3 × 5) = ×15
      // boost (single boost, not 5 separate ones — exponential stack
      // would be runaway).
      outcomeMultipliers.push(payout * bet.amount);
    } else {
      // Single lose-multiplier per losing bet, regardless of chip count.
      // Multi-chip on a losing bet costs the chips (already deducted
      // from availableDice) but doesn't worsen the boost penalty.
      outcomeMultipliers.push(loseMultiplierFor(bet.type));
    }
  }
  const effective = outcomeMultipliers.reduce((a, b) => a * b, 1);
  return {
    multiplier: effective,
    windowMs: windowMsForMultiplier(effective),
    won,
    outcomeMultipliers,
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
