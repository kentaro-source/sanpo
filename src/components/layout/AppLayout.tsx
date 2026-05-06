import { useEffect, useState, type ReactNode } from 'react';
import { Header } from './Header';
import { BorderModal } from './BorderModal';
import { useGame } from '../../hooks/useGame';

interface Props {
  map: ReactNode;
  panel: ReactNode;
}

export function AppLayout({ map, panel }: Props) {
  const { player } = useGame();
  const hasBorder = !!player.pendingBorder;
  const [borderOpen, setBorderOpen] = useState(false);

  // Auto-open the modal whenever a fresh border is armed (transition
  // from no-border to border). User can close it; the indicator stays.
  useEffect(() => {
    if (hasBorder) setBorderOpen(true);
    else setBorderOpen(false);
  }, [hasBorder]);

  return (
    <div className="app-layout">
      <Header />
      <div className="map-container">{map}</div>
      <div className="bottom-panel">{panel}</div>
      {hasBorder && !borderOpen && (
        <button
          type="button"
          className="border-banner"
          onClick={() => setBorderOpen(true)}
        >
          🛂 国境で足止め中 — タップで入国審査
        </button>
      )}
      {borderOpen && hasBorder && (
        <BorderModal onClose={() => setBorderOpen(false)} />
      )}
    </div>
  );
}
