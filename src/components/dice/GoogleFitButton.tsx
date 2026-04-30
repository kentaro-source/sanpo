import { useState, useEffect, useRef } from 'react';
import { useGame } from '../../hooks/useGame';
import { useGoogleFitConnection } from '../../hooks/useGoogleFitConnection';
import { silentSignIn, fetchStepsBetween } from '../../services/googleFit';

function startOfTodayMs(): number {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

const AUTO_SYNC_MIN_INTERVAL_MS = 60_000;

export function GoogleFitButton() {
  const { player, syncFromGoogleFit } = useGame();
  const { connected, signIn, signOut, setConnected } = useGoogleFitConnection();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastResult, setLastResult] = useState<string | null>(null);
  const autoSyncedRef = useRef(false);
  const lastSyncTimestampRef = useRef(player.lastSyncTimestamp);

  useEffect(() => {
    lastSyncTimestampRef.current = player.lastSyncTimestamp;
  }, [player.lastSyncTimestamp]);

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
      let steps: number;
      try {
        steps = await fetchStepsBetween(startMs, now);
      } catch (e) {
        const m = e instanceof Error ? e.message : '';
        if (m.includes('Authentication') || m.includes('Not signed in')) {
          const fresh = await silentSignIn();
          if (!fresh) throw e;
          steps = await fetchStepsBetween(startMs, now);
        } else {
          throw e;
        }
      }
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

  useEffect(() => {
    if (!connected || autoSyncedRef.current) return;
    autoSyncedRef.current = true;

    const last = lastSyncTimestampRef.current;
    if (last && Date.now() - last < AUTO_SYNC_MIN_INTERVAL_MS) {
      return;
    }
    doSync(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [connected]);

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
      autoSyncedRef.current = false;
    } catch (e) {
      setError(e instanceof Error ? e.message : 'サインインに失敗しました');
    } finally {
      setBusy(false);
    }
  };

  const handleDisconnect = () => {
    signOut();
    setLastResult(null);
    setError(null);
  };

  if (connected) {
    if (lastResult && !error) {
      return (
        <div className="gfit-section gfit-section-connected">
          <div className="gfit-result-mini">{lastResult}</div>
        </div>
      );
    }
    if (error) {
      return (
        <div className="gfit-section gfit-section-connected">
          <div className="gfit-error">
            {error}{' '}
            <button className="gfit-disconnect" onClick={handleDisconnect}>
              解除
            </button>
          </div>
        </div>
      );
    }
    return null;
  }

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
