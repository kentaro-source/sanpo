import { useEffect, useRef } from 'react';
import { LocalNotifications } from '@capacitor/local-notifications';
import { useGame } from './useGame';
import { isAndroidNative } from '../services/platform';

const PERMISSION_KEY = 'sanpo-notif-permission-requested';

/**
 * Fires a system notification whenever the reducer emits a new bonus
 * event (capital pass-through, city pop-in, milestone, IRL memory).
 * Works while the app is in foreground OR backgrounded but not fully
 * killed — Android keeps the WebView alive for a while after the user
 * leaves the app, so the in-app HC poll keeps running and crossings
 * stay live. Fully swiping the app away stops JS; for that case a
 * native WorkManager is required (TODO).
 */
export function useCrossingNotifications(): void {
  const { player } = useGame();
  const seenIdsRef = useRef<Set<number>>(new Set());
  const initializedRef = useRef(false);

  // Request POST_NOTIFICATIONS permission once on first mount (Android 13+).
  useEffect(() => {
    if (!isAndroidNative()) return;
    let cancelled = false;
    void (async () => {
      try {
        const askedBefore =
          (() => {
            try {
              return localStorage.getItem(PERMISSION_KEY) === '1';
            } catch {
              return false;
            }
          })();
        const status = await LocalNotifications.checkPermissions();
        if (cancelled) return;
        if (status.display !== 'granted' && !askedBefore) {
          await LocalNotifications.requestPermissions();
          try {
            localStorage.setItem(PERMISSION_KEY, '1');
          } catch {
            // ignore
          }
        }
      } catch {
        // Plugin not available (web build); ignore.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // Watch recentBonuses and fire one notification per new event.
  useEffect(() => {
    if (!isAndroidNative()) return;
    const bonuses = player.recentBonuses ?? [];
    // First run: seed the seen-set with whatever was already in state.
    // We don't want to spam the user with backlog notifications.
    if (!initializedRef.current) {
      initializedRef.current = true;
      for (const b of bonuses) seenIdsRef.current.add(b.timestamp);
      return;
    }
    const fresh: typeof bonuses = [];
    for (const b of bonuses) {
      if (!seenIdsRef.current.has(b.timestamp)) {
        seenIdsRef.current.add(b.timestamp);
        fresh.push(b);
      }
    }
    if (fresh.length === 0) return;
    void (async () => {
      try {
        // Schedule all fresh events as a single batch.
        const now = Date.now();
        await LocalNotifications.schedule({
          notifications: fresh.map((b, i) => ({
            id: ((now + i) >>> 0) % 0x7fffffff,
            title: b.label,
            body: '世界一周の進捗が更新されました',
            schedule: { at: new Date(now + 100) },
            smallIcon: 'ic_stat_icon',
          })),
        });
      } catch {
        // Plugin unavailable or permission denied — silent failure.
      }
    })();
  }, [player.recentBonuses]);
}
