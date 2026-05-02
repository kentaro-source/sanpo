import { useState, useMemo } from 'react';
import type { BetSlot, SicBoBetType } from '../../types';
import { useGame } from '../../hooks/useGame';
import {
  betLabelJa,
  payoutFor,
  rollDice,
  evaluateBetWindow,
  betWon,
  windowMsForMultiplier,
} from '../../utils/sicbo';
import {
  playDiceRoll,
  playWin,
  playLose,
  playJackpot,
  playClick,
  playTokenGain,
} from '../../services/sound';
import { Die } from './Die';

interface Props {
  open: boolean;
  onClose: () => void;
}

type Phase = 'betting' | 'rolling' | 'result';

export function SicBoModal({ open, onClose }: Props) {
  const { player, rollSicBo } = useGame();
  const [bets, setBets] = useState<Map<SicBoBetType, number>>(new Map());
  const [phase, setPhase] = useState<Phase>('betting');
  // shaker now hides dice during rolling, but we still keep this for future use
  const [, setShownDice] = useState<[number, number, number]>([1, 1, 1]);
  const [resultRoll, setResultRoll] = useState<{
    dice: [number, number, number];
    won: boolean;
    multiplier: number;
    windowMs: number;
    /** Each individual bet's win state and the multiplier it would have triggered. */
    perBet: { bet: BetSlot; won: boolean; payout: number }[];
  } | null>(null);

  const totalTokens = useMemo(
    () => Array.from(bets.values()).reduce((s, v) => s + v, 0),
    [bets],
  );
  const remaining = player.availableDice - totalTokens;

  if (!open) return null;

  const placeBet = (type: SicBoBetType) => {
    if (remaining <= 0) return;
    playClick();
    setBets((prev) => {
      const next = new Map(prev);
      next.set(type, (next.get(type) ?? 0) + 1);
      return next;
    });
  };

  const removeBet = (type: SicBoBetType, e: React.MouseEvent) => {
    e.stopPropagation();
    setBets((prev) => {
      const next = new Map(prev);
      const cur = next.get(type) ?? 0;
      if (cur <= 1) next.delete(type);
      else next.set(type, cur - 1);
      return next;
    });
    playClick();
  };

  const clearAll = () => {
    setBets(new Map());
    playClick();
  };

  const handleRoll = () => {
    if (totalTokens <= 0 || totalTokens > player.availableDice) return;
    const betArr: BetSlot[] = Array.from(bets.entries()).map(([type, amount]) => ({
      type,
      amount,
    }));

    setPhase('rolling');
    playDiceRoll(1200);

    let frame = 0;
    const interval = setInterval(() => {
      frame++;
      setShownDice([
        Math.floor(Math.random() * 6) + 1,
        Math.floor(Math.random() * 6) + 1,
        Math.floor(Math.random() * 6) + 1,
      ]);
      if (frame > 18) clearInterval(interval);
    }, 60);

    setTimeout(() => {
      clearInterval(interval);
      const dice = rollDice();
      setShownDice(dice);

      // Evaluate using the SAME function the reducer uses, so the on-screen
      // result matches what actually applies to the player's boost stack.
      // (Previously this called evaluateAllBets, a legacy stub that always
      // returned 0 advance — so a winning ×2 sum-13 大 bet still rendered
      // as 'ハズレ' even though the boost itself was applied correctly.)
      const window = evaluateBetWindow(betArr, dice);
      const perBet = betArr.map((bet) => ({
        bet,
        won: betWon(bet, dice),
        payout: payoutFor(bet.type),
      }));
      rollSicBo(betArr, dice);

      setResultRoll({
        dice,
        won: window.won,
        multiplier: window.multiplier,
        windowMs: window.windowMs,
        perBet,
      });
      setPhase('result');

      if (window.won && window.multiplier >= 100) {
        setTimeout(() => playJackpot(), 200);
      } else if (window.won) {
        setTimeout(() => playWin(), 200);
      } else {
        setTimeout(() => playLose(), 200);
      }
    }, 1200);
  };

  const handleClose = () => {
    setBets(new Map());
    setPhase('betting');
    setResultRoll(null);
    onClose();
  };

  const handleNewRound = () => {
    setBets(new Map());
    setPhase('betting');
    setResultRoll(null);
    if (resultRoll && resultRoll.won) {
      playTokenGain();
    }
  };

  const betCount = (type: SicBoBetType) => bets.get(type) ?? 0;

  return (
    <div className="sicbo-modal" onClick={handleClose}>
      <div className="sicbo-content" onClick={(e) => e.stopPropagation()}>
        <header className="sicbo-header">
          <div className="sicbo-title">大小</div>
          <button className="sicbo-close" onClick={handleClose}>✕</button>
        </header>

        {phase === 'betting' && (
          <>
            <div className="sicbo-token-bar">
              <span>🎲 <strong>{remaining}</strong>/{player.availableDice}</span>
              <span>BET <strong>{totalTokens}</strong></span>
            </div>

            <div className="sicbo-board">
              {/* Triples row - specific 6 + any triple */}
              <div className="sicbo-row sicbo-triples-row">
                {[1, 2, 3, 4, 5, 6].map((n) => {
                  const type = `triple-${n}` as SicBoBetType;
                  return (
                    <BetCellTriple
                      key={type}
                      face={n}
                      mult={payoutFor(type)}
                      count={betCount(type)}
                      onAdd={() => placeBet(type)}
                      onRemove={(e) => removeBet(type, e)}
                    />
                  );
                })}
                <BetCellAnyTriple
                  count={betCount('any-triple')}
                  onAdd={() => placeBet('any-triple')}
                  onRemove={(e) => removeBet('any-triple', e)}
                />
              </div>

              {/* Specific totals - 4-10 (under SMALL) and 11-17 (under BIG) */}
              <div className="sicbo-row sicbo-totals-row">
                {[4, 5, 6, 7, 8, 9, 10].map((n) => {
                  const type = `total-${n}` as SicBoBetType;
                  return (
                    <BetCellTotal
                      key={type}
                      number={n}
                      mult={payoutFor(type)}
                      count={betCount(type)}
                      onAdd={() => placeBet(type)}
                      onRemove={(e) => removeBet(type, e)}
                    />
                  );
                })}
              </div>
              <div className="sicbo-row sicbo-totals-row">
                {[11, 12, 13, 14, 15, 16, 17].map((n) => {
                  const type = `total-${n}` as SicBoBetType;
                  return (
                    <BetCellTotal
                      key={type}
                      number={n}
                      mult={payoutFor(type)}
                      count={betCount(type)}
                      onAdd={() => placeBet(type)}
                      onRemove={(e) => removeBet(type, e)}
                    />
                  );
                })}
              </div>

              {/* Big / Small - HUGE traditional characters */}
              <div className="sicbo-row sicbo-mainbet-row">
                <BetCellBig
                  type="small"
                  label="小"
                  count={betCount('small')}
                  onAdd={() => placeBet('small')}
                  onRemove={(e) => removeBet('small', e)}
                />
                <BetCellBig
                  type="big"
                  label="大"
                  count={betCount('big')}
                  onAdd={() => placeBet('big')}
                  onRemove={(e) => removeBet('big', e)}
                />
              </div>

              {/* Even / Odd */}
              <div className="sicbo-row sicbo-bs-row">
                <BetCellBig
                  type="odd"
                  label="単"
                  count={betCount('odd')}
                  onAdd={() => placeBet('odd')}
                  onRemove={(e) => removeBet('odd', e)}
                />
                <BetCellBig
                  type="even"
                  label="双"
                  count={betCount('even')}
                  onAdd={() => placeBet('even')}
                  onRemove={(e) => removeBet('even', e)}
                />
              </div>
            </div>

            <div className="sicbo-actions">
              <button
                className="sicbo-clear"
                onClick={clearAll}
                disabled={totalTokens === 0}
              >
                RESET
              </button>
              <button
                className="sicbo-roll"
                onClick={handleRoll}
                disabled={totalTokens === 0}
              >
                ROLL
              </button>
            </div>

            {(player.sicBoHistory?.length ?? 0) > 0 && (
              <div className="sicbo-history">
                <div className="sicbo-history-label">前回までの履歴</div>
                <ol className="sicbo-history-list">
                  {(player.sicBoHistory ?? [])
                    .slice(-5)
                    .reverse()
                    .map((h, i) => {
                      const won = h.totalAdvance > 0;
                      return (
                        <li
                          key={`${h.timestamp}-${i}`}
                          className={`sicbo-history-row ${won ? 'won' : 'lost'}`}
                        >
                          <span className="sicbo-history-dice">
                            <Die face={h.dice[0]} size={20} />
                            <Die face={h.dice[1]} size={20} />
                            <Die face={h.dice[2]} size={20} />
                          </span>
                          <span className="sicbo-history-sum">{h.sum}</span>
                          <span className="sicbo-history-result">
                            {won ? `×${h.totalAdvance}` : 'ハズレ'}
                          </span>
                        </li>
                      );
                    })}
                </ol>
              </div>
            )}
          </>
        )}

        {/* Rolling: bowl with closed lid - dice hidden, just shaking */}
        {phase === 'rolling' && (
          <div className="sicbo-stage">
            <div className="sicbo-shaker rolling">
              <div className="sicbo-shaker-base" />
              <div className="sicbo-shaker-lid">
                <div className="sicbo-shaker-knob" />
              </div>
            </div>
            <div className="sicbo-stage-msg">ROLLING...</div>
          </div>
        )}

        {/* Result: dice on the felt table (no bowl) */}
        {phase === 'result' && resultRoll && (
          <div className="sicbo-stage">
            <div className="sicbo-table">
              {resultRoll.dice.map((face, i) => (
                <div key={i} className="sicbo-table-die" style={{ animationDelay: `${i * 0.08}s` }}>
                  <Die face={face} size={96} />
                </div>
              ))}
            </div>
            <div className="sicbo-stage-sum">合計 {resultRoll.dice[0] + resultRoll.dice[1] + resultRoll.dice[2]}</div>
            <div className={`sicbo-advance ${resultRoll.won ? 'win' : 'lose'}`}>
              {resultRoll.won
                ? `×${resultRoll.multiplier} 加速 ${formatWindowMs(resultRoll.windowMs)}！`
                : `ハズレ … ×0.5 ${formatWindowMs(resultRoll.windowMs)}`}
            </div>
            <div className="sicbo-bet-results">
              {resultRoll.perBet.map((r, i) => (
                <div
                  key={i}
                  className={`sicbo-bet-result ${r.won ? 'win' : 'lose'}`}
                >
                  <span>{betLabelJa(r.bet.type)}（{r.bet.amount}トークン）</span>
                  <span>
                    {r.won
                      ? `×${r.payout} ${formatWindowMs(windowMsForMultiplier(r.payout))}`
                      : 'ハズレ'}
                  </span>
                </div>
              ))}
            </div>
            <div className="sicbo-actions">
              <button className="sicbo-close-btn" onClick={handleClose}>
                CLOSE
              </button>
              <button
                className="sicbo-newround"
                onClick={handleNewRound}
                disabled={player.availableDice <= 0}
              >
                AGAIN
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// Cell label: shows "+N" (potential advance based on current chip count, no Japanese)
function massLabel(count: number, mult: number): string {
  const tokens = count > 0 ? count : 1;
  return `+${tokens * mult}`;
}

/** Format ms duration as "24h" / "4h30m" / "16分". */
function formatWindowMs(ms: number): string {
  const totalMin = Math.round(ms / 60_000);
  if (totalMin >= 60) {
    const h = Math.floor(totalMin / 60);
    const m = totalMin % 60;
    return m > 0 ? `${h}h${m}m` : `${h}h`;
  }
  return `${totalMin}分`;
}

interface BigCellProps {
  type: SicBoBetType;
  label: string;
  count: number;
  onAdd: () => void;
  onRemove: (e: React.MouseEvent) => void;
}

function BetCellBig({ type, label, count, onAdd, onRemove }: BigCellProps) {
  const colorClass =
    type === 'big' ? 'cell-big' :
    type === 'small' ? 'cell-small' :
    type === 'odd' ? 'cell-odd' : 'cell-even';
  const mult = payoutFor(type);

  return (
    <div className={`bet-cell-v2 cell-bs ${colorClass} ${count > 0 ? 'cell-active' : ''}`}>
      <button className="bet-cell-area" onClick={onAdd}>
        <div className="cell-bs-label">{label}</div>
        <div className="cell-mass-hint">{massLabel(count, mult)}</div>
      </button>
      {count > 0 && <Chip count={count} onClick={onRemove} />}
    </div>
  );
}

interface TotalCellProps {
  number: number;
  mult: number;
  count: number;
  onAdd: () => void;
  onRemove: (e: React.MouseEvent) => void;
}

function BetCellTotal({ number, mult, count, onAdd, onRemove }: TotalCellProps) {
  return (
    <div className={`bet-cell-v2 cell-total ${count > 0 ? 'cell-active' : ''}`}>
      <button className="bet-cell-area" onClick={onAdd}>
        <div className="cell-total-num">{number}</div>
        <div className="cell-total-mult">{massLabel(count, mult)}</div>
      </button>
      {count > 0 && <Chip count={count} onClick={onRemove} />}
    </div>
  );
}

interface TripleCellProps {
  face: number;
  mult: number;
  count: number;
  onAdd: () => void;
  onRemove: (e: React.MouseEvent) => void;
}

function BetCellTriple({ face, mult, count, onAdd, onRemove }: TripleCellProps) {
  return (
    <div className={`bet-cell-v2 cell-triple ${count > 0 ? 'cell-active' : ''}`}>
      <button className="bet-cell-area" onClick={onAdd}>
        <div className="cell-triple-dice">
          <Die face={face} size={36} />
          <span className="cell-triple-x3">×3</span>
        </div>
        <div className="cell-total-mult">{massLabel(count, mult)}</div>
      </button>
      {count > 0 && <Chip count={count} onClick={onRemove} />}
    </div>
  );
}

function BetCellAnyTriple({ count, onAdd, onRemove }: { count: number; onAdd: () => void; onRemove: (e: React.MouseEvent) => void }) {
  const mult = payoutFor('any-triple');
  return (
    <div className={`bet-cell-v2 cell-any-triple ${count > 0 ? 'cell-active' : ''}`}>
      <button className="bet-cell-area" onClick={onAdd}>
        <div className="cell-bs-label">囲</div>
        <div className="cell-total-mult">{massLabel(count, mult)}</div>
      </button>
      {count > 0 && <Chip count={count} onClick={onRemove} />}
    </div>
  );
}

function Chip({ count, onClick }: { count: number; onClick: (e: React.MouseEvent) => void }) {
  return (
    <div className="bet-chip" onClick={onClick}>
      {count}
    </div>
  );
}
