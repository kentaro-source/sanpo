import { useState } from 'react';
import { useGame } from '../../hooks/useGame';
import { DiceResult } from './DiceResult';

export function DiceButton() {
  const { player, rollDie, routeData } = useGame();
  const [rolling, setRolling] = useState(false);

  const handleRoll = () => {
    if (player.availableDice <= 0 || rolling) return;

    setRolling(true);

    setTimeout(() => {
      rollDie();
      setRolling(false);
    }, 600);
  };

  const latestRoll = player.diceHistory.length > 0
    ? player.diceHistory[player.diceHistory.length - 1]
    : null;

  const landedOnCapital = latestRoll
    ? routeData.squares[latestRoll.toSquare]?.isCapital
      ? routeData.capitals.find(c => c.id === routeData.squares[latestRoll.toSquare].capitalId)
      : null
    : null;

  return (
    <div className="dice-section">
      <button
        className={`dice-button ${rolling ? 'rolling' : ''} ${player.availableDice <= 0 ? 'disabled' : ''}`}
        onClick={handleRoll}
        disabled={player.availableDice <= 0 || rolling}
      >
        <span className="dice-emoji">🎲</span>
        <span className="dice-label">
          {player.availableDice <= 0 ? 'サイコロがない' : 'サイコロを振る！'}
        </span>
      </button>
      <DiceResult roll={latestRoll} landedCapital={landedOnCapital} />
    </div>
  );
}
