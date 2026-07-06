import { useEffect, useRef } from 'react';
import { LocalNotifications } from '@capacitor/local-notifications';
import { useGame } from './useGame';
import { isAndroidNative } from '../services/platform';
import type { BonusEvent } from '../types';

const PERMISSION_KEY = 'sanpo-notif-permission-requested';

/** Format a BonusEvent into a natural Japanese notification. Skips
 *  IRL-bonus duplicates and milestones (only the main crossing event
 *  notifies). */
function notifyTextFor(b: BonusEvent): { title: string; body: string } | null {
  // Only natural step-crediting events fire OS notifications. Any
  // in-app interaction (border draw, Sic Bo, login bonus, ...) is
  // already on the user's screen and notifying would just be noise.
  if (b.source !== 'walk') return null;
  // Capital pass: "🏛 X(Y) 通過 +5" or "🏛 X 通過 +5"
  let m = b.label.match(/^🏛\s+(.+?)(?:[（(](.+?)[）)])?\s+通過\s+\+(\d+)$/);
  if (m) {
    const where = m[2] ? `${m[1]}(${m[2]})` : m[1];
    return {
      title: `🏛 ${where} を通過しました`,
      body: `+${m[3]} チップ`,
    };
  }
  // City pass: "📍 X 立ち寄り +3"
  m = b.label.match(/^📍\s+(.+?)\s+立ち寄り\s+\+(\d+)$/);
  if (m) {
    return {
      title: `📍 ${m[1]} に立ち寄りました`,
      body: `+${m[2]} チップ`,
    };
  }
  // IRL memory bonus: "★ 懐かしのX 思い出ボーナス +5"
  m = b.label.match(/^★\s*懐かしの(.+?)\s+思い出ボーナス\s+\+(\d+)$/);
  if (m) {
    return {
      title: `★ 懐かしの ${m[1]} を再訪`,
      body: `思い出ボーナス +${m[2]} チップ`,
    };
  }
  // Milestone (歩数達成) — not a destination, skip.
  if (b.kind === 'milestone') return null;
  // Fallback for unrecognised labels.
  return { title: b.label, body: '' };
}

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
  const lastBorderIdRef = useRef<string | null>(null);
  const borderInitRef = useRef(false);

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
    const items = fresh
      .map((b) => ({ b, text: notifyTextFor(b) }))
      .filter((x): x is { b: BonusEvent; text: { title: string; body: string } } => x.text !== null);
    if (items.length === 0) return;
    void (async () => {
      try {
        const now = Date.now();
        await LocalNotifications.schedule({
          notifications: items.map(({ text }, i) => ({
            id: ((now + i) >>> 0) % 0x7fffffff,
            title: text.title,
            body: text.body,
            schedule: { at: new Date(now + 100) },
            smallIcon: 'ic_stat_icon',
          })),
        });
      } catch {
        // Plugin unavailable or permission denied — silent failure.
      }
    })();
  }, [player.recentBonuses]);

  // Border arrival is the single most important moment to surface
  // when the app is backgrounded: the player has walked into a
  // border and the world freezes until they open the app and roll.
  // Fire a dedicated notification the first time pendingBorder.id
  // becomes a new value. Skip the very first mount so a launch with
  // an existing pendingBorder doesn't spam.
  useEffect(() => {
    if (!isAndroidNative()) return;
    const pid = player.pendingBorder?.id ?? null;
    if (!borderInitRef.current) {
      borderInitRef.current = true;
      lastBorderIdRef.current = pid;
      return;
    }
    if (pid === lastBorderIdRef.current) return;
    lastBorderIdRef.current = pid;
    if (!pid) return; // cleared (rolled or cancelled) — no notification
    const country = player.pendingBorder?.country ?? '';
    void (async () => {
      try {
        const now = Date.now();
        await LocalNotifications.schedule({
          notifications: [
            {
              id: (now >>> 0) % 0x7fffffff,
              title: '🛂 国境に到達しました',
              body: country
                ? `${country} の入国審査が必要です — アプリを開いてプレイ`
                : '入国審査が必要です — アプリを開いてプレイ',
              schedule: { at: new Date(now + 100) },
              smallIcon: 'ic_stat_icon',
            },
          ],
        });
      } catch {
        // Plugin unavailable or permission denied — silent failure.
      }
    })();
  }, [player.pendingBorder]);
}
