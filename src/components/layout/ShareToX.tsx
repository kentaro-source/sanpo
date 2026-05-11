import { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { useGame } from '../../hooks/useGame';
import { cities } from '../../data/cities';
import { positionAtKm } from '../../data/generateRoute';
import {
  isXAuthConfigured,
  loadStoredToken,
  startXAuth,
  clearStoredToken,
} from '../../services/xAuth';
import { postTweet, XPostError } from '../../services/xPost';
import {
  reverseGeocode,
  reverseGeocodeCached,
} from '../../services/geocode';
import { snappedPositionAtKm } from '../../services/playerPath';

interface PlaceLabel {
  name: string;
  cc: string;
}

interface Props {
  onClose: () => void;
  /**
   * Pre-fill the editable post text with this comment prepended to the
   * auto-generated stats template. Used by SicBoModal to share an
   * interesting roll (triple, big win/loss) with one tap.
   */
  initialComment?: string;
  /**
   * 'daily' (default): full daily progress template — Day count, route,
   *   steps, speed, distance, segment goal. The X account's main feed.
   * 'sicbo': lightweight casino-moment template — just the dice line
   *   + current location + hashtag. No daily stats noise.
   */
  mode?: 'daily' | 'sicbo';
}

const HASHTAG_LINE = '#せかいさんぽ';
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

export function ShareToX({ onClose, initialComment, mode = 'daily' }: Props) {
  const { nextCapital, visitedCount, totalCapitals, player, routeData, upcomingStops } =
    useGame();
  // The full editable text. Initialized from the auto-generated template
  // when the modal opens (and again on demand via the reset button) so
  // the user can freely tweak/delete/reorder before posting.
  const [text, setText] = useState('');
  const [touched, setTouched] = useState(false);

  // Lat/lng for today's start and current position. Prefers the
  // road-snapped polyline path (built lazily by MapView via Directions
  // API) since the squares-coarse positionAtKm drifts off the actual
  // route — reverse geocoding off the wrong lat/lng was returning
  // adjacent cities. Falls back to positionAtKm only if MapView hasn't
  // built the path window yet.
  const startLatLng = useMemo(() => {
    if (player.todayStartKm == null) return null;
    return (
      snappedPositionAtKm(player.todayStartKm) ??
      positionAtKm(routeData, player.todayStartKm)
    );
  }, [player.todayStartKm, routeData]);
  const currLatLng = useMemo(
    () =>
      snappedPositionAtKm(player.distanceKm) ??
      positionAtKm(routeData, player.distanceKm),
    [player.distanceKm, routeData],
  );

  // Reverse-geocoded labels — seeded synchronously from cache for
  // instant render on re-open.
  const [startLabel, setStartLabel] = useState<PlaceLabel | null>(() =>
    startLatLng ? reverseGeocodeCached(startLatLng.lat, startLatLng.lng) : null,
  );
  const [currLabel, setCurrLabel] = useState<PlaceLabel | null>(() =>
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

  // X OAuth state.
  const [xUsername, setXUsername] = useState<string | null>(null);
  const [xConnecting, setXConnecting] = useState(false);
  const [xPosting, setXPosting] = useState(false);
  const [xMessage, setXMessage] = useState<{
    kind: 'info' | 'error' | 'success';
    text: string;
  } | null>(null);
  useEffect(() => {
    loadStoredToken().then((t) => {
      if (t?.username) setXUsername(t.username);
    });
  }, []);

  const xConfigured = isXAuthConfigured();

  const handleConnect = async () => {
    setXConnecting(true);
    setXMessage(null);
    try {
      const t = await startXAuth();
      if (t.username) setXUsername(t.username);
      setXMessage({ kind: 'success', text: `@${t.username ?? '...'} と連携しました` });
    } catch (e) {
      setXMessage({
        kind: 'error',
        text: `連携失敗: ${(e as Error).message}`,
      });
    } finally {
      setXConnecting(false);
    }
  };

  const handleDisconnect = async () => {
    await clearStoredToken();
    setXUsername(null);
    setXMessage({ kind: 'info', text: 'X 連携を解除しました' });
  };

  const handleDirectPost = async (text: string) => {
    setXPosting(true);
    setXMessage(null);
    try {
      const r = await postTweet(text);
      setXMessage({ kind: 'success', text: `投稿完了 (${r.id})` });
      // Auto-close after a short pause so user can read the success.
      window.setTimeout(() => onClose(), 1200);
    } catch (e) {
      const err = e as XPostError;
      let msg = err.message;
      if (err.status === 401) msg = '認証期限切れ。再連携してください';
      else if (err.status === 429) msg = 'レート制限 (24h で再試行)';
      else if (err.status === 403) msg = '権限不足 — 連携をやり直す必要';
      setXMessage({ kind: 'error', text: msg });
    } finally {
      setXPosting(false);
    }
  };

  /**
   * Resolve a country code (ISO alpha-2) to its Japanese country name
   * by looking up the matching capital entry. Falls back to the code
   * itself if no capital exists with that id (shouldn't happen — every
   * country in the route has a capital entry).
   */
  const countryJaFor = useMemo(() => {
    return (cc: string): string => {
      if (!cc) return '';
      const cap = routeData.capitals.find((c) => c.id === cc.toUpperCase());
      return cap?.countryJa ?? cc;
    };
  }, [routeData.capitals]);

  /**
   * Route-local fallback used while the geocoder is loading or if the
   * Maps script isn't available. Picks the city/capital with the
   * smallest km-distance to the target position.
   */
  const placeNearKm = useMemo(() => {
    return (km: number): PlaceLabel | null => {
      let bestDelta = Infinity;
      let best: PlaceLabel | null = null;
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

    // Daily route line — prefer reverse-geocoded address (works when
    // MapView's road-snapped path is available), fall back to route-
    // local nearest city when geocode hasn't resolved.
    const hasTodayStart =
      player.attributedDayStart === todayStart && player.todayStartKm != null;
    const startPlace =
      hasTodayStart && player.todayStartKm != null
        ? startLabel ?? placeNearKm(player.todayStartKm)
        : null;
    const currPlace = currLabel ?? placeNearKm(player.distanceKm);

    if (startPlace && currPlace) {
      const sCountry = countryJaFor(startPlace.cc);
      const cCountry = countryJaFor(currPlace.cc);
      if (startPlace.name === currPlace.name) {
        lines.push(`${flagEmoji(currPlace.cc)} ${cCountry} ${currPlace.name}`);
      } else if (startPlace.cc === currPlace.cc) {
        // Same country — country name once, then both city names.
        lines.push(
          `${flagEmoji(startPlace.cc)} ${sCountry} ${startPlace.name} → ${currPlace.name}`,
        );
      } else {
        // Cross-border — country names on both sides.
        lines.push(
          `${flagEmoji(startPlace.cc)} ${sCountry} ${startPlace.name} → ${flagEmoji(currPlace.cc)} ${cCountry} ${currPlace.name}`,
        );
      }
    } else if (currPlace) {
      lines.push(
        `${flagEmoji(currPlace.cc)} ${countryJaFor(currPlace.cc)} ${currPlace.name}`,
      );
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

    // 平均速度 = todayKm / 推定歩行時間。
    // 推定歩行時間 = todaySteps / 100 steps-per-min (歩行ケイデンス
    // 仮定)。wall-clock 時間で割ると寝てる時間 etc 含まれて 1 km/h
    // 未満に出るが、それは「歩いてない時間」が大半な日のノイズで、
    // 「歩いてる時の平均速度」というユーザーの直感と合わない。
    const todayKmForAvg =
      player.attributedDayStart === todayStart ? player.todayKm ?? 0 : 0;
    if (todaySteps2 >= 100 && todayKmForAvg > 0) {
      // todayKm × 6000 / todaySteps = km/h (100 歩/分 = 6000 歩/時)
      const avgKmh = (todayKmForAvg * 6000) / todaySteps2;
      const avgStr = formatSpeed(avgKmh);
      if (avgStr) lines.push(`🚶 平均 ${avgStr}`);
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
    // 1 時間以上経過 + 何 km か進んでいる → 早出し ETA。Day 1 でも
    // 「このペースだと N 年」が見える。startDate が未来 (= 自動 reset
    // の予定時刻、まだ launch 前) の場合は elapsedDays < 0 なのでスキップ。
    if (elapsedDays >= 1 / 24 && walkedKm > 0 && remainingKm > 0) {
      const kmPerDay = walkedKm / elapsedDays;
      const etaDays = remainingKm / kmPerDay;
      const etaYears = etaDays / 365;
      if (etaYears >= 100) etaStr = '100年+';
      else if (etaYears >= 1) etaStr = `${etaYears.toFixed(1)}年`;
      else if (etaDays >= 30) etaStr = `${(etaDays / 30).toFixed(1)}ヶ月`;
      else etaStr = `${Math.round(etaDays)}日`;
    }
    // Day 2 以降は当日分の進捗 (今日 +Xkm) を 📏 行の先頭に追加。
    // Day 1 では todayKm ≈ walkedKm なので冗長になり省略。「累計」
    // ラベルは context で自明 (大きい km = 累計) なので付けない。
    const todayKm =
      player.attributedDayStart === todayStart ? player.todayKm ?? 0 : 0;
    const todayPart =
      dayNum > 1 && todayKm > 0 ? `今日 +${fmt(todayKm)}km / ` : '';
    const distLine = `📏 ${todayPart}${fmt(walkedKm)}km (${pctStr}%)${etaStr ? ` / ⏳ ${etaStr}` : ''}`;
    lines.push(distLine);

    // Long-haul progress: immediate next stop + segment goal capital.
    if (nextCapital) {
      const idx = Math.max(1, Math.min(visitedCount, totalCapitals));
      const next = upcomingStops?.[0];
      const nextIsCapital =
        next && next.kind === 'capital' && next.nameJa === nextCapital.nameJa;
      // 🏛 行: 次の都市 (中継 stop) + 次の国 (segment goal) を併記。
      // 中継都市の country 名は daily route 行 (🚶 日本 … → …) に
      // 既に出ているので、ここでは flag + 都市名のみ。次国 (== 段の
      // ゴール国) は countryJa を必ず付ける (flag fallback 不可な
      // obscure 国対策 — アゼルバイジャン AZ、サントメ ST etc)。
      // 次の到着 = 首都自体のとき (= 最終アプローチ) は単一表示。
      if (next && !nextIsCapital) {
        const nextFlag = next.countryCode ? flagEmoji(next.countryCode) : '';
        lines.push(
          `🏛 ${idx}/${totalCapitals} → ${nextFlag} ${next.nameJa} (→ ${flagEmoji(nextCapital.id)} ${nextCapital.countryJa})`,
        );
      } else {
        lines.push(
          `🏛 ${idx}/${totalCapitals} → ${flagEmoji(nextCapital.id)} ${nextCapital.countryJa} ${nextCapital.nameJa}`,
        );
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
    player.todayKm,
    player.todayMaxMultiplier,
    player.todayMinMultiplier,
    player.todayMultiplierDayStart,
    player.todaySicBoWins,
    player.todaySicBoLosses,
    player.boosts,
    placeNearKm,
    countryJaFor,
    startLabel,
    currLabel,
    upcomingStops,
  ]);

  // sicbo モード用の stats — 直近のロール履歴 (偏り context) + 現在地。
  // 各ロールに 大/小/ゾロ インラインタグを付けて、目の偏りが一目で
  // 読み取れるようにする (大連続 → 大-大-大… 等)。Day / 歩数 / 距離等
  // は daily-feed 用なので casino post には載せない。
  const sicboStats = useMemo(() => {
    const lines: string[] = [];
    const recent = (player.sicBoHistory ?? []).slice(-5);
    if (recent.length > 0) {
      const diceList = recent
        .map((r) => {
          const [a, b, c] = r.dice;
          const sum = a + b + c;
          const isTriple = a === b && b === c;
          const tag = isTriple ? 'ゾロ' : sum >= 11 ? '大' : '小';
          return `${a}-${b}-${c}${tag}`;
        })
        .join(' / ');
      lines.push(`📜 直近: ${diceList}`);
    }
    const currPlace = placeNearKm(player.distanceKm);
    if (currPlace) {
      lines.push(
        `${flagEmoji(currPlace.cc)} ${countryJaFor(currPlace.cc)} ${currPlace.name}`,
      );
    }
    return lines.join('\n');
  }, [
    player.sicBoHistory,
    player.distanceKm,
    placeNearKm,
    countryJaFor,
  ]);

  // Auto-generated template (= what we'd post if user did nothing).
  // initialComment (例: Sic Bo の結果) があれば stats の前に挟む。
  const template = useMemo(() => {
    const head = initialComment?.trim()
      ? `${initialComment.trim()}\n\n`
      : '';
    const body = mode === 'sicbo' ? sicboStats : stats;
    return `${head}${body}\n\n${HASHTAG_LINE}`;
  }, [stats, sicboStats, initialComment, mode]);

  // Initialize / refresh the textarea from template when modal opens
  // OR when stats change AND user hasn't manually touched the text yet.
  useEffect(() => {
    if (!touched) setText(template);
  }, [template, touched]);

  const totalLen = weightedLen(text);
  const remaining = X_CHAR_BUDGET - totalLen;
  const overBudget = remaining < 0;

  const handleResetText = () => {
    setText(template);
    setTouched(false);
  };

  const handlePost = () => {
    if (overBudget) return;
    const url = `https://x.com/intent/tweet?text=${encodeURIComponent(text)}`;
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
          <div className="share-label-row">
            <label className="share-label">投稿内容 (編集可)</label>
            {touched && (
              <button
                type="button"
                className="share-reset"
                onClick={handleResetText}
              >
                ⟲ 自動生成に戻す
              </button>
            )}
          </div>
          <textarea
            className="share-comment share-comment-tall"
            value={text}
            onChange={(e) => {
              setText(e.target.value);
              setTouched(true);
            }}
            rows={10}
            autoFocus
          />
          <div className={`share-charcount ${overBudget ? 'is-over' : ''}`}>
            {totalLen} / {X_CHAR_BUDGET}
            {overBudget && ' (オーバー)'}
          </div>
          {xMessage && (
            <div className={`share-x-msg share-x-msg-${xMessage.kind}`}>
              {xMessage.text}
            </div>
          )}
        </div>
        <div className="share-footer share-footer-row">
          {xConfigured && xUsername && (
            <button
              type="button"
              className="share-post-btn share-post-btn-direct"
              onClick={() => handleDirectPost(text)}
              disabled={overBudget || xPosting}
              title={`@${xUsername} に直接投稿`}
            >
              {xPosting ? '投稿中…' : `@${xUsername} に投稿`}
            </button>
          )}
          {xConfigured && !xUsername && (
            <button
              type="button"
              className="share-post-btn share-post-btn-connect"
              onClick={handleConnect}
              disabled={xConnecting}
            >
              {xConnecting ? '連携中…' : 'X 連携'}
            </button>
          )}
          <button
            type="button"
            className="share-post-btn"
            onClick={handlePost}
            disabled={overBudget}
          >
            𝕏 画面で開く
          </button>
        </div>
        {xConfigured && xUsername && (
          <div className="share-x-foot">
            <button
              type="button"
              className="share-disconnect"
              onClick={handleDisconnect}
            >
              連携解除
            </button>
          </div>
        )}
      </div>
    </div>,
    document.body,
  );
}
