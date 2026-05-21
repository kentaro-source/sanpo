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

/** Sharp ceramic "tick" — short noise burst, very high bandpass
 *  (~3-5kHz) with a resonant filter so it has bell-like decay.
 *  Sic Bo dice are tiny and they hit the porcelain bowl + each other,
 *  producing high-pitched ticks rather than wooden thuds. */
function ceramicTick(when: number, freq = 3500, gain = 0.12): void {
  const c = getCtx();
  if (!c) return;
  const sr = c.sampleRate;
  const durationMs = 30;
  const len = Math.floor((durationMs / 1000) * sr);
  const buf = c.createBuffer(1, len, sr);
  const data = buf.getChannelData(0);
  for (let i = 0; i < len; i++) {
    data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 1.5);
  }
  const src = c.createBufferSource();
  src.buffer = buf;
  const bp = c.createBiquadFilter();
  bp.type = 'bandpass';
  bp.frequency.value = freq;
  bp.Q.value = 18; // very resonant — gives that ceramic ping
  const g = c.createGain();
  g.gain.value = gain;
  src.connect(bp);
  bp.connect(g);
  g.connect(c.destination);
  src.start(when);
  src.stop(when + durationMs / 1000);
}

/** Glass-lid rattle — the wooden/glass cover slamming against the
 *  porcelain bowl as it's shaken. Slightly lower pitch than the dice
 *  ticks, with more body. */
function lidRattle(when: number): void {
  const c = getCtx();
  if (!c) return;
  const sr = c.sampleRate;
  const durationMs = 45;
  const len = Math.floor((durationMs / 1000) * sr);
  const buf = c.createBuffer(1, len, sr);
  const data = buf.getChannelData(0);
  for (let i = 0; i < len; i++) {
    data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 2);
  }
  const src = c.createBufferSource();
  src.buffer = buf;
  const bp = c.createBiquadFilter();
  bp.type = 'bandpass';
  bp.frequency.value = 1800 + Math.random() * 400;
  bp.Q.value = 6;
  const g = c.createGain();
  g.gain.value = 0.09;
  src.connect(bp);
  bp.connect(g);
  g.connect(c.destination);
  src.start(when);
  src.stop(when + durationMs / 1000);
}

/** Final "set down" thud when the bowl is placed on the table — one
 *  wooden thump that ends the roll and signals "result coming." */
function bowlSetDown(when: number): void {
  const c = getCtx();
  if (!c) return;
  const sr = c.sampleRate;
  const durationMs = 180;
  const len = Math.floor((durationMs / 1000) * sr);
  const buf = c.createBuffer(1, len, sr);
  const data = buf.getChannelData(0);
  for (let i = 0; i < len; i++) {
    data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 3);
  }
  const src = c.createBufferSource();
  src.buffer = buf;
  const lp = c.createBiquadFilter();
  lp.type = 'lowpass';
  lp.frequency.value = 350;
  const g = c.createGain();
  g.gain.value = 0.45;
  src.connect(lp);
  lp.connect(g);
  g.connect(c.destination);
  src.start(when);
  src.stop(when + durationMs / 1000);
}

/** Pre-recorded Sic Bo dice roll sample. Falls back to synthesis if
 *  the file fails to load (e.g. in a stripped build). */
const DICE_ROLL_URL = `${import.meta.env.BASE_URL}sounds/dice-roll.mp3`;
let diceAudio: HTMLAudioElement | null = null;
let diceSampleFailed = false;

function getDiceAudio(): HTMLAudioElement | null {
  if (diceSampleFailed) return null;
  if (diceAudio) return diceAudio;
  try {
    const a = new Audio(DICE_ROLL_URL);
    a.preload = 'auto';
    a.addEventListener('error', () => {
      diceSampleFailed = true;
      diceAudio = null;
    });
    diceAudio = a;
    return a;
  } catch {
    diceSampleFailed = true;
    return null;
  }
}

/** The freesound mp3 has the structure
 *    0.0 - 1.0s: silence (room tone)
 *    1.0 - 2.6s: dice tumbling in the bowl (peaks 0.18 - 0.67)
 *    2.6 - 3.0s: brief settling pause
 *    3.0 - 3.4s: bowl set-down impact (peak 1.0)
 *    3.4 - 4.6s: tail silence
 *  We start at the shake (skip the dead room tone) and stop just
 *  after the thud — so the SicBoModal can transition from "shaker
 *  bowl rocking" → "lid lifts, dice revealed" with the thud landing
 *  exactly on the visual reveal. */
const DICE_AUDIO_START_S = 1.0;
const DICE_AUDIO_END_S = 3.4;
/** Where in the playback the shake is over and the thud is about to
 *  hit. Caller transitions to the result phase at this offset; the
 *  audio keeps rolling for another ~400ms covering the thud. */
const DICE_AUDIO_SHAKE_MS = 2000;
let diceStopTimer: ReturnType<typeof setTimeout> | null = null;

/** Sic Bo dice roll. Plays the real Freesound sample if available,
 *  otherwise falls back to a synthesized layer of ceramic ticks +
 *  lid rattles + bowl set-down (still a roll, just less authentic).
 *
 *  Returns the duration (in ms) the caller should wait before showing
 *  the dice result, so the on-screen animation stays in sync with the
 *  audio. Caps long samples at MAX_DICE_ROLL_MS. */
export function playDiceRoll(durationMs = 1200): number {
  const c = getCtx();
  if (!c) return durationMs;
  unlockAudio();

  // Cancel any pending stop from a previous roll.
  if (diceStopTimer) {
    clearTimeout(diceStopTimer);
    diceStopTimer = null;
  }

  const a = getDiceAudio();
  if (a && !diceSampleFailed) {
    try {
      a.currentTime = DICE_AUDIO_START_S;
      a.volume = 1.0;
      const p = a.play();
      if (p && typeof p.then === 'function') {
        p.catch(() => {
          diceSampleFailed = true;
          synthesizeDiceRoll(durationMs);
        });
      }
      const totalAudioMs = Math.round((DICE_AUDIO_END_S - DICE_AUDIO_START_S) * 1000);
      // Stop the audio after the thud finishes.
      diceStopTimer = setTimeout(() => {
        try { a.pause(); a.currentTime = 0; } catch { /* ignore */ }
        diceStopTimer = null;
      }, totalAudioMs);
      // Caller animates the shaker for the SHAKE portion, then reveals
      // the dice — the thud at audio end aligns with that reveal.
      return DICE_AUDIO_SHAKE_MS;
    } catch {
      diceSampleFailed = true;
    }
  }
  synthesizeDiceRoll(durationMs);
  return durationMs;
}

/** Stop the currently-playing dice roll sample (no-op if nothing is
 *  playing or if synthesis is being used). Useful when the user spams
 *  ROLL and the previous roll's tail would overlap into the next. */
export function stopDiceRoll(): void {
  const a = diceAudio;
  if (!a) return;
  try {
    a.pause();
    a.currentTime = 0;
  } catch {
    // ignore
  }
}

/** Backup synthesizer used when the mp3 sample isn't available. */
function synthesizeDiceRoll(durationMs: number): void {
  const c = getCtx();
  if (!c) return;
  const start = c.currentTime;
  const endSec = durationMs / 1000;
  let t = 0;
  while (t < endSec - 0.05) {
    const when = start + t;
    ceramicTick(when, 3000 + Math.random() * 2000, 0.08 + Math.random() * 0.05);
    if (Math.random() < 0.35) {
      ceramicTick(when + 0.008, 3500 + Math.random() * 1500, 0.06);
    }
    t += 0.018 + Math.random() * 0.025;
  }
  let lidT = 0.05;
  while (lidT < endSec - 0.1) {
    lidRattle(start + lidT);
    lidT += 0.08 + Math.random() * 0.06;
  }
  bowlSetDown(start + endSec);
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

/** A single paper/card snap — a sharp broadband transient that decays
 *  very fast (paper doesn't ring). Highpassed so it reads crisp rather
 *  than boomy, with a mild mid peak for the card's body. The fast
 *  exponential decay (decayPow) is what makes it sound like card stock
 *  rather than a generic noise click. */
function paperSnap(when: number, gain: number, decayPow: number): void {
  const c = getCtx();
  if (!c) return;
  const sr = c.sampleRate;
  const durationMs = 60;
  const len = Math.floor((durationMs / 1000) * sr);
  const buf = c.createBuffer(1, len, sr);
  const data = buf.getChannelData(0);
  for (let i = 0; i < len; i++) {
    data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, decayPow);
  }
  const src = c.createBufferSource();
  src.buffer = buf;
  // Highpass kills the boom → keeps the crisp paper character.
  const hp = c.createBiquadFilter();
  hp.type = 'highpass';
  hp.frequency.value = 1100 + Math.random() * 350;
  // Gentle peak gives the card a touch of "body".
  const peak = c.createBiquadFilter();
  peak.type = 'peaking';
  peak.frequency.value = 2400 + Math.random() * 900;
  peak.Q.value = 1.6;
  peak.gain.value = 6;
  const g = c.createGain();
  g.gain.value = gain;
  src.connect(hp);
  hp.connect(peak);
  peak.connect(g);
  g.connect(c.destination);
  src.start(when);
  src.stop(when + durationMs / 1000);
}

/** Synthesized card flip — two layered paper-snaps (quiet flick +
 *  louder landing). Fallback for when the recorded sample can't load. */
function synthesizeCardFlip(): void {
  const c = getCtx();
  if (!c) return;
  unlockAudio();
  const now = c.currentTime;
  paperSnap(now, 0.06, 6); // flick — quiet, very fast decay
  paperSnap(now + 0.05 + Math.random() * 0.02, 0.17, 4); // landing snap
}

/** Generic one-shot sample player. A base <audio> is kept for the URL
 *  and cloned per call so rapid/overlapping plays don't cut each other
 *  off. Falls back to the supplied synthesizer if the file can't load
 *  or playback is rejected. */
function makeSamplePlayer(
  url: string,
  fallback: () => void,
): (volume?: number, startAt?: number) => void {
  let base: HTMLAudioElement | null = null;
  let failed = false;
  const getBase = (): HTMLAudioElement | null => {
    if (failed) return null;
    if (base) return base;
    try {
      const a = new Audio(url);
      a.preload = 'auto';
      a.addEventListener('error', () => {
        failed = true;
        base = null;
      });
      base = a;
      return a;
    } catch {
      failed = true;
      return null;
    }
  };
  return (volume = 0.9, startAt = 0) => {
    if (muted) return;
    if (!failed) {
      const b = getBase();
      if (b) {
        try {
          const a = b.cloneNode(true) as HTMLAudioElement;
          a.volume = volume;
          if (startAt > 0) {
            try {
              a.currentTime = startAt;
            } catch {
              // currentTime may not be settable until metadata loads.
            }
          }
          const p = a.play();
          if (p && typeof p.then === 'function') {
            p.catch(() => {
              failed = true;
              fallback();
            });
          }
          return;
        } catch {
          failed = true;
        }
      }
    }
    fallback();
  };
}

/** Pre-recorded card samples (mixkit "Poker card flick" / "Poker card
 *  placement", free license). Real recordings read as genuine card
 *  stock in a way synthesis can't. */
const cardFlipSample = makeSamplePlayer(
  `${import.meta.env.BASE_URL}sounds/card-flip.mp3`,
  synthesizeCardFlip,
);
const cardPlaceSample = makeSamplePlayer(
  `${import.meta.env.BASE_URL}sounds/card-place.mp3`,
  () => {
    const c = getCtx();
    if (c) paperSnap(c.currentTime, 0.22, 4);
  },
);

/** Card flick — the card turning. Used for the officer's auto-flip and
 *  (at low volume) as the crackle while the player squeezes their card.
 *  `volume` lets the squeeze crackle sit quieter than a full flip. */
export function playCardFlip(volume = 0.9): void {
  cardFlipSample(volume, 0.06);
}

/** Card placement — the firm "tak" of a card set down. Used when the
 *  player's squeeze completes and the card is fully revealed. */
export function playCardPlace(volume = 0.9): void {
  cardPlaceSample(volume, 0.04);
}
