import { useEffect, useState, type ReactNode } from 'react';
import { Header } from './Header';
import { BorderModal } from './BorderModal';
import { useGame } from '../../hooks/useGame';
import { useCrossingNotifications } from '../../hooks/useCrossingNotifications';

interface Props {
  map: ReactNode;
  panel: ReactNode;
}

export function AppLayout({ map, panel }: Props) {
  const { player } = useGame();
  useCrossingNotifications();
  const hasBorder = !!player.pendingBorder;
  const [borderOpen, setBorderOpen] = useState(false);

  // Auto-open the modal whenever a fresh border is armed. We deliberately
  // do NOT auto-close when pendingBorder clears — a win clears it, but the
  // modal must stay up to play its flip animation + celebration. The modal
  // closes itself via onClose once the player dismisses the result.
  useEffect(() => {
    if (hasBorder) setBorderOpen(true);
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
      {borderOpen && (
        <BorderModal onClose={() => setBorderOpen(false)} />
      )}
    </div>
  );
}
