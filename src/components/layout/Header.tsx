import { useGame } from '../../hooks/useGame';

// Build tag injected by vite.config.ts (define: __BUILD_TAG__)
// Visible in the header so the user can confirm they're on the latest deploy.
declare const __BUILD_TAG__: string;
const BUILD_TAG: string =
  typeof __BUILD_TAG__ !== 'undefined' ? __BUILD_TAG__ : 'dev';

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
    // Also clear the Directions polyline cache so any stale/empty
    // results get refetched with the latest API key state.
    localStorage.removeItem('sanpo-directions-cache-v1');
    localStorage.removeItem('sanpo-directions-cache-v2');
    // Clear stale Google Fit auth state. Fixes the deadlock where an
    // old client_id's "ever-consented" flag makes the app think it's
    // connected, but no token exists for the new client, so auto-sync
    // silently fails forever.
    localStorage.removeItem('sanpo-google-fit-token');
    localStorage.removeItem('sanpo-google-fit-ever-consented');
    localStorage.removeItem('sanpo-fit-user-key');
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
      <span className="header-build">v{BUILD_TAG}</span>
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
