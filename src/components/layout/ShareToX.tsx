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

const HASHTAG_LINE = '#せかいさんぽ';
const BASE_KMH = 4;
const X_CHAR_BUDGET = 280;

/**
 * Approximate X's "weighted character" rule: ASCII codepoints count
 * as 1, everything else (CJK, kana, emoji) counts as 2. Close enough
 * to twitter-text's official ranges for our daily-post use case.
 */
function weightedLen(s: string): number {
  let w = 0;
  for (const ch of s) {
    const code = ch.codePointAt(0) ?? 0;
    w += code <= 0x7f ? 1 : 2;
  }
  return w;
}

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
  const { nextCapital, visitedCount, totalCapitals, player, routeData, upcomingStops } =
    useGame();
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

    // Combined steps + Sic Bo wins/losses on one compact line.
    const todaySteps2 =
      player.attributedDayStart === todayStart
        ? player.attributedTodaySteps ?? 0
        : 0;
    const wins =
      player.todayMultiplierDayStart === todayStart
        ? player.todaySicBoWins ?? 0
        : 0;
    const losses =
      player.todayMultiplierDayStart === todayStart
        ? player.todaySicBoLosses ?? 0
        : 0;
    // (歩数行は上で push 済 — ここでは 🎲 をその後ろに付けたいが、
    //  既に push しているので歩数行があれば置換、なければ独立で push)
    if (wins + losses > 0) {
      const last = lines.length - 1;
      if (todaySteps2 > 0 && lines[last]?.startsWith('👣')) {
        lines[last] = `${lines[last]} 🎲 ${wins}勝${losses}負`;
      } else {
        lines.push(`🎲 ${wins}勝${losses}負`);
      }
    }

    // Speed band: 最高 / 最低 on one line when both are interesting.
    if (player.todayMultiplierDayStart === todayStart) {
      const maxKmh = (player.todayMaxMultiplier ?? 0) * BASE_KMH;
      const minKmh = (player.todayMinMultiplier ?? 0) * BASE_KMH;
      const maxStr = formatSpeed(maxKmh);
      const minStr = formatSpeed(minKmh);
      if (maxStr && minStr && minKmh < maxKmh) {
        lines.push(`🏃 ${maxStr} / 🐢 ${minStr}`);
      } else if (maxStr) {
        lines.push(`🏃 ${maxStr}`);
      }
    }

    // Distance + ETA combined on one compact line.
    const totalKm = routeData.totalDistanceKm;
    const walkedKm = Math.max(0, player.distanceKm);
    const remainingKm = Math.max(0, totalKm - walkedKm);
    const fmt = (km: number) =>
      km >= 100 ? Math.round(km).toLocaleString() : km.toFixed(1);
    const pct = totalKm > 0 ? (walkedKm / totalKm) * 100 : 0;
    const pctStr = pct < 0.1 ? pct.toFixed(2) : pct.toFixed(1);

    let etaStr = '';
    const elapsedDays =
      (Date.now() - player.startDate) / (1000 * 60 * 60 * 24);
    if (elapsedDays >= 1 && walkedKm > 0 && remainingKm > 0) {
      const kmPerDay = walkedKm / elapsedDays;
      const etaDays = remainingKm / kmPerDay;
      const etaYears = etaDays / 365;
      if (etaYears >= 100) etaStr = '100年+';
      else if (etaYears >= 1) etaStr = `${etaYears.toFixed(1)}年`;
      else if (etaDays >= 30) etaStr = `${(etaDays / 30).toFixed(1)}ヶ月`;
      else etaStr = `${Math.round(etaDays)}日`;
    }
    const distLine = `📏 ${fmt(walkedKm)}km (${pctStr}%)${etaStr ? ` / ⏳ ${etaStr}` : ''}`;
    lines.push(distLine);

    // Long-haul progress: immediate next stop + segment goal capital.
    if (nextCapital) {
      const idx = Math.max(1, Math.min(visitedCount, totalCapitals));
      const next = upcomingStops?.[0];
      const nextIsCapital =
        next && next.kind === 'capital' && next.nameJa === nextCapital.nameJa;
      const nextFlag = next?.countryCode ? flagEmoji(next.countryCode) : '';
      const goalFlag = flagEmoji(nextCapital.id);
      const goalLabel = `${goalFlag}${nextCapital.nameJa}`;
      if (next && !nextIsCapital) {
        lines.push(
          `🏛 ${idx}/${totalCapitals} → ${nextFlag}${next.nameJa} (→ ${goalLabel})`,
        );
      } else {
        lines.push(`🏛 ${idx}/${totalCapitals} → ${goalLabel}`);
      }
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
    upcomingStops,
  ]);

  const finalText = useMemo(() => {
    const parts: string[] = [];
    if (comment.trim()) parts.push(comment.trim());
    parts.push(stats);
    parts.push(HASHTAG_LINE);
    return parts.join('\n\n');
  }, [comment, stats]);

  // X weighted-char budget calc — stats + hashtag is fixed (auto-gen),
  // the remaining budget is what's available for the freely-typed
  // comment. statsBaseLen includes the leading "\n\n" separator that
  // appears once a comment is added so the displayed budget matches
  // the actual posted text exactly.
  const statsBaseLen = useMemo(
    () => weightedLen(`\n\n${stats}\n\n${HASHTAG_LINE}`),
    [stats],
  );
  const commentLen = useMemo(() => weightedLen(comment), [comment]);
  const remaining = X_CHAR_BUDGET - statsBaseLen - commentLen;
  const overBudget = remaining < 0;

  const handlePost = () => {
    if (overBudget) return;
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
          <label className="share-label">
            コメント (任意 — 残り {remaining} 文字)
          </label>
          <textarea
            className="share-comment"
            placeholder="今日の散歩の感想とか…"
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            rows={3}
            autoFocus
          />
          <div
            className={`share-charcount ${overBudget ? 'is-over' : ''}`}
          >
            {commentLen} / {X_CHAR_BUDGET - statsBaseLen} (合計{' '}
            {statsBaseLen + commentLen} / {X_CHAR_BUDGET})
          </div>

          <label className="share-label">プレビュー</label>
          <div className="share-preview-card">
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
        <div className="share-footer">
          <button
            type="button"
            className="share-post-btn"
            onClick={handlePost}
            disabled={overBudget}
          >
            {overBudget ? '文字数オーバー' : '𝕏 で投稿画面を開く'}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
