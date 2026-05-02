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

  return (
    <div className="dice-section">
      <button
        className={`dice-button ${player.availableDice <= 0 ? 'disabled' : ''}`}
        onClick={handleOpen}
        disabled={player.availableDice <= 0}
      >
        <span className="dice-emoji">🎲</span>
        <span className="dice-label">
          {player.availableDice <= 0 ? '歩いて🎲を貯める' : 'カジノでプレイ'}
        </span>
      </button>
      <SicBoModal open={open} onClose={() => setOpen(false)} />
    </div>
  );
}
