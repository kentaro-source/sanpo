import { usePedometer } from '../../hooks/usePedometer';
import { useHealthConnect } from '../../hooks/useHealthConnect';

/**
 * Renders nothing visible — drives the foreground in-browser pedometer
 * AND, on the native Android (Capacitor) build, the Health Connect
 * polling loop. Both feed into the reducer; the attributedTodaySteps
 * de-dup math prevents either source from double-counting the other.
 *
 * On the PWA build useHealthConnect is a no-op (no Capacitor native
 * platform), so only the pedometer runs.
 */
export function PedometerStatus() {
  usePedometer();
  useHealthConnect();
  return null;
}
