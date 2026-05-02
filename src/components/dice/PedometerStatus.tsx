import { usePedometer } from '../../hooks/usePedometer';

/**
 * Renders nothing visible — exists purely to drive the in-browser
 * pedometer hook from inside GameProvider so each detected step
 * dispatches addSteps() and the marker advances in real time. Putting
 * this in App.tsx (above GameProvider) wouldn't have access to useGame.
 *
 * If we ever need a permission-grant button or an on/off toggle, that
 * UI lives here. For now: silent, auto-on.
 */
export function PedometerStatus() {
  usePedometer();
  return null;
}
