import { useState } from 'react';
import { ShareToX } from './ShareToX';
import { useGame } from '../../hooks/useGame';

interface Props {
  onForceReload: () => void;
}

export function HamburgerMenu({ onForceReload }: Props) {
  const { forceLaunchReset } = useGame();
  const [open, setOpen] = useState(false);
  const [shareOpen, setShareOpen] = useState(false);

  if (!open) {
    return (
      <>
        <button
          type="button"
          className="header-menu"
          onClick={() => setOpen(true)}
          aria-label="メニュー"
          title="メニュー"
        >
          ☰
        </button>
        {shareOpen && <ShareToX onClose={() => setShareOpen(false)} />}
      </>
    );
  }

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
            <span className="menu-title">メニュー</span>
            <button
              type="button"
              className="menu-close"
              onClick={() => setOpen(false)}
              aria-label="閉じる"
            >
              ✕
            </button>
          </header>

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
                onClick={() => {
                  setOpen(false);
                  onForceReload();
                }}
              >
                ⟳ 強制更新
              </button>
            </li>
            <li>
              <button
                type="button"
                className="menu-item"
                onClick={() => {
                  if (
                    confirm(
                      '5/7 Day 1 にリセットします。現在の進捗・チップは消去されます。よろしい?',
                    )
                  ) {
                    setOpen(false);
                    forceLaunchReset();
                  }
                }}
              >
                🚀 5/7 Day 1 にリセット
              </button>
            </li>
          </ul>
        </div>
      </div>
      {shareOpen && <ShareToX onClose={() => setShareOpen(false)} />}
    </>
  );
}
