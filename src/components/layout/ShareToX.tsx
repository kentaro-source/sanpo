import { useMemo, useState } from 'react';
import { useGame } from '../../hooks/useGame';

interface Props {
  onClose: () => void;
}

function formatKm(km: number): string {
  if (km >= 100) return `${Math.round(km).toLocaleString()}km`;
  if (km >= 10) return `${km.toFixed(1)}km`;
  return `${km.toFixed(2)}km`;
}

const HASHTAG = '#せかいさんぽ';

export function ShareToX({ onClose }: Props) {
  const { currentSegment, nextCapital, visitedCount, totalCapitals, player, routeData } =
    useGame();
  const [comment, setComment] = useState('');

  const stats = useMemo(() => {
    const todayKm = player.todayKm ?? 0;
    // 出発地 = the capital this segment leaves from (the one we just came past).
    const fromCap = routeData.capitals.find((c) => c.id === currentSegment.fromCapitalId);

    const lines: string[] = [];
    if (fromCap && nextCapital) {
      lines.push(`🚶 ${fromCap.nameJa} → ${nextCapital.nameJa}`);
    } else if (nextCapital) {
      lines.push(`🚶 → ${nextCapital.nameJa}`);
    }
    if (todayKm > 0) {
      lines.push(`📏 今日 +${formatKm(todayKm)}`);
    }
    const wins = player.todaySicBoWins ?? 0;
    const losses = player.todaySicBoLosses ?? 0;
    if (wins + losses > 0) {
      lines.push(`🎲 ${wins}勝${losses}負`);
    }
    // visitedCount is how many capitals already cleared. The "current"
    // country in progress is visitedCount + 1.
    lines.push(`🏛 ${Math.min(visitedCount + 1, totalCapitals)}/${totalCapitals} カ国目`);
    return lines.join('\n');
  }, [
    currentSegment.fromCapitalId,
    nextCapital,
    visitedCount,
    totalCapitals,
    player.todayKm,
    player.todaySicBoWins,
    player.todaySicBoLosses,
    routeData.capitals,
  ]);

  const finalText = useMemo(() => {
    const parts: string[] = [];
    if (comment.trim()) parts.push(comment.trim());
    parts.push(stats);
    parts.push(HASHTAG);
    return parts.join('\n\n');
  }, [comment, stats]);

  const handlePost = () => {
    const url = `https://x.com/intent/tweet?text=${encodeURIComponent(finalText)}`;
    window.open(url, '_blank', 'noopener,noreferrer');
    onClose();
  };

  return (
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
          <label className="share-label">コメント (任意)</label>
          <textarea
            className="share-comment"
            placeholder="今日の散歩の感想とか…"
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            rows={3}
            maxLength={140}
            autoFocus
          />
          <div className="share-charcount">{comment.length} / 140</div>

          <label className="share-label">プレビュー</label>
          <div className="share-preview">{finalText}</div>

          <button
            type="button"
            className="share-post-btn"
            onClick={handlePost}
          >
            𝕏 で投稿画面を開く
          </button>
        </div>
      </div>
    </div>
  );
}
