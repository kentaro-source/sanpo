import { useState, useEffect, useRef } from 'react';
import { useGame } from '../../hooks/useGame';
import { useGoogleFitConnection } from '../../hooks/useGoogleFitConnection';
import { fetchStepsBetween } from '../../services/googleFit';

function startOfTodayMs(): number {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

const AUTO_SYNC_MIN_INTERVAL_MS = 25_000;

// We only show the "再連携" prompt after this many consecutive silent
// failures, to avoid flashing it for transient network blips.
const REAUTH_PROMPT_THRESHOLD = 3;

export function GoogleFitButton() {
  const { player, syncFromGoogleFit } = useGame();
  const { connected, signIn, reAuth, signOut } = useGoogleFitConnection();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastResult, setLastResult] = useState<string | null>(null);
  const autoSyncedRef = useRef(false);
  const lastSyncTimestampRef = useRef(player.lastSyncTimestamp);
  const consecutiveAuthFailuresRef = useRef(0);

  useEffect(() => {
    lastSyncTimestampRef.current = player.lastSyncTimestamp;
  }, [player.lastSyncTimestamp]);

  const doSync = async (auto = false) => {
    setBusy(true);
    setError(null);
    setLastResult(null);
    try {
      const now = Date.now();
      // Always fetch the absolute total for today. The reducer computes
      // an idempotent delta against its baseline, which is robust against
      // Fit data that arrives late (after our previous sync window).
      const startMs = startOfTodayMs();
      const todayTotal = await fetchStepsBetween(startMs, now);
      const previousTotal = player.todayStepsBaseline ?? 0;
      const sameDay = player.todayBaselineDayStart === startMs;
      const delta = sameDay ? Math.max(0, todayTotal - previousTotal) : todayTotal;
      syncFromGoogleFit(todayTotal, now);
      // Reset failure counter on a successful sync.
      consecutiveAuthFailuresRef.current = 0;
      if (delta > 0) {
        setLastResult(`+${delta.toLocaleString()} 歩 同期`);
      } else if (!auto) {
        setLastResult('新しい歩数はありませんでした');
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : '同期に失敗しました';
      const isAuth =
        msg.includes('Authentication') || msg.includes('Not signed in');
      if (isAuth) {
        consecutiveAuthFailuresRef.current += 1;
        // Only show the re-auth prompt after several consecutive silent
        // failures — don't flash it for transient session hiccups that
        // might recover on the next polling tick.
        if (consecutiveAuthFailuresRef.current >= REAUTH_PROMPT_THRESHOLD) {
          setError('再連携');
        }
      } else if (!auto) {
        setError(msg);
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

    // Periodic polling while app is in foreground - keeps step counter
    // feeling "live" instead of only updating when the user re-focuses.
    const interval = setInterval(() => {
      if (document.visibilityState !== 'visible') return;
      const last = lastSyncTimestampRef.current;
      if (last && Date.now() - last < AUTO_SYNC_MIN_INTERVAL_MS) return;
      doSync(true);
    }, 30_000); // every 30s — keeps step counter live without hammering the API

    return () => {
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('focus', onVisible);
      clearInterval(interval);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [connected]);

  const handleConnect = async () => {
    setBusy(true);
    setError(null);
    try {
      await signIn();
      autoSyncedRef.current = false;
      consecutiveAuthFailuresRef.current = 0;
    } catch (e) {
      setError(e instanceof Error ? e.message : 'サインインに失敗しました');
    } finally {
      setBusy(false);
    }
  };

  /** One-tap re-auth (no consent screen). */
  const handleReAuth = async () => {
    setBusy(true);
    setError(null);
    try {
      await reAuth();
      autoSyncedRef.current = false;
      consecutiveAuthFailuresRef.current = 0;
      // Trigger a sync immediately so the user sees fresh data.
      doSync(true);
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
    // Re-auth chip: small, inline, only shown after multiple silent failures.
    // No giant banner — the user keeps seeing their last good step count
    // in the diagnostic line, and can re-auth with one tap when ready.
    if (error) {
      const needsReauth = error === '再連携';
      return (
        <div className="gfit-section gfit-section-connected">
          {needsReauth ? (
            <button
              className="gfit-reauth-chip"
              onClick={handleReAuth}
              disabled={busy}
              title="Google Fit のトークン期限切れ。タップで再連携"
            >
              ⚠ Fit 再連携
            </button>
          ) : (
            <div className="gfit-error-mini">
              {error}{' '}
              <button className="gfit-disconnect" onClick={handleDisconnect}>
                解除
              </button>
            </div>
          )}
        </div>
      );
    }
    if (lastResult) {
      return (
        <div className="gfit-section gfit-section-connected">
          <div className="gfit-result-mini">{lastResult}</div>
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
