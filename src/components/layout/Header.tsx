import { useGame } from '../../hooks/useGame';

async function hardReload() {
  try {
    if ('serviceWorker' in navigator) {
      const regs = await navigator.serviceWorker.getRegistrations();
      await Promise.all(regs.map((r) => r.unregister()));
    }
    if ('caches' in window) {
      const keys = await caches.keys();
      await Promise.all(keys.map((k) => caches.delete(k)));
    }
  } catch {
    // ignore
  }
  // Bypass HTTP cache by appending a timestamp.
  const url = new URL(window.location.href);
  url.searchParams.set('_r', String(Date.now()));
  window.location.replace(url.toString());
}

export function Header() {
  const { player, config, visitedCount, totalCapitals } = useGame();

  return (
    <header className="header">
      <h1 className="header-title">せかいさんぽ</h1>
      <div className="header-meta">{visitedCount}/{totalCapitals}</div>
      <div className="header-dice">
        <span className="dice-icon">🎲</span>
        <span className="dice-count">{player.availableDice}/{config.maxDice}</span>
      </div>
      <button
        type="button"
        className="header-reload"
        onClick={hardReload}
        aria-label="強制更新"
        title="強制更新"
      >
        ⟳
      </button>
    </header>
  );
}
