import { useGame } from '../../hooks/useGame';

export function ProgressInfo() {
  const { nextCapital, squaresToNext, progressPercent, player, visitedCount, totalCapitals } = useGame();

  return (
    <div className="progress-info">
      <div className="progress-next">
        {nextCapital ? (
          <>
            <span className="progress-label">次の目的地</span>
            <span className="progress-capital">
              {nextCapital.nameJa}
              <span className="progress-country">({nextCapital.countryJa})</span>
            </span>
            <span className="progress-remaining">残り {squaresToNext} マス</span>
          </>
        ) : (
          <span className="progress-label">世界一周達成！</span>
        )}
      </div>
      <div className="progress-bar-container">
        <div className="progress-bar">
          <div className="progress-bar-fill" style={{ width: `${progressPercent}%` }} />
        </div>
        <div className="progress-stats">
          <span>{visitedCount}/{totalCapitals} 首都</span>
          <span>{progressPercent.toFixed(1)}%</span>
          {player.completedLaps > 0 && <span>{player.completedLaps}周目</span>}
        </div>
      </div>
    </div>
  );
}
