import { useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { ShareToX } from './ShareToX';
import { useGame } from '../../hooks/useGame';
import { cities } from '../../data/cities';
import { exportSaveText, importSaveText } from '../../utils/storage';

interface Props {
  onForceReload: () => void;
}

function formatKm(km: number): string {
  if (km >= 100) return `${Math.round(km).toLocaleString()}km`;
  if (km >= 10) return `${km.toFixed(1)}km`;
  return `${km.toFixed(2)}km`;
}

function formatDay(ts: number): string {
  const d = new Date(ts);
  const md = `${d.getMonth() + 1}/${d.getDate()}`;
  const dow = ['日', '月', '火', '水', '木', '金', '土'][d.getDay()];
  return `${md}(${dow})`;
}

export function HamburgerMenu({ onForceReload }: Props) {
  const { player, routeData, distanceKm, setDistanceKm } = useGame();
  const [open, setOpen] = useState(false);
  const [view, setView] = useState<
    'menu' | 'history' | 'correct' | 'backup'
  >('menu');
  const [backupText, setBackupText] = useState('');
  const [backupMsg, setBackupMsg] = useState<{
    kind: 'ok' | 'err';
    text: string;
  } | null>(null);
  const [shareOpen, setShareOpen] = useState(false);
  const [targetKm, setTargetKm] = useState(0);

  // Sorted list of every route stop (capital + city) with its km, for the
  // 🔧 現在地を補正 panel's "どの街を過ぎたか" live readout.
  const stops = useMemo(() => {
    const s: { name: string; km: number }[] = [];
    for (const cap of routeData.capitals) {
      const km = routeData.capitalDistances[cap.id];
      if (km != null) s.push({ name: `${cap.nameJa}(${cap.countryJa})`, km });
    }
    for (const c of cities) {
      const km = routeData.cityDistances[c.id];
      if (km != null) s.push({ name: c.nameJa, km });
    }
    s.sort((a, b) => a.km - b.km);
    return s;
  }, [routeData]);

  const locate = (km: number): string => {
    let passed: { name: string; km: number } | undefined;
    let next: { name: string; km: number } | undefined;
    for (const s of stops) {
      if (s.km <= km) passed = s;
      else {
        next = s;
        break;
      }
    }
    const head = passed ? `${passed.name} を過ぎた地点` : 'スタート地点';
    const tail = next ? ` / ${next.name} まで ${Math.round(next.km - km)}km` : '';
    return head + tail;
  };

  // One-time warp recovery. The 2026-06 restoreDistanceOnce bug shoved the
  // player ~1,100km forward (運城 → past 武漢). 運城(Yuncheng) is not a
  // waypoint; it sits ~45% along the 西安→鄭州 leg, so we rebuild its km from
  // those two waypoints (survives minor route shifts). Adding back exactly
  // today's real walk (distanceKm − todayStartKm) means nothing walked today
  // is lost.
  const yunchengKm = useMemo(() => {
    const xian = routeData.cityDistances['CN-XIAN'];
    const zz = routeData.cityDistances['CN-ZHENGZHOU'];
    if (xian == null || zz == null) return null;
    return xian + 0.45 * (zz - xian);
  }, [routeData]);

  const todaysWalk = Math.max(
    0,
    distanceKm - (player.todayStartKm ?? distanceKm),
  );
  const suggestedKm =
    yunchengKm != null ? Math.round(yunchengKm + todaysWalk) : null;

  const openCorrect = () => {
    setTargetKm(suggestedKm ?? Math.round(distanceKm));
    setView('correct');
  };

  const clampKm = (km: number) =>
    Math.max(0, Math.min(routeData.totalDistanceKm, km));

  const nudge = (delta: number) => setTargetKm((k) => clampKm(k + delta));

  const applyCorrection = () => {
    setDistanceKm(targetKm);
    setOpen(false);
    setView('menu');
  };

  if (!open) {
    return (
      <>
        <button
          type="button"
          className="header-menu"
          onClick={() => {
            setOpen(true);
            setView('menu');
          }}
          aria-label="メニュー"
          title="メニュー"
        >
          ☰
        </button>
        {shareOpen && <ShareToX onClose={() => setShareOpen(false)} />}
      </>
    );
  }

  // Today's row + reverse-chronological history (newest first).
  const todayStart = (() => {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    return d.getTime();
  })();
  const todayRow = {
    dayStart: todayStart,
    steps: player.attributedTodaySteps ?? 0,
    km: player.todayKm ?? 0,
    sicBoWins: player.todaySicBoWins ?? 0,
    sicBoLosses: player.todaySicBoLosses ?? 0,
    newCapitals: player.todayNewCapitals ?? 0,
    newCities: player.todayNewCities ?? 0,
  };
  const past = (player.dailyHistory ?? []).slice().reverse();

  const titleFor =
    view === 'menu' ? 'メニュー' : view === 'history' ? '日別記録' : '現在地を補正';

  const delta = targetKm - Math.round(distanceKm);

  return (
    <>
      <button
        type="button"
        className="header-menu"
        onClick={() => setOpen(false)}
        aria-label="メニュー"
      >
        ☰
      </button>
      {createPortal(
        <div className="menu-overlay" onClick={() => setOpen(false)}>
        <div className="menu-sheet" onClick={(e) => e.stopPropagation()}>
          <header className="menu-header">
            <span className="menu-title">{titleFor}</span>
            <button
              type="button"
              className="menu-close"
              onClick={() => setOpen(false)}
              aria-label="閉じる"
            >
              ✕
            </button>
          </header>

          {view === 'menu' && (
            <ul className="menu-list">
              <li>
                <button
                  type="button"
                  className="menu-item"
                  onClick={() => {
                    setOpen(false);
                    setShareOpen(true);
                  }}
                >
                  𝕏 投稿
                </button>
              </li>
              <li>
                <button
                  type="button"
                  className="menu-item"
                  onClick={() => setView('history')}
                >
                  📊 日別記録
                </button>
              </li>
              <li>
                <button
                  type="button"
                  className="menu-item"
                  onClick={openCorrect}
                >
                  🔧 現在地を補正
                </button>
              </li>
              <li>
                <button
                  type="button"
                  className="menu-item"
                  onClick={() => setView('backup')}
                >
                  💾 バックアップ
                </button>
              </li>
              <li>
                <button
                  type="button"
                  className="menu-item"
                  onClick={() => {
                    setOpen(false);
                    onForceReload();
                  }}
                >
                  ⟳ 強制更新
                </button>
              </li>
            </ul>
          )}

          {view === 'history' && (
            <div className="menu-history">
              <button
                type="button"
                className="menu-back"
                onClick={() => setView('menu')}
              >
                ← 戻る
              </button>
              <ol className="daily-list">
                <li className="daily-row daily-today">
                  <div className="daily-date">
                    {formatDay(todayRow.dayStart)} 今日
                  </div>
                  <div className="daily-stats">
                    <span>{todayRow.steps.toLocaleString()}歩</span>
                    <span>{formatKm(todayRow.km)}</span>
                    {todayRow.sicBoWins + todayRow.sicBoLosses > 0 && (
                      <span>
                        🎲 {todayRow.sicBoWins}勝/{todayRow.sicBoLosses}負
                      </span>
                    )}
                    {todayRow.newCapitals > 0 && (
                      <span>🏛 +{todayRow.newCapitals}</span>
                    )}
                    {todayRow.newCities > 0 && (
                      <span>📍 +{todayRow.newCities}</span>
                    )}
                  </div>
                </li>
                {past.map((d) => (
                  <li key={d.dayStart} className="daily-row">
                    <div className="daily-date">{formatDay(d.dayStart)}</div>
                    <div className="daily-stats">
                      <span>{d.steps.toLocaleString()}歩</span>
                      <span>{formatKm(d.km)}</span>
                      {d.sicBoWins + d.sicBoLosses > 0 && (
                        <span>
                          🎲 {d.sicBoWins}勝/{d.sicBoLosses}負
                        </span>
                      )}
                      {d.newCapitals > 0 && <span>🏛 +{d.newCapitals}</span>}
                      {d.newCities > 0 && <span>📍 +{d.newCities}</span>}
                    </div>
                  </li>
                ))}
              </ol>
            </div>
          )}

          {view === 'correct' && (
            <div className="menu-correct">
              <button
                type="button"
                className="menu-back"
                onClick={() => setView('menu')}
              >
                ← 戻る
              </button>

              <p className="correct-note">
                起動時のバグで現在地が約1,100km 前方へワープしました。下の値は
                「運城（昨日の終点）＋今日歩いた {formatKm(Math.round(todaysWalk))}」に
                自動セット済みです。地図で確認して「この位置に補正」を押してください。
                今日歩いた分は失われません。ズレていれば下のボタンで微調整できます。
              </p>

              {suggestedKm != null && (
                <button
                  type="button"
                  className="correct-suggest"
                  onClick={() => setTargetKm(suggestedKm)}
                >
                  🛂 運城＋今日の歩行に自動セット（{formatKm(suggestedKm)}）
                </button>
              )}

              <div className="correct-row">
                <span className="correct-label">現在値（ワープ後）</span>
                <span className="correct-value">
                  {formatKm(Math.round(distanceKm))}
                </span>
              </div>

              <div className="correct-row correct-target">
                <span className="correct-label">補正後</span>
                <span className="correct-value">
                  {formatKm(targetKm)}
                  {delta !== 0 && (
                    <span
                      className="correct-delta"
                      style={{ color: delta < 0 ? '#2563eb' : '#dc2626' }}
                    >
                      {' '}
                      ({delta > 0 ? '+' : ''}
                      {delta.toLocaleString()}km)
                    </span>
                  )}
                </span>
              </div>

              <div className="correct-locate">📍 {locate(targetKm)}</div>

              <div className="correct-steppers">
                {[-100, -10, -1, 1, 10, 100].map((d) => (
                  <button
                    key={d}
                    type="button"
                    className="correct-step"
                    onClick={() => nudge(d)}
                  >
                    {d > 0 ? `+${d}` : d}
                  </button>
                ))}
              </div>

              <div className="correct-actions">
                <button
                  type="button"
                  className="correct-reset"
                  onClick={() => setTargetKm(Math.round(distanceKm))}
                >
                  現在値に戻す
                </button>
                <button
                  type="button"
                  className="correct-apply"
                  disabled={delta === 0}
                  onClick={applyCorrection}
                >
                  この位置に補正
                </button>
              </div>
            </div>
          )}

          {view === 'backup' && (
            <div className="menu-correct">
              <button
                type="button"
                className="menu-back"
                onClick={() => {
                  setView('menu');
                  setBackupMsg(null);
                }}
              >
                ← 戻る
              </button>

              <p className="correct-note">
                進行データはこの端末の中だけにあります。端末の故障・紛失・
                データ消去で歩いた記録は失われます。下の文字列をコピーして
                メモ等に保存しておけば、あとから元に戻せます。
              </p>

              <button
                type="button"
                className="correct-suggest"
                onClick={async () => {
                  const text = exportSaveText();
                  setBackupText(text);
                  try {
                    await navigator.clipboard.writeText(text);
                    setBackupMsg({
                      kind: 'ok',
                      text: `コピーしました（${text.length.toLocaleString()}文字）`,
                    });
                  } catch {
                    setBackupMsg({
                      kind: 'ok',
                      text: '下の欄に出しました。長押しでコピーしてください',
                    });
                  }
                }}
              >
                💾 バックアップを作る（クリップボードにコピー）
              </button>

              <textarea
                className="share-comment share-comment-tall"
                value={backupText}
                onChange={(e) => setBackupText(e.target.value)}
                placeholder="ここにバックアップ文字列が出ます。復元するときは保存しておいた文字列を貼り付けてください。"
                rows={8}
              />

              <button
                type="button"
                className="correct-apply"
                disabled={backupText.trim().length === 0}
                onClick={() => {
                  const r = importSaveText(backupText);
                  if (r.ok) {
                    setBackupMsg({
                      kind: 'ok',
                      text: `復元しました（${formatKm(r.distanceKm)}）。反映のため再読み込みします`,
                    });
                    window.setTimeout(() => window.location.reload(), 1200);
                  } else {
                    setBackupMsg({ kind: 'err', text: r.error });
                  }
                }}
              >
                ⬆ この文字列から復元する
              </button>

              {backupMsg && (
                <p
                  className="correct-note"
                  style={{
                    color: backupMsg.kind === 'err' ? '#dc2626' : '#059669',
                  }}
                >
                  {backupMsg.text}
                </p>
              )}
            </div>
          )}
        </div>
        </div>,
        document.body,
      )}
      {shareOpen && <ShareToX onClose={() => setShareOpen(false)} />}
    </>
  );
}
