import { useGame } from '../../hooks/useGame';

export function Header() {
  const { player, visitedCount, totalCapitals } = useGame();

  return (
    <header className="header">
      <div className="header-left">
        <h1 className="header-title">Sanpo</h1>
        <span className="header-subtitle">{visitedCount}/{totalCapitals} capitals</span>
      </div>
      <div className="header-dice">
        <span className="dice-icon">🎲</span>
        <span className="dice-count">{player.availableDice}</span>
      </div>
    </header>
  );
}
