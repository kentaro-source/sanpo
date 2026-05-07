import { useState } from 'react';
import { ShareToX } from './ShareToX';
import { useGame } from '../../hooks/useGame';

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
  const { player } = useGame();
  const [open, setOpen] = useState(false);
  const [view, setView] = useState<'menu' | 'history'>('menu');
  const [shareOpen, setShareOpen] = useState(false);

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
      <div className="menu-overlay" onClick={() => setOpen(false)}>
        <div className="menu-sheet" onClick={(e) => e.stopPropagation()}>
          <header className="menu-header">
            <span className="menu-title">
              {view === 'menu' ? 'メニュー' : '日別記録'}
            </span>
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
        </div>
      </div>
      {shareOpen && <ShareToX onClose={() => setShareOpen(false)} />}
    </>
  );
}
