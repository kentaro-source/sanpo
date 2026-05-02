import { useGame } from '../../hooks/useGame';

function formatKm(km: number): string {
  if (km >= 100) {
    // 1,234km / 850km — comma thousands separator, no decimals
    return `${Math.round(km).toLocaleString()}km`;
  }
  if (km >= 10) return `${km.toFixed(1)}km`;
  return `${km.toFixed(2)}km`;
}

function formatDuration(ms: number): string {
  const totalMin = Math.floor(ms / 60_000);
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  if (h > 0) return `${h}h${m}m`;
  return `${m}m`;
}

export function ProgressInfo() {
  const {
    nextCapital,
    upcomingStops,
    progressPercent,
    player,
    visitedCount,
    totalCapitals,
    localKm,
    multiplierActive,
    multiplierMsLeft,
    effectiveMultiplier,
    activeBoosts,
  } = useGame();

  return (
    <div className="progress-info">
      {multiplierActive && (
        <div className="progress-multiplier">
          ⚡ ×{effectiveMultiplier.toFixed(effectiveMultiplier < 10 ? 1 : 0)}{' '}
          加速中
          {activeBoosts.length > 1 && ` (${activeBoosts.length}本)`}{' '}
          （次の失効まで {formatDuration(multiplierMsLeft)}）
        </div>
      )}
      <div className="progress-next">
        {nextCapital ? (
          <>
            <span className="progress-label">次の停車地</span>
            <ol className="progress-stops">
              {upcomingStops.map((stop, i) => (
                <li
                  key={`${stop.nameJa}-${i}`}
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
                  <span className="progress-stop-dist">
                    {formatKm(stop.kmFromPrev)}
                    <span className="progress-stop-total">/ 計{formatKm(stop.kmAway)}</span>
                  </span>
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
          <span>{progressPercent.toFixed(1)}% ({formatKm(localKm)})</span>
          {player.completedLaps > 0 && <span>{player.completedLaps}周目</span>}
        </div>
      </div>
    </div>
  );
}
