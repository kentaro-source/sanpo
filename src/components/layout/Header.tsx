import { useGame } from '../../hooks/useGame';
import { HamburgerMenu } from './HamburgerMenu';

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
    // Don't touch the Directions cache — clearing it forced every ⟳
    // to refetch all visible polylines from Google Directions, which
    // showed as a 5-10 second 'route reset' (user complained:
    // '更新押すとルートリセットはしょうがない？'). Cache keys are
    // coord-based so entries become stale automatically when waypoint
    // cities are added/changed; no harm leaving them.
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
      <HamburgerMenu onForceReload={hardReload} />
      <h1 className="header-title">せかいさんぽ</h1>
      <span className="header-build">v{BUILD_TAG}</span>
      <div className="header-meta">{visitedCount}/{totalCapitals}</div>
      <div className="header-dice" title="所持チップ">
        <span className="chip-icon" aria-hidden="true" />
        <span className="dice-count">{player.availableDice}/{config.maxDice}</span>
      </div>
    </header>
  );
}
