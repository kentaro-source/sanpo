// In-browser pedometer using the DeviceMotion accelerometer.
//
// Why this exists: on modern Android the canonical step count lives in
// Health Connect, and Google Fit Cloud's mirror of that data lags from
// seconds to minutes. With KM_PER_STEP = 0.001 in the v7 model, Fit lag
// translates directly into "I'm walking but the marker isn't moving",
// which is exactly the experience the user complained about.
//
// The DeviceMotion API runs entirely in the foreground tab — no network,
// no privileged permissions on Android, just real-time accelerometer
// samples. Counting steps locally lets the marker advance the moment a
// step happens, and the Fit sync still runs in the background as the
// authoritative tally for periods when the app is closed/backgrounded.
//
// Algorithm: classic peak-detection on the magnitude of (gravity-adjusted)
// acceleration. A peak above STEP_THRESHOLD that's separated from the
// previous peak by at least STEP_COOLDOWN_MS counts as one step. This is
// noisy by serious-pedometer standards (it'll over-count for things like
// shaking the phone) but is good enough that walking with the app open
// produces visibly-correct step counts in the 10% accuracy band.

export type PedometerCallback = (steps: number) => void;

export type PedometerStatus =
  | 'inactive'
  | 'unsupported'
  | 'permission-needed'
  | 'permission-denied'
  | 'active';

interface DeviceMotionEventConstructorWithPermission {
  requestPermission?: () => Promise<'granted' | 'denied' | 'default'>;
}

// Tightened from the v8 initial values (11.5 / 280) after a user report
// of "+6732歩 三軒茶屋まで飛ばされた" — phantom steps from pocket bounce
// or commuter motion got conflated with Fit's first-sync delta. A higher
// threshold filters weaker non-walking peaks, and a longer cooldown caps
// the maximum effective rate to ~150 steps/min, which is faster than
// almost any human can sustain without running.
const STEP_THRESHOLD_M_S2 = 13;
const STEP_COOLDOWN_MS = 380;
const FLUSH_INTERVAL_MS = 1000; // forward buffered steps to consumer 1×/sec

class Pedometer {
  private listening = false;
  private cb: PedometerCallback | null = null;
  private lastStepAt = 0;
  private buffer = 0;
  private flushTimer: ReturnType<typeof setInterval> | null = null;
  private status: PedometerStatus = 'inactive';

  /** Probe whether DeviceMotion is even available in this browser. */
  isSupported(): boolean {
    return typeof window !== 'undefined' && 'DeviceMotionEvent' in window;
  }

  /** True if iOS-style explicit permission is required. */
  needsPermission(): boolean {
    if (!this.isSupported()) return false;
    const ctor = window.DeviceMotionEvent as unknown as
      | DeviceMotionEventConstructorWithPermission
      | undefined;
    return typeof ctor?.requestPermission === 'function';
  }

  getStatus(): PedometerStatus {
    return this.status;
  }

  async start(cb: PedometerCallback): Promise<PedometerStatus> {
    if (!this.isSupported()) {
      this.status = 'unsupported';
      return this.status;
    }
    if (this.listening) {
      this.cb = cb; // refresh callback if re-started
      return this.status;
    }
    if (this.needsPermission()) {
      const ctor = window.DeviceMotionEvent as unknown as
        DeviceMotionEventConstructorWithPermission;
      try {
        const result = await ctor.requestPermission!();
        if (result !== 'granted') {
          this.status = 'permission-denied';
          return this.status;
        }
      } catch {
        this.status = 'permission-denied';
        return this.status;
      }
    }
    this.cb = cb;
    window.addEventListener('devicemotion', this.handle);
    this.listening = true;
    this.flushTimer = setInterval(() => this.flush(), FLUSH_INTERVAL_MS);
    this.status = 'active';
    return this.status;
  }

  stop(): void {
    if (this.listening) {
      window.removeEventListener('devicemotion', this.handle);
      this.listening = false;
    }
    if (this.flushTimer) {
      clearInterval(this.flushTimer);
      this.flushTimer = null;
    }
    this.flush();
    this.cb = null;
    this.status = 'inactive';
  }

  private handle = (e: DeviceMotionEvent): void => {
    const a = e.accelerationIncludingGravity;
    if (!a) return;
    const x = a.x ?? 0;
    const y = a.y ?? 0;
    const z = a.z ?? 0;
    const mag = Math.sqrt(x * x + y * y + z * z);
    if (mag > STEP_THRESHOLD_M_S2) {
      const now = performance.now();
      if (now - this.lastStepAt > STEP_COOLDOWN_MS) {
        this.lastStepAt = now;
        this.buffer += 1;
      }
    }
  };

  private flush(): void {
    if (this.buffer > 0 && this.cb) {
      const n = this.buffer;
      this.buffer = 0;
      this.cb(n);
    }
  }
}

export const pedometer = new Pedometer();
