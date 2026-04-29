import { useState, useEffect, useRef } from 'react';
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

const AUTO_SYNC_MIN_INTERVAL_MS = 60_000; // skip auto-sync if last sync < 60s ago

export function GoogleFitButton() {
  const { player, syncFromGoogleFit } = useGame();
  const [connected, setConnected] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastResult, setLastResult] = useState<string | null>(null);
  const autoSyncedRef = useRef(false);
  const lastSyncTimestampRef = useRef(player.lastSyncTimestamp);

  // Keep ref fresh so the auto-sync effect uses the latest sync time
  useEffect(() => {
    lastSyncTimestampRef.current = player.lastSyncTimestamp;
  }, [player.lastSyncTimestamp]);

  useEffect(() => {
    setConnected(isSignedIn());
  }, []);

  const doSync = async (auto = false) => {
    setBusy(true);
    setError(null);
    setLastResult(null);
    try {
      const now = Date.now();
      const startMs = lastSyncTimestampRef.current ?? startOfTodayMs();
      if (startMs >= now) {
        if (!auto) setLastResult('同期する歩数がありません');
        return;
      }
      const steps = await fetchStepsBetween(startMs, now);
      syncFromGoogleFit(steps, now);
      if (steps > 0) {
        setLastResult(`+${steps.toLocaleString()} 歩 同期`);
      } else if (!auto) {
        setLastResult('新しい歩数はありませんでした');
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : '同期に失敗しました';
      setError(msg);
      if (msg.includes('Authentication') || msg.includes('Not signed in')) {
        setConnected(false);
      }
    } finally {
      setBusy(false);
    }
  };

  // Auto-sync on app load if connected
  useEffect(() => {
    if (!connected || autoSyncedRef.current) return;
    autoSyncedRef.current = true;

    const last = lastSyncTimestampRef.current;
    if (last && Date.now() - last < AUTO_SYNC_MIN_INTERVAL_MS) {
      return; // synced very recently
    }
    doSync(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [connected]);

  // Re-sync when window regains focus (after walking around with phone)
  useEffect(() => {
    if (!connected) return;

    const onVisible = () => {
      if (document.visibilityState !== 'visible') return;
      const last = lastSyncTimestampRef.current;
      if (last && Date.now() - last < AUTO_SYNC_MIN_INTERVAL_MS) return;
      doSync(true);
    };

    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener('focus', onVisible);
    return () => {
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('focus', onVisible);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [connected]);

  const handleConnect = async () => {
    setBusy(true);
    setError(null);
    try {
      await signIn();
      setConnected(true);
      // Trigger first sync immediately after consent
      autoSyncedRef.current = false;
    } catch (e) {
      setError(e instanceof Error ? e.message : 'サインインに失敗しました');
    } finally {
      setBusy(false);
    }
  };

  const handleManualSync = () => {
    if (busy) return;
    doSync(false);
  };

  const handleDisconnect = () => {
    signOut();
    setConnected(false);
    setLastResult(null);
    setError(null);
  };

  // Connected state: minimal status row only.
  if (connected) {
    return (
      <div className="gfit-section gfit-section-connected">
        <div className="gfit-status-mini">
          {busy ? (
            <span>🔄 Google Fit 同期中...</span>
          ) : (
            <span>
              ✅ Google Fit 連携中
              {player.lastSyncTimestamp && (
                <> （最終 {formatTime(player.lastSyncTimestamp)}）</>
              )}
            </span>
          )}
          <button
            className="gfit-mini-btn"
            onClick={handleManualSync}
            disabled={busy}
            title="今すぐ同期"
          >
            🔄
          </button>
          <button
            className="gfit-disconnect"
            onClick={handleDisconnect}
            title="連携解除"
          >
            解除
          </button>
        </div>
        {error && <div className="gfit-error">{error}</div>}
        {lastResult && !error && <div className="gfit-result">{lastResult}</div>}
      </div>
    );
  }

  // Not connected: prominent connect button
  return (
    <div className="gfit-section">
      <button
        className="gfit-button gfit-connect"
        onClick={handleConnect}
        disabled={busy}
      >
        {busy ? '接続中...' : '🔗 Google Fit と連携（以降は自動同期）'}
      </button>
      {error && <div className="gfit-error">{error}</div>}
    </div>
  );
}
