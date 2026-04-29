import { useState } from 'react';
import { useGame } from '../../hooks/useGame';
import { SicBoModal } from '../sicbo/SicBoModal';
import { unlockAudio } from '../../services/sound';

export function DiceButton() {
  const { player } = useGame();
  const [open, setOpen] = useState(false);

  const handleOpen = () => {
    if (player.availableDice <= 0) return;
    unlockAudio();
    setOpen(true);
  };

  const lastSicBo = player.sicBoHistory && player.sicBoHistory.length > 0
    ? player.sicBoHistory[player.sicBoHistory.length - 1]
    : null;

  return (
    <div className="dice-section">
      <button
        className={`dice-button ${player.availableDice <= 0 ? 'disabled' : ''}`}
        onClick={handleOpen}
        disabled={player.availableDice <= 0}
      >
        <span className="dice-emoji">🎲</span>
        <span className="dice-label">
          {player.availableDice <= 0 ? '🎲がない（歩いて貯める）' : 'カジノでプレイ！'}
        </span>
      </button>
      {lastSicBo && (
        <div className="last-roll">
          前回: {lastSicBo.dice[0]}+{lastSicBo.dice[1]}+{lastSicBo.dice[2]}
          {' = '}{lastSicBo.sum}
          {lastSicBo.totalAdvance > 0
            ? ` → +${lastSicBo.totalAdvance}マス`
            : ' → ハズレ'}
        </div>
      )}
      <SicBoModal open={open} onClose={() => setOpen(false)} />
    </div>
  );
}
