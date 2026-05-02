import { useState } from 'react';
import { useGame } from '../../hooks/useGame';

function formatKm(km: number): string {
  if (km >= 100) {
    // 1,234km / 850km — comma thousands separator, no decimals
    return `${Math.round(km).toLocaleString()}km`;
  }
  if (km >= 10) return `${km.toFixed(1)}km`;
  return `${km.toFixed(2)}km`;
}

/** Convert ISO 3166-1 alpha-2 country code to its flag emoji. */
function flagEmoji(cc: string): string {
  if (!cc || cc.length !== 2) return '';
  const A = 'A'.charCodeAt(0);
  return [...cc.toUpperCase()]
    .map((c) => String.fromCodePoint(0x1f1e6 + c.charCodeAt(0) - A))
    .join('');
}

/** Walking baseline speed: ~4 km/h. Multiplier scales this linearly. */
const BASE_SPEED_KMH = 4;

/** Pick a transport mode emoji that matches the effective km/h. */
function speedMode(kmh: number): string {
  if (kmh < 3) return '👶';      // baby crawl — Sic Bo loss penalty zone (×0.5 → 2km/h)
  if (kmh < 6) return '🚶';      // walking — base ×1
  if (kmh < 12) return '🏃';     // running
  if (kmh < 25) return '🚴';     // cycling
  if (kmh < 60) return '🛵';     // scooter
  if (kmh < 120) return '🚗';    // car
  if (kmh < 250) return '🚄';    // bullet train
  if (kmh < 700) return '✈️';   // plane
  return '🚀';                   // rocket
}

function formatSpeed(kmh: number): string {
  if (kmh < 10) return `${kmh.toFixed(1)}km/h`;
  if (kmh < 1000) return `${Math.round(kmh)}km/h`;
  return `${Math.round(kmh).toLocaleString()}km/h`;
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
  const [expandedIdx, setExpandedIdx] = useState<number | null>(null);

  const speed = BASE_SPEED_KMH * effectiveMultiplier;
  const isSlowdown = multiplierActive && effectiveMultiplier < 1;

  return (
    <div className="progress-info">
      {multiplierActive && (
        <div className={`progress-multiplier ${isSlowdown ? 'slowdown' : ''}`}>
          {isSlowdown ? '👶' : '⚡'} ×
          {effectiveMultiplier.toFixed(effectiveMultiplier < 10 ? 1 : 0)}{' '}
          {isSlowdown ? '減速中' : '加速中'}
          {activeBoosts.length > 1 && ` (${activeBoosts.length}本)`}{' '}
          （次の失効まで {formatDuration(multiplierMsLeft)}）
        </div>
      )}
      <div className="progress-speed">
        <span className="speed-mode">{speedMode(speed)}</span>
        <span className="speed-value">{formatSpeed(speed)}</span>
        <span className="speed-base">標準 {BASE_SPEED_KMH}km/h × {effectiveMultiplier.toFixed(effectiveMultiplier < 10 ? 1 : 0)}</span>
      </div>
      <div className="progress-next">
        {nextCapital ? (
          <>
            <ol className="progress-stops">
              {upcomingStops.map((stop, i) => {
                const expanded = expandedIdx === i;
                return (
                  <li
                    key={`${stop.nameJa}-${i}`}
                    className={`progress-stop progress-stop-${stop.kind}${
                      stop.visitedInRealLife ? ' progress-stop-irl' : ''
                    }${expanded ? ' progress-stop-expanded' : ''}`}
                    onClick={() => setExpandedIdx(expanded ? null : i)}
                  >
                    <div className="progress-stop-row">
                      <span className="progress-stop-name">
                        {stop.kind === 'capital' ? '🏛 ' : '📍 '}
                        {stop.countryCode && (
                          <span className="progress-stop-flag">
                            {flagEmoji(stop.countryCode)}{' '}
                          </span>
                        )}
                        {stop.nameJa}
                        {stop.countryJa && stop.kind === 'capital' && (
                          <span className="progress-country">({stop.countryJa})</span>
                        )}
                      </span>
                      <span className="progress-stop-dist">
                        {formatKm(stop.kmFromPrev)}
                        <span className="progress-stop-total">/ 計{formatKm(stop.kmAway)}</span>
                      </span>
                    </div>
                    {expanded && (
                      <div className="progress-stop-detail">
                        {stop.description && (
                          <div className="progress-stop-desc">{stop.description}</div>
                        )}
                        <div className="progress-stop-meta">
                          {stop.name && <span>{stop.name}</span>}
                          {stop.countryJa && stop.kind === 'city' && (
                            <span> · {stop.countryJa}</span>
                          )}
                          {stop.visitedInRealLife && (
                            <span className="progress-stop-irl-tag"> · ★ 思い出の地</span>
                          )}
                        </div>
                      </div>
                    )}
                  </li>
                );
              })}
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
