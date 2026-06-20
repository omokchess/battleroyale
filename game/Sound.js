/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Procedural sound effects — no asset files, synthesized live with the Web Audio
 * API. The aesthetic is "clean & punchy", not chiptune: sine/triangle bodies
 * with quick pitch envelopes, filtered-noise transients, and low-end thump on
 * impacts. Call it from anywhere: `Sound.play('hit')`.
 *
 *  - The AudioContext is created lazily and resumed on the first user gesture
 *    (browser autoplay policy). Call Sound.unlock() from an input handler.
 *  - Repeated identical sounds in the same instant are throttled so a flurry of
 *    hits can't pile into a volume explosion.
 *  - Mute state persists in localStorage and is shared by the lobby + in-game UI.
 */

const STORE_KEY = 'psd_muted';

// One shared white-noise buffer, reused by every noise-based effect.
let _noiseBuffer = null;
function noiseBuffer(ctx) {
  if (_noiseBuffer) return _noiseBuffer;
  const len = Math.floor(ctx.sampleRate * 0.4);
  const buf = ctx.createBuffer(1, len, ctx.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
  _noiseBuffer = buf;
  return buf;
}

// --- small synth primitives -------------------------------------------------

// A pitched body: oscillator gliding f0→f1 with an attack/decay envelope,
// optionally warmed by a lowpass. Returns the time it finishes.
function tone(ctx, dest, t0, { type = 'sine', f0, f1 = f0, dur = 0.15, gain = 0.5, attack = 0.004, cutoff = 0 }) {
  const osc = ctx.createOscillator();
  osc.type = type;
  osc.frequency.setValueAtTime(f0, t0);
  if (f1 !== f0) osc.frequency.exponentialRampToValueAtTime(Math.max(1, f1), t0 + dur);

  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.exponentialRampToValueAtTime(gain, t0 + attack);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);

  let node = osc;
  if (cutoff > 0) {
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = cutoff;
    osc.connect(lp); lp.connect(g);
  } else {
    osc.connect(g);
  }
  g.connect(dest);
  osc.start(t0);
  osc.stop(t0 + dur + 0.02);
  return t0 + dur;
}

// A filtered noise transient: the "snap"/"swish"/"impact" part of a sound.
function noise(ctx, dest, t0, { dur = 0.12, gain = 0.5, type = 'bandpass', f0 = 1200, f1 = f0, q = 0.8, attack = 0.002 }) {
  const src = ctx.createBufferSource();
  src.buffer = noiseBuffer(ctx);
  src.loop = true;

  const filt = ctx.createBiquadFilter();
  filt.type = type;
  filt.frequency.setValueAtTime(f0, t0);
  if (f1 !== f0) filt.frequency.exponentialRampToValueAtTime(Math.max(1, f1), t0 + dur);
  filt.Q.value = q;

  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.exponentialRampToValueAtTime(gain, t0 + attack);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);

  src.connect(filt); filt.connect(g); g.connect(dest);
  src.start(t0);
  src.stop(t0 + dur + 0.02);
  return t0 + dur;
}

// --- effect recipes ---------------------------------------------------------
// Each renders one effect at time t0 into `dest`. Kept short and snappy.
const RECIPES = {
  // Weapon attacks — four families.
  slash: (c, d, t) => {            // arc / blade-sweep: airy swish
    noise(c, d, t, { type: 'bandpass', f0: 2600, f1: 700, q: 0.7, dur: 0.16, gain: 0.32 });
    tone(c, d, t, { type: 'triangle', f0: 520, f1: 240, dur: 0.12, gain: 0.12 });
  },
  thrust: (c, d, t) => {           // line: quick tight stab
    tone(c, d, t, { type: 'triangle', f0: 900, f1: 1500, dur: 0.07, gain: 0.18 });
    noise(c, d, t, { type: 'highpass', f0: 1800, dur: 0.05, gain: 0.18 });
  },
  shoot: (c, d, t) => {            // projectile: punchy launch
    tone(c, d, t, { type: 'sine', f0: 720, f1: 180, dur: 0.16, gain: 0.34, cutoff: 2200 });
    noise(c, d, t, { type: 'bandpass', f0: 1800, f1: 600, q: 0.9, dur: 0.1, gain: 0.22 });
    tone(c, d, t, { type: 'sine', f0: 110, f1: 70, dur: 0.12, gain: 0.18 }); // low thump
  },
  slam: (c, d, t) => {            // heavy downward smash
    tone(c, d, t, { type: 'sine', f0: 150, f1: 46, dur: 0.34, gain: 0.5, cutoff: 900 });
    noise(c, d, t, { type: 'lowpass', f0: 1400, f1: 300, dur: 0.22, gain: 0.4 });
  },

  // Combat outcomes.
  hit: (c, d, t) => {             // landing/taking a blow: snappy impact
    noise(c, d, t, { type: 'bandpass', f0: 2000, f1: 500, q: 1.0, dur: 0.09, gain: 0.34 });
    tone(c, d, t, { type: 'sine', f0: 320, f1: 150, dur: 0.1, gain: 0.26, cutoff: 1200 });
  },
  kill: (c, d, t) => {            // rewarding three-note rise
    tone(c, d, t + 0.00, { type: 'sine', f0: 523, dur: 0.1, gain: 0.32 });
    tone(c, d, t + 0.08, { type: 'sine', f0: 659, dur: 0.1, gain: 0.32 });
    tone(c, d, t + 0.16, { type: 'sine', f0: 784, dur: 0.18, gain: 0.34 });
    tone(c, d, t + 0.16, { type: 'triangle', f0: 1568, dur: 0.18, gain: 0.08 }); // sparkle
  },
  death: (c, d, t) => {          // soft descending
    tone(c, d, t, { type: 'sine', f0: 440, f1: 110, dur: 0.5, gain: 0.34, cutoff: 1400 });
    tone(c, d, t, { type: 'sine', f0: 220, f1: 70, dur: 0.5, gain: 0.18 });
  },
  respawn: (c, d, t) => {        // bright ascending ready
    tone(c, d, t + 0.0, { type: 'sine', f0: 392, dur: 0.1, gain: 0.26 });
    tone(c, d, t + 0.09, { type: 'sine', f0: 587, dur: 0.16, gain: 0.3 });
  },

  // Movement / abilities.
  dash: (c, d, t) => {           // short airy whoosh
    noise(c, d, t, { type: 'bandpass', f0: 700, f1: 2600, q: 0.6, dur: 0.14, gain: 0.26 });
  },
  skill: (c, d, t) => {          // shimmer rise (two detuned sines)
    tone(c, d, t, { type: 'sine', f0: 440, f1: 880, dur: 0.22, gain: 0.24, cutoff: 3000 });
    tone(c, d, t, { type: 'sine', f0: 442, f1: 884, dur: 0.22, gain: 0.18 });
  },
  ready: (c, d, t) => {          // subtle cooldown-done blip
    tone(c, d, t + 0.0, { type: 'sine', f0: 784, dur: 0.07, gain: 0.12 });
    tone(c, d, t + 0.07, { type: 'sine', f0: 1047, dur: 0.1, gain: 0.12 });
  },

  // Sniper telegraph — a tense alarm heard by the player being aimed at, so they
  // can react. Clean but attention-grabbing (two urgent beeps).
  warn: (c, d, t) => {
    tone(c, d, t + 0.0, { type: 'triangle', f0: 1320, dur: 0.09, gain: 0.3 });
    tone(c, d, t + 0.13, { type: 'triangle', f0: 1320, dur: 0.12, gain: 0.3 });
  },

  // UI.
  ui: (c, d, t) => {             // soft tick
    tone(c, d, t, { type: 'sine', f0: 660, f1: 880, dur: 0.05, gain: 0.14 });
  },
  uiConfirm: (c, d, t) => {      // pleasant confirm chime
    tone(c, d, t + 0.0, { type: 'sine', f0: 659, dur: 0.09, gain: 0.2 });
    tone(c, d, t + 0.08, { type: 'sine', f0: 988, dur: 0.16, gain: 0.22 });
  }
};

// Minimum gap (ms) between two plays of the same effect, so floods don't stack.
const THROTTLE_MS = {
  hit: 45, slash: 60, thrust: 55, shoot: 60, slam: 90, warn: 120, ui: 30,
  _default: 50
};

class SoundEngine {
  constructor() {
    this.ctx = null;
    this.master = null;
    this.volume = 0.5;
    try { const v = parseFloat(localStorage.getItem(STORE_KEY + ':vol')); if (Number.isFinite(v)) this.volume = Math.max(0, Math.min(1, v)); } catch {}
    this.muted = this._loadMuted();
    this._last = Object.create(null);
    this._listeners = new Set();
  }

  _loadMuted() {
    try { return localStorage.getItem(STORE_KEY) === '1'; } catch { return false; }
  }

  _ensureCtx() {
    if (this.ctx) return this.ctx;
    if (typeof window === 'undefined') return null;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    try {
      this.ctx = new AC();
      this.master = this.ctx.createGain();
      this.master.gain.value = this.muted ? 0 : this.volume;
      this.master.connect(this.ctx.destination);
    } catch { this.ctx = null; }
    return this.ctx;
  }

  /** Resume the context from a user gesture (browser autoplay policy). */
  unlock() {
    const ctx = this._ensureCtx();
    if (ctx && ctx.state === 'suspended') ctx.resume().catch(() => {});
  }

  isMuted() { return this.muted; }

  setMuted(m) {
    this.muted = !!m;
    try { localStorage.setItem(STORE_KEY, this.muted ? '1' : '0'); } catch {}
    if (this.master) this.master.gain.value = this.muted ? 0 : this.volume;
    this._listeners.forEach(fn => { try { fn(this.muted); } catch {} });
  }

  toggleMute() { this.setMuted(!this.muted); return this.muted; }

  /** Master volume 0..1 (persisted). Applied live unless muted. */
  setVolume(v) {
    this.volume = Math.max(0, Math.min(1, Number(v) || 0));
    try { localStorage.setItem(STORE_KEY + ':vol', String(this.volume)); } catch {}
    if (this.master) this.master.gain.value = this.muted ? 0 : this.volume;
  }
  getVolume() { return this.volume; }

  /** Subscribe to mute changes (so every toggle button stays in sync). */
  onMuteChange(fn) { this._listeners.add(fn); return () => this._listeners.delete(fn); }

  play(name) {
    if (this.muted) return;
    const recipe = RECIPES[name];
    if (!recipe) return;
    const ctx = this._ensureCtx();
    if (!ctx) return;
    if (ctx.state === 'suspended') ctx.resume().catch(() => {});

    const t = (typeof performance !== 'undefined' ? performance.now() : Date.now());
    const gap = THROTTLE_MS[name] ?? THROTTLE_MS._default;
    if (this._last[name] && t - this._last[name] < gap) return;
    this._last[name] = t;

    try { recipe(ctx, this.master, ctx.currentTime + 0.001); } catch {}
  }

  /** Map a weapon config to its attack-sound family. */
  attackSoundFor(weapon) {
    if (!weapon) return 'slash';
    const type = weapon.hitMode || weapon.type || '';
    if (type === 'projectile') return 'shoot';
    if (type === 'melee_slam') return 'slam';
    if (type.includes('line')) return 'thrust';        // spear/dagger/rapier/gauntlet
    return 'slash';                                     // arc / sweep / circle
  }
}

export const Sound = new SoundEngine();
