import { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { useGame } from '../../hooks/useGame';
import { cities } from '../../data/cities';
import { positionAtKm } from '../../data/generateRoute';
import {
  reverseGeocode,
  reverseGeocodeCached,
  type GeocodeResult,
} from '../../services/geocode';

interface Props {
  onClose: () => void;
}

const HASHTAG_LINE = '#せかいさんぽ @sekai_sanpo_';
const BASE_KMH = 4;

function formatSpeed(kmh: number): string {
  if (!Number.isFinite(kmh) || kmh <= 0) return '';
  if (kmh >= 10) return `${Math.round(kmh)} km/h`;
  return `${kmh.toFixed(1)} km/h`;
}

/** ISO 3166-1 alpha-2 country code → flag emoji (regional indicators). */
function flagEmoji(cc: string): string {
  if (!cc || cc.length !== 2) return '';
  const A = 'A'.charCodeAt(0);
  return [...cc.toUpperCase()]
    .map((c) => String.fromCodePoint(0x1f1e6 + c.charCodeAt(0) - A))
    .join('');
}

export function ShareToX({ onClose }: Props) {
  const { nextCapital, visitedCount, totalCapitals, player, routeData } = useGame();
  const [comment, setComment] = useState('');

  // Lat/lng for today's start and current position. Memoized so the
  // geocode effect only re-fires when the player actually moves.
  const startLatLng = useMemo(() => {
    if (player.todayStartKm == null) return null;
    return positionAtKm(routeData, player.todayStartKm);
  }, [player.todayStartKm, routeData]);
  const currLatLng = useMemo(
    () => positionAtKm(routeData, player.distanceKm),
    [player.distanceKm, routeData],
  );

  // Reverse-geocoded labels. Seeded synchronously from cache so re-opens
  // at roughly the same position render instantly.
  const [startLabel, setStartLabel] = useState<GeocodeResult | null>(() =>
    startLatLng ? reverseGeocodeCached(startLatLng.lat, startLatLng.lng) : null,
  );
  const [currLabel, setCurrLabel] = useState<GeocodeResult | null>(() =>
    reverseGeocodeCached(currLatLng.lat, currLatLng.lng),
  );

  useEffect(() => {
    let cancel = false;
    if (startLatLng) {
      reverseGeocode(startLatLng.lat, startLatLng.lng).then((r) => {
        if (!cancel && r) setStartLabel(r);
      });
    } else {
      setStartLabel(null);
    }
    reverseGeocode(currLatLng.lat, currLatLng.lng).then((r) => {
      if (!cancel && r) setCurrLabel(r);
    });
    return () => {
      cancel = true;
    };
  }, [startLatLng, currLatLng]);

  /**
   * Route-local fallback used while the geocoder is loading or if the
   * Maps script isn't available. Picks the city/capital with the
   * smallest km-distance to the target position.
   */
  const placeNearKm = useMemo(() => {
    return (km: number): GeocodeResult | null => {
      let bestDelta = Infinity;
      let best: GeocodeResult | null = null;
      for (const cap of routeData.capitals) {
        const ckm = routeData.capitalDistances[cap.id];
        if (ckm == null) continue;
        const delta = Math.abs(ckm - km);
        if (delta < bestDelta) {
          bestDelta = delta;
          best = { name: cap.nameJa, cc: cap.id };
        }
      }
      for (const city of cities) {
        const ckm = routeData.cityDistances[city.id];
        if (ckm == null) continue;
        const delta = Math.abs(ckm - km);
        if (delta < bestDelta) {
          bestDelta = delta;
          best = { name: city.nameJa, cc: city.countryId };
        }
      }
      return best;
    };
  }, [routeData]);

  const stats = useMemo(() => {
    // Day number: count of local-midnight rollovers since startDate, +1.
    const startMid = new Date(player.startDate);
    startMid.setHours(0, 0, 0, 0);
    const nowMid = new Date();
    nowMid.setHours(0, 0, 0, 0);
    const dayNum = Math.max(
      1,
      Math.floor((nowMid.getTime() - startMid.getTime()) / 86400000) + 1,
    );

    const todayStart = nowMid.getTime();
    const lines: string[] = [];
    lines.push(`📅 Day ${dayNum}`);

    // Daily route line — geocoded address preferred, route-local city fallback.
    const hasTodayStart =
      player.attributedDayStart === todayStart && player.todayStartKm != null;
    const startPlace =
      (hasTodayStart && startLabel) ||
      (hasTodayStart && player.todayStartKm != null
        ? placeNearKm(player.todayStartKm)
        : null);
    const currPlace = currLabel ?? placeNearKm(player.distanceKm);

    if (startPlace && currPlace) {
      if (startPlace.name === currPlace.name) {
        lines.push(`${flagEmoji(currPlace.cc)} ${currPlace.name}`);
      } else if (startPlace.cc === currPlace.cc) {
        lines.push(
          `${flagEmoji(startPlace.cc)} ${startPlace.name} → ${currPlace.name}`,
        );
      } else {
        lines.push(
          `${flagEmoji(startPlace.cc)} ${startPlace.name} → ${flagEmoji(currPlace.cc)} ${currPlace.name}`,
        );
      }
    } else if (currPlace) {
      lines.push(`${flagEmoji(currPlace.cc)} ${currPlace.name}`);
    }

    // Step count for the day.
    const todaySteps =
      player.attributedDayStart === todayStart
        ? player.attributedTodaySteps ?? 0
        : 0;
    if (todaySteps > 0) {
      lines.push(`👣 ${todaySteps.toLocaleString()}歩`);
    }

    // Current speed = product of active boosts × 4 km/h. Always shown
    // even when no Sic Bo roll happened today, so the post never goes
    // bare on the speed dimension.
    const now = Date.now();
    let currentMult = 1;
    for (const b of player.boosts ?? []) {
      if (b.expiresAt > now && Number.isFinite(b.multiplier)) {
        currentMult *= b.multiplier;
      }
    }
    if (!Number.isFinite(currentMult) || currentMult <= 0) currentMult = 1;
    if (currentMult < 0.25) currentMult = 0.25;
    if (currentMult > 1000) currentMult = 1000;
    const currentKmh = currentMult * BASE_KMH;
    const currentStr = formatSpeed(currentKmh);
    if (currentStr) lines.push(`🚶 現在 ${currentStr}`);

    // Today's max / min effective multiplier — only added if a Sic Bo
    // roll happened today AND the band is wider than the current speed.
    if (player.todayMultiplierDayStart === todayStart) {
      const maxKmh = (player.todayMaxMultiplier ?? 0) * BASE_KMH;
      const minKmh = (player.todayMinMultiplier ?? 0) * BASE_KMH;
      const maxStr = formatSpeed(maxKmh);
      const minStr = formatSpeed(minKmh);
      if (maxStr && maxKmh > currentKmh + 0.5) lines.push(`🏃 最高 ${maxStr}`);
      if (minStr && minKmh + 0.5 < currentKmh) lines.push(`🐢 最低 ${minStr}`);
    }

    // Sic Bo wins/losses for the day. Only shown when there's been
    // any rolling activity, so a quiet day doesn't broadcast 0勝0負.
    if (player.todayMultiplierDayStart === todayStart) {
      const wins = player.todaySicBoWins ?? 0;
      const losses = player.todaySicBoLosses ?? 0;
      if (wins + losses > 0) {
        lines.push(`🎲 ${wins}勝${losses}負`);
      }
    }

    // Long-haul progress: which capital we're aiming for, with flag,
    // plus 何カ国目 for the world-tour-status bragging line.
    // visitedCount = countries already cleared (includes JP at start),
    // so it IS the index of the country the player currently stands in.
    if (nextCapital) {
      const idx = Math.max(1, Math.min(visitedCount, totalCapitals));
      lines.push(
        `🏛 ${idx}/${totalCapitals} カ国目 → ${flagEmoji(nextCapital.id)} ${nextCapital.nameJa}`,
      );
    }

    return lines.join('\n');
  }, [
    nextCapital,
    visitedCount,
    totalCapitals,
    player.startDate,
    player.distanceKm,
    player.attributedTodaySteps,
    player.attributedDayStart,
    player.todayStartKm,
    player.todayMaxMultiplier,
    player.todayMinMultiplier,
    player.todayMultiplierDayStart,
    player.todaySicBoWins,
    player.todaySicBoLosses,
    player.boosts,
    startLabel,
    currLabel,
    placeNearKm,
  ]);

  const finalText = useMemo(() => {
    const parts: string[] = [];
    if (comment.trim()) parts.push(comment.trim());
    parts.push(stats);
    parts.push(HASHTAG_LINE);
    return parts.join('\n\n');
  }, [comment, stats]);

  const handlePost = () => {
    const url = `https://x.com/intent/tweet?text=${encodeURIComponent(finalText)}`;
    window.open(url, '_blank', 'noopener,noreferrer');
    onClose();
  };

  return createPortal(
    <div className="share-overlay" onClick={onClose}>
      <div className="share-sheet" onClick={(e) => e.stopPropagation()}>
        <header className="share-header">
          <span className="share-title">𝕏 に投稿</span>
          <button
            type="button"
            className="menu-close"
            onClick={onClose}
            aria-label="閉じる"
          >
            ✕
          </button>
        </header>
        <div className="share-body">
          <label className="share-label">コメント (任意)</label>
          <textarea
            className="share-comment"
            placeholder="今日の散歩の感想とか…"
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            rows={3}
            maxLength={140}
            autoFocus
          />
          <div className="share-charcount">{comment.length} / 140</div>

          <label className="share-label">プレビュー</label>
          <div className="share-preview-card">
            <img
              className="share-preview-avatar"
              src={`${import.meta.env.BASE_URL}x-promo/profile-400.png`}
              alt=""
            />
            <div className="share-preview-content">
              <div className="share-preview-author">
                <span className="share-preview-name">せかいさんぽ</span>
                <span className="share-preview-handle">@sekai_sanpo_ · 今</span>
              </div>
              <div className="share-preview-text">
                {finalText.split('\n').map((line, i) => (
                  <span key={i} className="share-preview-line">
                    {line.split(/(\s+)/).map((tok, j) =>
                      tok.startsWith('#') || tok.startsWith('@') ? (
                        <span key={j} className="share-preview-link">
                          {tok}
                        </span>
                      ) : (
                        <span key={j}>{tok}</span>
                      ),
                    )}
                    {'\n'}
                  </span>
                ))}
              </div>
            </div>
          </div>
        </div>
        <div className="share-footer">
          <button
            type="button"
            className="share-post-btn"
            onClick={handlePost}
          >
            𝕏 で投稿画面を開く
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
