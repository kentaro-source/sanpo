import { useEffect, useRef, useState } from 'react';
import { useGame } from './useGame';
import { isAndroidNative } from '../services/platform';
import {
  ensureAuthorized,
  getTodayStepTotal,
} from '../services/healthConnect';

// Poll fast while the app is in the foreground (the user is watching the
// marker) and slow when hidden (battery). The foreground rate is the real
// lever for smooth motion: each poll advances distanceKm and the marker
// glides to it — at 30 s that's a glide then a long freeze ("まとめて移動");
// at a few seconds it reads as continuous walking.
const POLL_VISIBLE_MS = 4_000;
const POLL_HIDDEN_MS = 30_000;
/** Burst poll offsets (ms) after auth. Health Connect lags the OS step
 *  counter by a few seconds while the device flushes pending writes;
 *  these extra early polls catch the flush quickly so the in-app
 *  position doesn't sit stale for a full 30 s interval after open. */
const BURST_POLL_MS = [2_000, 5_000, 10_000, 20_000];

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
    let timer: ReturnType<typeof setTimeout> | null = null;

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
      // Initial read + a short burst so HC's incremental flush is
      // picked up faster than the 30 s interval would allow.
      void tick();
      for (const delay of BURST_POLL_MS) {
        window.setTimeout(() => {
          if (!cancelled) void tick();
        }, delay);
      }
      // Self-rescheduling poll: the interval is re-read each cycle from
      // the current visibility, so foreground/background transitions take
      // effect on the next tick (fast while watching, slow when hidden).
      const scheduleNext = () => {
        if (cancelled) return;
        const ms =
          document.visibilityState === 'visible'
            ? POLL_VISIBLE_MS
            : POLL_HIDDEN_MS;
        timer = setTimeout(async () => {
          await tick();
          scheduleNext();
        }, ms);
      };
      scheduleNext();
    })();

    const onVisible = () => {
      if (document.visibilityState === 'visible') void tick();
    };
    document.addEventListener('visibilitychange', onVisible);

    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, []);

  return { status };
}
