import { useEffect, useState } from 'react';
import { useGame } from '../../hooks/useGame';
import type { BonusEvent } from '../../types';

const TOAST_DURATION_MS = 5000;

/**
 * Floats the most recent bonus events as toasts. Each event is shown
 * for TOAST_DURATION_MS then disappears. Newer events stack on top.
 */
export function BonusToast() {
  const { player } = useGame();
  const recent = player.recentBonuses ?? [];
  const [visible, setVisible] = useState<BonusEvent[]>([]);

  useEffect(() => {
    if (recent.length === 0) return;
    // Find events newer than (now - TOAST_DURATION_MS) and show them.
    const cutoff = Date.now() - TOAST_DURATION_MS;
    const fresh = recent.filter((e) => e.timestamp >= cutoff);
    if (fresh.length === 0) return;

    setVisible((prev) => {
      // Merge by timestamp+label uniqueness.
      const seen = new Set(prev.map((e) => `${e.timestamp}-${e.label}`));
      const additions = fresh.filter(
        (e) => !seen.has(`${e.timestamp}-${e.label}`),
      );
      return [...additions, ...prev].slice(0, 4);
    });
  }, [recent]);

  // Auto-expire visible toasts.
  useEffect(() => {
    if (visible.length === 0) return;
    const timer = setInterval(() => {
      const cutoff = Date.now() - TOAST_DURATION_MS;
      setVisible((prev) => prev.filter((e) => e.timestamp >= cutoff));
    }, 500);
    return () => clearInterval(timer);
  }, [visible.length]);

  if (visible.length === 0) return null;

  return (
    <div className="bonus-toast-container">
      {visible.map((e) => (
        <div
          key={`${e.timestamp}-${e.label}`}
          className={`bonus-toast bonus-toast-${e.kind}`}
        >
          <span className="bonus-toast-label">{e.label}</span>
          <span className="bonus-toast-amount">+{e.amount}🎲</span>
        </div>
      ))}
    </div>
  );
}
