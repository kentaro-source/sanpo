// Lightweight sound effects using Web Audio API (no audio assets required).
// All sounds are synthesized at runtime.

let ctx: AudioContext | null = null;
let muted = false;
const MUTE_KEY = 'sanpo-sound-muted';

try {
  muted = localStorage.getItem(MUTE_KEY) === '1';
} catch {
  // ignore
}

function getCtx(): AudioContext | null {
  if (muted) return null;
  if (ctx) return ctx;
  try {
    const Ctx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    ctx = new Ctx();
    return ctx;
  } catch {
    return null;
  }
}

export function isMuted(): boolean {
  return muted;
}

export function setMuted(value: boolean): void {
  muted = value;
  try {
    localStorage.setItem(MUTE_KEY, value ? '1' : '0');
  } catch {
    // ignore
  }
}

/** Make sure audio context is unsuspended after user interaction. */
export async function unlockAudio(): Promise<void> {
  const c = getCtx();
  if (!c) return;
  if (c.state === 'suspended') {
    try {
      await c.resume();
    } catch {
      // ignore
    }
  }
}

// Brief noise burst with short envelope - sounds like a single dice clack.
function clack(when: number, durationMs = 60, gain = 0.18): void {
  const c = getCtx();
  if (!c) return;
  const sr = c.sampleRate;
  const len = Math.floor((durationMs / 1000) * sr);
  const buf = c.createBuffer(1, len, sr);
  const data = buf.getChannelData(0);
  for (let i = 0; i < len; i++) {
    // Brown-ish noise (bass-weighted)
    data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 2.5);
  }
  const src = c.createBufferSource();
  src.buffer = buf;
  // Bandpass for that wood/clack tone
  const bp = c.createBiquadFilter();
  bp.type = 'bandpass';
  bp.frequency.value = 800 + Math.random() * 600;
  bp.Q.value = 4;
  const g = c.createGain();
  g.gain.value = gain;
  src.connect(bp);
  bp.connect(g);
  g.connect(c.destination);
  src.start(when);
  src.stop(when + durationMs / 1000);
}

/** Continuous "shake" rumble for ~durationMs. */
export function playDiceRoll(durationMs = 1200): void {
  const c = getCtx();
  if (!c) return;
  unlockAudio();
  const start = c.currentTime;
  // Schedule rapid clacks throughout the shake
  const clackCount = Math.floor(durationMs / 60);
  for (let i = 0; i < clackCount; i++) {
    const t = start + (i / clackCount) * (durationMs / 1000);
    clack(t, 35 + Math.random() * 30, 0.08 + Math.random() * 0.06);
  }
  // Final settling clacks (3 dice landing)
  for (let i = 0; i < 3; i++) {
    clack(start + durationMs / 1000 + i * 0.06, 70, 0.22);
  }
}

/** Win chime - ascending tones */
export function playWin(): void {
  const c = getCtx();
  if (!c) return;
  unlockAudio();
  const now = c.currentTime;
  const notes = [523.25, 659.25, 783.99, 1046.5]; // C5 E5 G5 C6
  notes.forEach((freq, i) => {
    const osc = c.createOscillator();
    const g = c.createGain();
    osc.type = 'triangle';
    osc.frequency.value = freq;
    g.gain.setValueAtTime(0, now + i * 0.1);
    g.gain.linearRampToValueAtTime(0.18, now + i * 0.1 + 0.02);
    g.gain.exponentialRampToValueAtTime(0.001, now + i * 0.1 + 0.35);
    osc.connect(g);
    g.connect(c.destination);
    osc.start(now + i * 0.1);
    osc.stop(now + i * 0.1 + 0.4);
  });
}

/** Big win - jackpot fanfare */
export function playJackpot(): void {
  const c = getCtx();
  if (!c) return;
  unlockAudio();
  const now = c.currentTime;
  // Cascading sparkle
  for (let i = 0; i < 8; i++) {
    const osc = c.createOscillator();
    const g = c.createGain();
    osc.type = 'sine';
    osc.frequency.value = 800 + i * 200;
    g.gain.setValueAtTime(0, now + i * 0.05);
    g.gain.linearRampToValueAtTime(0.12, now + i * 0.05 + 0.01);
    g.gain.exponentialRampToValueAtTime(0.001, now + i * 0.05 + 0.4);
    osc.connect(g);
    g.connect(c.destination);
    osc.start(now + i * 0.05);
    osc.stop(now + i * 0.05 + 0.45);
  }
}

/** Lose - low descending */
export function playLose(): void {
  const c = getCtx();
  if (!c) return;
  unlockAudio();
  const now = c.currentTime;
  const osc = c.createOscillator();
  const g = c.createGain();
  osc.type = 'sawtooth';
  osc.frequency.setValueAtTime(220, now);
  osc.frequency.exponentialRampToValueAtTime(80, now + 0.5);
  g.gain.setValueAtTime(0.001, now);
  g.gain.linearRampToValueAtTime(0.15, now + 0.05);
  g.gain.exponentialRampToValueAtTime(0.001, now + 0.5);
  osc.connect(g);
  g.connect(c.destination);
  osc.start(now);
  osc.stop(now + 0.5);
}

/** Token gain - quick coin chime */
export function playTokenGain(): void {
  const c = getCtx();
  if (!c) return;
  unlockAudio();
  const now = c.currentTime;
  const osc = c.createOscillator();
  const g = c.createGain();
  osc.type = 'triangle';
  osc.frequency.value = 1568;
  g.gain.setValueAtTime(0, now);
  g.gain.linearRampToValueAtTime(0.15, now + 0.01);
  g.gain.exponentialRampToValueAtTime(0.001, now + 0.2);
  osc.connect(g);
  g.connect(c.destination);
  osc.start(now);
  osc.stop(now + 0.2);
}

/** Click - bet placement feedback */
export function playClick(): void {
  const c = getCtx();
  if (!c) return;
  const now = c.currentTime;
  clack(now, 30, 0.1);
}
