import { useState, useEffect } from 'react';
import { useGame } from '../../hooks/useGame';
import { signIn, signOut, fetchStepsBetween, isSignedIn } from '../../services/googleFit';

function startOfTodayMs(): number {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

function formatTime(ms: number): string {
  const d = new Date(ms);
  return d.toLocaleString('ja-JP', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function GoogleFitButton() {
  const { player, syncFromGoogleFit } = useGame();
  const [connected, setConnected] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastResult, setLastResult] = useState<string | null>(null);

  useEffect(() => {
    setConnected(isSignedIn());
  }, []);

  const handleConnect = async () => {
    setBusy(true);
    setError(null);
    try {
      await signIn();
      setConnected(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'サインインに失敗しました');
    } finally {
      setBusy(false);
    }
  };

  const handleSync = async () => {
    setBusy(true);
    setError(null);
    setLastResult(null);
    try {
      const now = Date.now();
      // First sync: pull from start of today; otherwise from last sync.
      const startMs = player.lastSyncTimestamp ?? startOfTodayMs();
      if (startMs >= now) {
        setLastResult('同期する歩数がありません');
        return;
      }
      const steps = await fetchStepsBetween(startMs, now);
      syncFromGoogleFit(steps, now);
      setLastResult(`+${steps.toLocaleString()} 歩 同期しました`);
    } catch (e) {
      const msg = e instanceof Error ? e.message : '同期に失敗しました';
      setError(msg);
      // If auth expired, drop connected state
      if (msg.includes('Authentication') || msg.includes('Not signed in')) {
        setConnected(false);
      }
    } finally {
      setBusy(false);
    }
  };

  const handleDisconnect = () => {
    signOut();
    setConnected(false);
    setLastResult(null);
    setError(null);
  };

  return (
    <div className="gfit-section">
      {!connected ? (
        <button
          className="gfit-button gfit-connect"
          onClick={handleConnect}
          disabled={busy}
        >
          {busy ? '接続中...' : '🔗 Google Fit と連携'}
        </button>
      ) : (
        <div className="gfit-connected">
          <button
            className="gfit-button gfit-sync"
            onClick={handleSync}
            disabled={busy}
          >
            {busy ? '同期中...' : '🔄 歩数を同期'}
          </button>
          <div className="gfit-status">
            {player.lastSyncTimestamp ? (
              <span>最終同期: {formatTime(player.lastSyncTimestamp)}</span>
            ) : (
              <span>未同期（今日0時から取得します）</span>
            )}
            <button className="gfit-disconnect" onClick={handleDisconnect}>
              連携解除
            </button>
          </div>
        </div>
      )}
      {error && <div className="gfit-error">{error}</div>}
      {lastResult && !error && <div className="gfit-result">{lastResult}</div>}
    </div>
  );
}
