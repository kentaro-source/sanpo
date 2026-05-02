import { useEffect, useRef, useState } from 'react';
import { pedometer, type PedometerStatus } from '../services/pedometer';
import { useGame } from './useGame';

const ENABLED_KEY = 'sanpo-pedometer-enabled';

function loadEnabled(): boolean {
  try {
    const raw = localStorage.getItem(ENABLED_KEY);
    if (raw == null) return true; // default ON when unset
    return raw === '1';
  } catch {
    return true;
  }
}

function saveEnabled(v: boolean): void {
  try {
    localStorage.setItem(ENABLED_KEY, v ? '1' : '0');
  } catch {
    // ignore
  }
}

/**
 * Drive the in-browser pedometer and feed every detected step into the
 * game state via addSteps(). With the v7 1m/step model + Fit Cloud's
 * multi-minute lag, this is what makes the marker appear to move in
 * sync with actual walking when the app is in the foreground.
 *
 * The Fit sync (in GoogleFitButton) keeps running for periods when the
 * app is closed/backgrounded; the reducer's attributedTodaySteps field
 * prevents either source from double-counting the other.
 */
export function usePedometer() {
  const { addSteps } = useGame();
  const [enabled, setEnabledState] = useState<boolean>(loadEnabled);
  const [status, setStatus] = useState<PedometerStatus>(pedometer.getStatus());
  // Keep the latest addSteps callback in a ref so we don't have to
  // restart the pedometer when it changes (it will, on every render).
  const addStepsRef = useRef(addSteps);
  useEffect(() => {
    addStepsRef.current = addSteps;
  }, [addSteps]);

  useEffect(() => {
    if (!enabled) {
      pedometer.stop();
      setStatus('inactive');
      return;
    }
    let cancelled = false;
    void (async () => {
      const s = await pedometer.start((steps) => {
        addStepsRef.current(steps);
      });
      if (!cancelled) setStatus(s);
    })();
    return () => {
      cancelled = true;
      pedometer.stop();
    };
  }, [enabled]);

  const setEnabled = (v: boolean) => {
    saveEnabled(v);
    setEnabledState(v);
  };

  return {
    enabled,
    status,
    needsPermission: pedometer.needsPermission(),
    isSupported: pedometer.isSupported(),
    setEnabled,
  };
}
