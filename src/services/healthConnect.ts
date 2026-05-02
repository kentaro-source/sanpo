import { Health } from '@capgo/capacitor-health';
import { isAndroidNative } from './platform';

/**
 * Health Connect adapter for the Android (Capacitor) build.
 *
 * Why this exists: the in-browser DeviceMotion pedometer only counts
 * steps when the app tab is in the foreground. When the user puts the
 * phone in their pocket and walks, the page is hidden and the marker
 * doesn't advance. Health Connect — Android's OS-level step store —
 * keeps recording in the background, and we read its today-total on
 * a polling loop to keep the game in sync.
 *
 * The contribution-vs-baseline math (preventing double-count between
 * pedometer steps already credited and HC's absolute total) is handled
 * by the existing SYNC_FROM_GOOGLE_FIT reducer; we just have to feed it
 * the absolute today-total from HC.
 */

let authChecked = false;
let authGranted = false;

export async function isHealthConnectAvailable(): Promise<boolean> {
  if (!isAndroidNative()) return false;
  try {
    const r = await Health.isAvailable();
    return !!r.available;
  } catch {
    return false;
  }
}

export async function requestStepsAuthorization(): Promise<boolean> {
  if (!isAndroidNative()) return false;
  try {
    const status = await Health.requestAuthorization({ read: ['steps'] });
    authChecked = true;
    authGranted = status.readAuthorized.includes('steps');
    return authGranted;
  } catch {
    authChecked = true;
    authGranted = false;
    return false;
  }
}

export async function ensureAuthorized(): Promise<boolean> {
  if (authChecked) return authGranted;
  // checkAuthorization is silent (no prompt). If steps already authorized,
  // skip the popup; otherwise fall through to request().
  try {
    const status = await Health.checkAuthorization({ read: ['steps'] });
    if (status.readAuthorized.includes('steps')) {
      authChecked = true;
      authGranted = true;
      return true;
    }
  } catch {
    // fall through to request
  }
  return requestStepsAuthorization();
}

/**
 * Returns the absolute number of steps recorded by Health Connect from
 * the start of today (local time) up to now. The reducer's
 * SYNC_FROM_GOOGLE_FIT path treats this as an idempotent absolute and
 * computes the delta against attributedTodaySteps internally, so it's
 * safe to call this on every poll.
 */
export async function getTodayStepTotal(): Promise<number | null> {
  if (!isAndroidNative()) return null;
  if (!(await ensureAuthorized())) return null;
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  const end = new Date();
  try {
    const r = await Health.queryAggregated({
      dataType: 'steps',
      startDate: start.toISOString(),
      endDate: end.toISOString(),
      bucket: 'day',
      aggregation: 'sum',
    });
    let total = 0;
    for (const s of r.samples) {
      if (Number.isFinite(s.value)) total += s.value;
    }
    return Math.floor(total);
  } catch {
    return null;
  }
}

export function openHealthConnectSettings(): Promise<void> {
  if (!isAndroidNative()) return Promise.resolve();
  return Health.openHealthConnectSettings().catch(() => {});
}
