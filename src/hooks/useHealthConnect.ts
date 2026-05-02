import { useEffect, useRef, useState } from 'react';
import { useGame } from './useGame';
import { isAndroidNative } from '../services/platform';
import {
  ensureAuthorized,
  getTodayStepTotal,
} from '../services/healthConnect';

const POLL_INTERVAL_MS = 30_000;

export type HealthConnectStatus =
  | 'inactive' // not on native android
  | 'unavailable' // HC plugin reports not available
  | 'permission-needed' // not granted yet
  | 'permission-denied' // user said no
  | 'active'; // polling for today total

/**
 * Drives Health Connect polling on the Android (Capacitor) build. Each
 * poll reads today's absolute step total and dispatches it through
 * SYNC_FROM_GOOGLE_FIT, which the reducer already treats as an
 * idempotent absolute (delta'd against attributedTodaySteps). On the
 * web build this hook is a no-op — the DeviceMotion pedometer remains
 * the only step source.
 */
export function useHealthConnect() {
  const { syncFromGoogleFit } = useGame();
  const [status, setStatus] = useState<HealthConnectStatus>('inactive');
  const syncRef = useRef(syncFromGoogleFit);
  useEffect(() => {
    syncRef.current = syncFromGoogleFit;
  }, [syncFromGoogleFit]);

  useEffect(() => {
    if (!isAndroidNative()) {
      setStatus('inactive');
      return;
    }
    let cancelled = false;
    let timer: ReturnType<typeof setInterval> | null = null;

    const tick = async () => {
      const total = await getTodayStepTotal();
      if (cancelled || total == null) return;
      syncRef.current(total, Date.now());
    };

    void (async () => {
      const granted = await ensureAuthorized();
      if (cancelled) return;
      if (!granted) {
        setStatus('permission-denied');
        return;
      }
      setStatus('active');
      // Initial read, then poll on a timer + on visibility/resume.
      void tick();
      timer = setInterval(tick, POLL_INTERVAL_MS);
    })();

    const onVisible = () => {
      if (document.visibilityState === 'visible') void tick();
    };
    document.addEventListener('visibilitychange', onVisible);

    return () => {
      cancelled = true;
      if (timer) clearInterval(timer);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, []);

  return { status };
}
