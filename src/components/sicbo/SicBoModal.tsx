import { useState, useMemo } from 'react';
import type { BetSlot, SicBoBetType } from '../../types';
import { useGame } from '../../hooks/useGame';
import { evaluateAllBets, betLabelJa, payoutFor } from '../../utils/sicbo';
import { rollDice } from '../../utils/sicbo';
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
    advance: number;
    perBet: { bet: BetSlot; advance: number }[];
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

      const evalResult = evaluateAllBets(betArr, dice);
      rollSicBo(betArr, dice);

      setResultRoll({
        dice,
        advance: evalResult.total,
        perBet: evalResult.perBet,
      });
      setPhase('result');

      if (evalResult.total >= 200) {
        setTimeout(() => playJackpot(), 200);
      } else if (evalResult.total > 0) {
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
    if (resultRoll && resultRoll.advance > 0) {
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
              <span>残り <strong>{remaining}</strong>/{player.availableDice}</span>
              <span>ベット <strong>{totalTokens}</strong></span>
            </div>

            <div className="sicbo-board">
              <div className="sicbo-row sicbo-bs-row">
                <BetCellBig
                  type="odd"
                  label="単"
                  count={betCount('odd')}
                  onAdd={() => placeBet('odd')}
                  onRemove={(e) => removeBet('odd', e)}
                />
                <BetCellBig
                  type="big"
                  label="大"
                  count={betCount('big')}
                  onAdd={() => placeBet('big')}
                  onRemove={(e) => removeBet('big', e)}
                />
                <BetCellBig
                  type="small"
                  label="小"
                  count={betCount('small')}
                  onAdd={() => placeBet('small')}
                  onRemove={(e) => removeBet('small', e)}
                />
                <BetCellBig
                  type="even"
                  label="双"
                  count={betCount('even')}
                  onAdd={() => placeBet('even')}
                  onRemove={(e) => removeBet('even', e)}
                />
              </div>

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
              </div>
              <div className="sicbo-row">
                <BetCellAnyTriple
                  count={betCount('any-triple')}
                  onAdd={() => placeBet('any-triple')}
                  onRemove={(e) => removeBet('any-triple', e)}
                />
              </div>
            </div>

            <div className="sicbo-actions">
              <button
                className="sicbo-clear"
                onClick={clearAll}
                disabled={totalTokens === 0}
              >
                クリア
              </button>
              <button
                className="sicbo-roll"
                onClick={handleRoll}
                disabled={totalTokens === 0}
              >
                振る
              </button>
            </div>
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
            <div className="sicbo-stage-msg">振っています...</div>
          </div>
        )}

        {/* Result: dice on the felt table (no bowl) */}
        {phase === 'result' && resultRoll && (
          <div className="sicbo-stage">
            <div className="sicbo-table">
              {resultRoll.dice.map((face, i) => (
                <div key={i} className="sicbo-table-die" style={{ animationDelay: `${i * 0.08}s` }}>
                  <Die face={face} size={84} />
                </div>
              ))}
            </div>
            <div className="sicbo-stage-sum">合計 {resultRoll.dice[0] + resultRoll.dice[1] + resultRoll.dice[2]}</div>
            <div className={`sicbo-advance ${resultRoll.advance > 0 ? 'win' : 'lose'}`}>
              {resultRoll.advance > 0 ? `${resultRoll.advance} マス進む！` : 'ハズレ'}
            </div>
            <div className="sicbo-bet-results">
              {resultRoll.perBet.map((r, i) => (
                <div
                  key={i}
                  className={`sicbo-bet-result ${r.advance > 0 ? 'win' : 'lose'}`}
                >
                  <span>{betLabelJa(r.bet.type)}（{r.bet.amount}トークン）</span>
                  <span>{r.advance > 0 ? `${r.advance} マス進む` : 'ハズレ'}</span>
                </div>
              ))}
            </div>
            <div className="sicbo-actions">
              <button className="sicbo-close-btn" onClick={handleClose}>
                閉じる
              </button>
              <button
                className="sicbo-newround"
                onClick={handleNewRound}
                disabled={player.availableDice <= 0}
              >
                もう一度
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
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

  return (
    <div className={`bet-cell-v2 cell-bs ${colorClass} ${count > 0 ? 'cell-active' : ''}`}>
      <button className="bet-cell-area" onClick={onAdd}>
        <div className="cell-bs-label">{label}</div>
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
        <div className="cell-total-mult">×{mult}</div>
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
          <Die face={face} size={20} />
          <Die face={face} size={20} />
          <Die face={face} size={20} />
        </div>
        <div className="cell-total-mult">×{mult}</div>
      </button>
      {count > 0 && <Chip count={count} onClick={onRemove} />}
    </div>
  );
}

function BetCellAnyTriple({ count, onAdd, onRemove }: { count: number; onAdd: () => void; onRemove: (e: React.MouseEvent) => void }) {
  return (
    <div className={`bet-cell-v2 cell-any-triple ${count > 0 ? 'cell-active' : ''}`}>
      <button className="bet-cell-area" onClick={onAdd}>
        <div className="cell-any-dice">
          <Die face={2} size={18} />
          <Die face={4} size={18} />
          <Die face={6} size={18} />
          <span className="cell-any-equal">＝</span>
          <span className="cell-any-mark">？？？</span>
        </div>
        <div className="cell-total-mult">×{payoutFor('any-triple')}</div>
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
