import { useGame } from '../../hooks/useGame';

export function ProgressInfo() {
  const {
    nextCapital,
    upcomingStops,
    progressPercent,
    player,
    visitedCount,
    totalCapitals,
  } = useGame();

  return (
    <div className="progress-info">
      <div className="progress-next">
        {nextCapital ? (
          <>
            <span className="progress-label">次の停車地</span>
            <ol className="progress-stops">
              {upcomingStops.map((stop) => (
                <li
                  key={stop.squareIndex}
                  className={`progress-stop progress-stop-${stop.kind}${
                    stop.visitedInRealLife ? ' progress-stop-irl' : ''
                  }`}
                >
                  <span className="progress-stop-name">
                    {stop.kind === 'capital' ? '🏛 ' : '📍 '}
                    {stop.nameJa}
                    {stop.countryJa && stop.kind === 'capital' && (
                      <span className="progress-country">({stop.countryJa})</span>
                    )}
                  </span>
                  <span className="progress-stop-dist">{stop.squaresAway}マス</span>
                </li>
              ))}
            </ol>
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
