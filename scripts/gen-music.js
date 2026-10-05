#!/usr/bin/env node
/**
 * LOO RUSH soundtrack generator (offline synthesis, no samples, no licences).
 *   node scripts/gen-music.js            → assets/audio/music_<id>.m4a (+ .wav in .music-work/)
 *
 * Six seamless loops (~50–65 s, 44.1 kHz stereo):
 *   menu   — "Lobby": chill neo-soul groove (electric piano, whistle, brushes)
 *   groove — Mall / Space: funky pop (slap-ish bass, guitar chops, brass)
 *   march  — Stadium / Palace: marching-band anthem (snare rolls, brass, timpani)
 *   jazz   — Airport / Museum: swing (walking bass, Rhodes comping, ride, muted lead)
 *   surf   — Splash Park: surf-tropical (twang guitar, steel drum, toms, shaker)
 *   spooky — Manor: fun-spooky swing (organ, theremin, pizzicato, chimes)
 *
 * Engine: polyBLEP oscillators, TPT state-variable filters, Karplus-Strong plucks,
 * FM electric piano / steel drum / bells, additive organ with leslie, synthetic
 * drum kit, sidechain pump, stereo delay + Freeverb, master soft limiter.
 * Loops are seamless: the tail (reverb/delay) is wrapped into the beginning.
 */
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const SR = 44100;
const ROOT = path.resolve(__dirname, '..');
const OUT = path.join(ROOT, 'assets', 'audio');
const WORK = path.join(ROOT, '.music-work');

/* ------------------------------------------------------------------ */
/* utils                                                               */
/* ------------------------------------------------------------------ */

function rng(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const hz = (m) => 440 * Math.pow(2, (m - 69) / 12);
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const db = (d) => Math.pow(10, d / 20);

function polyblep(t, dt) {
  if (t < dt) { t /= dt; return t + t - t * t - 1; }
  if (t > 1 - dt) { t = (t - 1) / dt; return t * t + t + t + 1; }
  return 0;
}

/** Zavalishin TPT state variable filter. */
class SVF {
  constructor() { this.ic1 = 0; this.ic2 = 0; this.set(1000, 0.7); }
  set(fc, q) {
    const g = Math.tan(Math.PI * clamp(fc, 20, SR * 0.45) / SR);
    this.k = 1 / q;
    this.a1 = 1 / (1 + g * (g + this.k));
    this.a2 = g * this.a1;
    this.a3 = g * this.a2;
  }
  run(x) {
    const v3 = x - this.ic2;
    const v1 = this.a1 * this.ic1 + this.a2 * v3;
    const v2 = this.ic2 + this.a2 * this.ic1 + this.a3 * v3;
    this.ic1 = 2 * v1 - this.ic1;
    this.ic2 = 2 * v2 - this.ic2;
    this.lp = v2; this.bp = v1; this.hp = x - this.k * v1 - v2;
    return v2;
  }
}

/** ADSR value at time t for a note of length `len` (seconds). */
function adsr(t, len, a, d, s, r) {
  if (t < 0) return 0;
  let v;
  if (t < a) v = t / a;
  else if (t < a + d) v = 1 - (1 - s) * ((t - a) / d);
  else v = s;
  if (t > len) v *= Math.max(0, 1 - (t - len) / r);
  return v;
}

/* ------------------------------------------------------------------ */
/* buses                                                               */
/* ------------------------------------------------------------------ */

class Bus {
  /** `wrap` = loop length in samples: notes starting before 0 (humanised) wrap to the loop end. */
  constructor(n, wrap = n) { this.L = new Float32Array(n); this.R = new Float32Array(n); this.wrap = wrap; }
  add(i, v, pan = 0) {
    if (i < 0) i += this.wrap;
    if (i < 0 || i >= this.L.length) return;
    this.L[i] += v * Math.cos((pan + 1) * Math.PI / 4) * 1.414;
    this.R[i] += v * Math.sin((pan + 1) * Math.PI / 4) * 1.414;
  }
}

/* ------------------------------------------------------------------ */
/* instruments (each renders one note into a bus)                      */
/* ------------------------------------------------------------------ */

const I = {
  kick(bus, t0, vel = 1, o = {}) {
    const n = Math.round(0.45 * SR), s0 = Math.round(t0 * SR);
    let ph = 0;
    const f0 = o.f0 ?? 150, f1 = o.f1 ?? 46, punch = o.punch ?? 1;
    for (let i = 0; i < n; i++) {
      const t = i / SR;
      const f = f1 + (f0 - f1) * Math.exp(-t * 38);
      ph += f / SR;
      let v = Math.sin(2 * Math.PI * ph) * Math.exp(-t * (o.decay ?? 7.5));
      if (t < 0.004) v += (Math.random() * 2 - 1) * 0.35 * punch * (1 - t / 0.004);
      bus.add(s0 + i, Math.tanh(v * 1.6) * 0.9 * vel, 0);
    }
  },
  snare(bus, t0, vel = 1, o = {}) {
    const n = Math.round((o.len ?? 0.28) * SR), s0 = Math.round(t0 * SR);
    const bp = new SVF(); bp.set(o.tone ?? 1900, 0.9);
    let ph = 0;
    for (let i = 0; i < n; i++) {
      const t = i / SR;
      const noise = bp.run(Math.random() * 2 - 1) * Math.exp(-t * (o.decay ?? 16));
      ph += 185 / SR;
      const body = Math.sin(2 * Math.PI * ph) * Math.exp(-t * 32) * 0.55;
      bus.add(s0 + i, (noise * 1.5 + body) * 0.55 * vel, o.pan ?? 0.04);
    }
  },
  rim(bus, t0, vel = 1) {
    const n = Math.round(0.06 * SR), s0 = Math.round(t0 * SR);
    const bp = new SVF(); bp.set(2400, 4);
    for (let i = 0; i < n; i++) {
      const t = i / SR;
      bus.add(s0 + i, bp.run((Math.random() * 2 - 1) + Math.sin(2 * Math.PI * 1700 * t)) * Math.exp(-t * 70) * 0.45 * vel, -0.15);
    }
  },
  clap(bus, t0, vel = 1, pan = 0) {
    const n = Math.round(0.3 * SR), s0 = Math.round(t0 * SR);
    const bp = new SVF(); bp.set(1250, 1.4);
    for (let i = 0; i < n; i++) {
      const t = i / SR;
      let env = 0;
      for (const o of [0, 0.011, 0.022]) if (t >= o) env = Math.max(env, Math.exp(-(t - o) * 90));
      env = Math.max(env, t > 0.03 ? 0.55 * Math.exp(-(t - 0.03) * 13) : 0);
      bus.add(s0 + i, bp.run(Math.random() * 2 - 1) * env * 0.9 * vel, pan);
    }
  },
  hat(bus, t0, vel = 1, open = false, pan = 0.25) {
    const n = Math.round((open ? 0.38 : 0.06) * SR), s0 = Math.round(t0 * SR);
    const hp = new SVF(); hp.set(7600, 0.8);
    const decay = open ? 9 : 75;
    for (let i = 0; i < n; i++) {
      const t = i / SR;
      hp.run(Math.random() * 2 - 1);
      bus.add(s0 + i, hp.hp * Math.exp(-t * decay) * 0.32 * vel, pan);
    }
  },
  ride(bus, t0, vel = 1) {
    const n = Math.round(0.9 * SR), s0 = Math.round(t0 * SR);
    const hp = new SVF(); hp.set(5200, 0.7);
    const parts = [527, 789, 1103, 1567, 2219].map((f) => [f, Math.random() * 6]);
    for (let i = 0; i < n; i++) {
      const t = i / SR;
      let metal = 0;
      for (const [f, p] of parts) metal += Math.sin(2 * Math.PI * f * t + p);
      hp.run(Math.random() * 2 - 1 + metal * 0.25);
      bus.add(s0 + i, hp.hp * (0.15 + 0.85 * Math.exp(-t * 26)) * Math.exp(-t * 3.2) * 0.22 * vel, 0.35);
    }
  },
  shaker(bus, t0, vel = 1) {
    const n = Math.round(0.09 * SR), s0 = Math.round(t0 * SR);
    const hp = new SVF(); hp.set(6000, 0.6);
    for (let i = 0; i < n; i++) {
      const t = i / SR;
      hp.run(Math.random() * 2 - 1);
      const env = Math.min(1, t / 0.012) * Math.exp(-t * 38);
      bus.add(s0 + i, hp.hp * env * 0.22 * vel, -0.35);
    }
  },
  brush(bus, t0, vel = 1) {
    const n = Math.round(0.22 * SR), s0 = Math.round(t0 * SR);
    const bp = new SVF(); bp.set(3200, 0.5);
    for (let i = 0; i < n; i++) {
      const t = i / SR;
      const env = Math.min(1, t / 0.02) * Math.exp(-t * 14);
      bus.add(s0 + i, bp.run(Math.random() * 2 - 1) * env * 0.45 * vel, 0.1);
    }
  },
  tom(bus, t0, note, vel = 1, pan = 0) {
    const n = Math.round(0.5 * SR), s0 = Math.round(t0 * SR);
    let ph = 0;
    const f1 = hz(note);
    for (let i = 0; i < n; i++) {
      const t = i / SR;
      ph += (f1 * (1 + 0.6 * Math.exp(-t * 20))) / SR;
      bus.add(s0 + i, Math.sin(2 * Math.PI * ph) * Math.exp(-t * 7) * 0.7 * vel, pan);
    }
  },
  crash(bus, t0, vel = 1) {
    const n = Math.round(2.2 * SR), s0 = Math.round(t0 * SR);
    const hp = new SVF(); hp.set(4200, 0.6);
    for (let i = 0; i < n; i++) {
      const t = i / SR;
      hp.run(Math.random() * 2 - 1);
      bus.add(s0 + i, hp.hp * Math.exp(-t * 1.9) * 0.28 * vel, -0.2);
    }
  },
  timpani(bus, t0, note, vel = 1) {
    const n = Math.round(1.4 * SR), s0 = Math.round(t0 * SR);
    const f = hz(note);
    for (let i = 0; i < n; i++) {
      const t = i / SR;
      const v = Math.sin(2 * Math.PI * f * t) + 0.5 * Math.sin(2 * Math.PI * f * 1.5 * t) * Math.exp(-t * 6) + 0.25 * Math.sin(2 * Math.PI * f * 1.98 * t);
      bus.add(s0 + i, v * Math.exp(-t * 3.2) * Math.min(1, t / 0.004) * 0.42 * vel, 0);
    }
  },

  /** Subtractive bass: saw + sub through an enveloped low-pass. */
  bass(bus, t0, note, len, vel = 1, o = {}) {
    const n = Math.round((len + 0.08) * SR), s0 = Math.round(t0 * SR);
    const f = hz(note), dt = f / SR;
    const flt = new SVF();
    let ph = 0;
    for (let i = 0; i < n; i++) {
      const t = i / SR;
      if (i % 16 === 0) flt.set((o.cut ?? 380) + (o.env ?? 1500) * Math.exp(-t * (o.envDecay ?? 14)), o.q ?? 1.1);
      ph += dt; if (ph >= 1) ph -= 1;
      const saw = 2 * ph - 1 - polyblep(ph, dt);
      const sub = Math.sin(2 * Math.PI * ph);
      const v = flt.run(saw * (o.saw ?? 0.6)) + sub * (o.sub ?? 0.55);
      bus.add(s0 + i, v * adsr(t, len, 0.004, 0.1, 0.75, 0.05) * 0.5 * vel, 0);
    }
  },

  /** Karplus-Strong plucked string (guitar, upright bass, pizzicato). */
  pluck(bus, t0, note, len, vel = 1, o = {}) {
    const f = hz(note);
    const n = Math.round((len + (o.ring ?? 0.4)) * SR), s0 = Math.round(t0 * SR);
    const L = Math.max(2, Math.round(SR / f));
    const line = new Float32Array(L);
    const bright = o.bright ?? 0.5;
    const pre = new SVF(); pre.set(800 + bright * 6000, 0.7);
    for (let i = 0; i < L; i++) line[i] = pre.run(Math.random() * 2 - 1);
    let idx = 0, last = 0;
    const damp = o.damp ?? 0.996;
    const vib = o.vibrato ?? 0;
    for (let i = 0; i < n; i++) {
      const t = i / SR;
      const cur = line[idx];
      const nxt = line[(idx + 1) % L];
      const v = damp * (0.5 * (cur + nxt) * (1 - (o.stiff ?? 0)) + (o.stiff ?? 0) * last);
      last = v;
      line[idx] = v;
      idx = (idx + 1) % L;
      const env = t > len ? Math.max(0, 1 - (t - len) / 0.06) : 1;
      let out = cur * env;
      if (vib) out *= 1 + vib * Math.sin(2 * Math.PI * 5.5 * t) * Math.min(1, t * 4);
      bus.add(s0 + i, out * 0.75 * vel, o.pan ?? 0);
    }
  },

  /** FM electric piano (Rhodes-ish) with stereo tremolo. */
  epiano(bus, t0, note, len, vel = 1, o = {}) {
    const f = hz(note);
    const n = Math.round((len + 0.6) * SR), s0 = Math.round(t0 * SR);
    for (let i = 0; i < n; i++) {
      const t = i / SR;
      const idx = (o.bark ?? 1.8) * Math.exp(-t * 6) * vel;
      const mod = Math.sin(2 * Math.PI * f * t) * idx;
      const tine = Math.sin(2 * Math.PI * f * 14 * t) * 0.06 * Math.exp(-t * 30);
      const v = (Math.sin(2 * Math.PI * f * t + mod) + tine) * adsr(t, len, 0.002, 1.4, 0.35, 0.35);
      const trem = Math.sin(2 * Math.PI * 4.2 * (t0 + t));
      bus.add(s0 + i, v * 0.28 * vel, trem * 0.45 + (o.pan ?? 0));
    }
  },

  /** FM bell / marimba / steel drum (ratio picks the colour). */
  fm(bus, t0, note, len, vel = 1, o = {}) {
    const f = hz(note);
    const n = Math.round((len + (o.tail ?? 0.8)) * SR), s0 = Math.round(t0 * SR);
    const ratio = o.ratio ?? 3.5, index = o.index ?? 2.5, decay = o.decay ?? 4;
    for (let i = 0; i < n; i++) {
      const t = i / SR;
      const m = Math.sin(2 * Math.PI * f * ratio * t) * index * Math.exp(-t * (o.modDecay ?? 8));
      const v = Math.sin(2 * Math.PI * f * t + m) * Math.exp(-t * decay) * Math.min(1, t / 0.002);
      bus.add(s0 + i, v * 0.3 * vel, o.pan ?? 0);
    }
  },

  /** Detuned saw stack through a low-pass (pads, brass, strings). */
  stack(bus, t0, note, len, vel = 1, o = {}) {
    const voices = o.voices ?? 5, spread = o.detune ?? 0.12;
    const n = Math.round((len + (o.r ?? 0.3)) * SR), s0 = Math.round(t0 * SR);
    const fL = new SVF(), fR = new SVF();
    const ph = Array.from({ length: voices }, () => Math.random());
    const fs = Array.from({ length: voices }, (_, k) => hz(note + (voices === 1 ? 0 : (k / (voices - 1) - 0.5) * 2 * spread)));
    for (let i = 0; i < n; i++) {
      const t = i / SR;
      if (i % 16 === 0) {
        const c = (o.cut ?? 1800) + (o.env ?? 0) * Math.exp(-t * (o.envDecay ?? 6)) + (o.swell ?? 0) * Math.min(1, t / Math.max(0.01, len));
        fL.set(c, o.q ?? 0.8); fR.set(c * 1.03, o.q ?? 0.8);
      }
      let l = 0, r = 0;
      const scoop = o.scoop ? 1 - o.scoop * Math.exp(-t * 30) : 1;
      for (let k = 0; k < voices; k++) {
        const dt = (fs[k] * scoop) / SR;
        ph[k] += dt; if (ph[k] >= 1) ph[k] -= 1;
        const s = 2 * ph[k] - 1 - polyblep(ph[k], dt);
        if (k % 2) r += s; else l += s;
      }
      const env = adsr(t, len, o.a ?? 0.02, o.d ?? 0.2, o.s ?? 0.8, o.r ?? 0.3) * vel * (o.gain ?? 0.12);
      const vl = fL.run(l) * env, vr = fR.run(r) * env;
      let si = s0 + i;
      if (si < 0) si += bus.wrap;
      if (si >= 0 && si < bus.L.length) { bus.L[si] += vl; bus.R[si] += vr; }
    }
  },

  /** Lead voice: square/saw/sine with delayed vibrato and portamento. */
  lead(bus, t0, note, len, vel = 1, o = {}) {
    const n = Math.round((len + 0.15) * SR), s0 = Math.round(t0 * SR);
    const from = o.from ?? note, glide = o.glide ?? 0.04;
    const flt = new SVF();
    let ph = 0;
    for (let i = 0; i < n; i++) {
      const t = i / SR;
      const m = note + (from - note) * Math.exp(-t / glide);
      const vibAmt = (o.vib ?? 0.25) * Math.min(1, Math.max(0, (t - 0.12) * 4));
      const f = hz(m + vibAmt * Math.sin(2 * Math.PI * (o.vibRate ?? 5.6) * t));
      const dt = f / SR;
      ph += dt; if (ph >= 1) ph -= 1;
      let s;
      if (o.wave === 'square') s = (ph < 0.5 ? 1 : -1) + polyblep(ph, dt) - polyblep((ph + 0.5) % 1, dt);
      else if (o.wave === 'saw') s = 2 * ph - 1 - polyblep(ph, dt);
      else if (o.wave === 'tri') s = 1 - 4 * Math.abs(ph - 0.5);
      else s = Math.sin(2 * Math.PI * ph);
      if (o.breath) s += (Math.random() * 2 - 1) * o.breath;
      if (i % 16 === 0) flt.set((o.cut ?? 3500) + (o.env ?? 0) * Math.exp(-t * 10), o.q ?? 0.8);
      const v = flt.run(s) * adsr(t, len, o.a ?? 0.01, o.d ?? 0.15, o.s ?? 0.75, o.r ?? 0.08);
      bus.add(s0 + i, v * (o.gain ?? 0.2) * vel, o.pan ?? 0);
    }
  },

  /** Additive drawbar organ with a leslie-like tremolo. */
  organ(bus, t0, note, len, vel = 1) {
    const n = Math.round((len + 0.05) * SR), s0 = Math.round(t0 * SR);
    const f = hz(note);
    const bars = [[0.5, 0.6], [1, 1], [2, 0.7], [3, 0.45], [4, 0.3], [6, 0.15]];
    for (let i = 0; i < n; i++) {
      const t = i / SR;
      let v = 0;
      for (const [h, a] of bars) v += Math.sin(2 * Math.PI * f * h * t) * a;
      const les = Math.sin(2 * Math.PI * 6.2 * (t0 + t));
      const env = adsr(t, len, 0.006, 0.05, 1, 0.05);
      bus.add(s0 + i, v * env * 0.07 * vel * (1 + 0.15 * les), les * 0.5);
    }
  },
};

/* ------------------------------------------------------------------ */
/* harmony                                                             */
/* ------------------------------------------------------------------ */

const NOTE = { C: 0, 'C#': 1, Db: 1, D: 2, 'D#': 3, Eb: 3, E: 4, F: 5, 'F#': 6, Gb: 6, G: 7, 'G#': 8, Ab: 8, A: 9, 'A#': 10, Bb: 10, B: 11 };
const QUAL = {
  '': [0, 4, 7], m: [0, 3, 7], maj7: [0, 4, 7, 11], m7: [0, 3, 7, 10], 7: [0, 4, 7, 10], 9: [0, 4, 7, 10, 14],
  6: [0, 4, 7, 9], m6: [0, 3, 7, 9], m7b5: [0, 3, 6, 10], sus4: [0, 5, 7], '7sus': [0, 5, 7, 10], m9: [0, 3, 7, 10, 14], add9: [0, 4, 7, 14],
};
function chord(sym) {
  const m = /^([A-G][#b]?)(.*)$/.exec(sym);
  const root = NOTE[m[1]];
  const q = QUAL[m[2]];
  if (!q) throw new Error('chord ' + sym);
  return { root, tones: q.map((x) => (root + x) % 12), intervals: q, sym };
}

/** Closest voicing of a chord to the previous one, within [lo, hi]. */
function voice(ch, prev, lo = 55, hi = 74) {
  const pcs = ch.intervals.slice(0, 4).map((x) => (ch.root + x) % 12);
  let best = null, bestCost = Infinity;
  for (let inv = 0; inv < pcs.length; inv++) {
    for (let base = lo - 12; base <= hi; base++) {
      if ((base % 12 + 12) % 12 !== pcs[inv]) continue;
      const notes = [];
      let n = base;
      for (let k = 0; k < pcs.length; k++) {
        const pc = pcs[(inv + k) % pcs.length];
        while ((n % 12 + 12) % 12 !== pc) n++;
        notes.push(n);
        n++;
      }
      if (notes[0] < lo || notes[notes.length - 1] > hi) continue;
      const avg = notes.reduce((a, b) => a + b, 0) / notes.length;
      const pavg = prev ? prev.reduce((a, b) => a + b, 0) / prev.length : (lo + hi) / 2;
      const cost = Math.abs(avg - pavg);
      if (cost < bestCost) { bestCost = cost; best = notes; }
    }
  }
  return best;
}

/* ------------------------------------------------------------------ */
/* melody: motif-based, chord-aware                                    */
/* ------------------------------------------------------------------ */

/**
 * Builds a melody over `bars` of chords from a rhythmic motif (in 16th steps)
 * repeated with variations; strong beats land on chord tones, others walk the scale.
 */
function melody(R, chords, scale, keyRoot, rhythmA, rhythmB, register = 72, phraseBars = 4) {
  const out = [];
  const scalePcs = scale.map((x) => (keyRoot + x) % 12);
  const inScale = (n) => scalePcs.includes(((n % 12) + 12) % 12);
  const nearestTone = (target, tones) => {
    let best = target, d = 99;
    for (let n = target - 7; n <= target + 7; n++) if (tones.includes(((n % 12) + 12) % 12) && Math.abs(n - target) < d) { d = Math.abs(n - target); best = n; }
    return best;
  };
  const stepScale = (n, dir) => { let m = n + dir; while (!inScale(m)) m += dir; return m; };
  // Contour of the motif (relative scale steps), reused across phrases.
  const contourA = rhythmA.map(() => Math.round((R() - 0.45) * 3));
  const contourB = rhythmB.map(() => Math.round((R() - 0.4) * 3));
  let cur = nearestTone(register, chords[0].tones);
  for (let bar = 0; bar < chords.length; bar += 2) {
    const phrasePos = Math.floor(bar / 2) % (phraseBars / 2 * 2);
    const useB = Math.floor(bar / phraseBars) % 2 === 1;
    const rhythm = useB ? rhythmB : rhythmA;
    const contour = useB ? contourB : contourA;
    const ending = (bar + 2) % phraseBars === 0;
    rhythm.forEach(([step, len], k) => {
      if (ending && step >= 24) return; // breathe at phrase ends
      const b = bar + Math.floor(step / 16);
      if (b >= chords.length) return;
      const ch = chords[b];
      const strong = step % 4 === 0;
      let n = cur;
      if (k > 0) {
        const dir = contour[k] || (R() < 0.5 ? 1 : -1);
        n = stepScale(cur, dir);
        if (Math.abs(dir) > 1) n = stepScale(n, Math.sign(dir));
      }
      if (strong) n = nearestTone(n, ch.tones);
      // Keep the line in a singable range
      while (n > register + 9) n -= 12;
      while (n < register - 8) n += 12;
      out.push({ bar: b, step: step % 16, len, note: n });
      cur = n;
    });
    if (ending) {
      const ch = chords[Math.min(chords.length - 1, bar + 1)];
      out.push({ bar: bar + 1, step: 8, len: 6, note: nearestTone(cur, [ch.root, (ch.root + ch.intervals[1]) % 12]) });
    }
    void phrasePos;
  }
  return out;
}

/* ------------------------------------------------------------------ */
/* effects                                                             */
/* ------------------------------------------------------------------ */

/** Freeverb (Jezar) — 8 combs + 4 allpasses per channel. */
function reverb(inL, inR, size = 0.84, damp = 0.25, wet = 0.3) {
  const n = inL.length;
  const outL = new Float32Array(n), outR = new Float32Array(n);
  const combs = [1116, 1188, 1277, 1356, 1422, 1491, 1557, 1617];
  const aps = [556, 441, 341, 225];
  const scale = SR / 44100;
  for (const [src, dst, sp] of [[inL, outL, 0], [inR, outR, 23]]) {
    const cb = combs.map((c) => ({ buf: new Float32Array(Math.round((c + sp) * scale)), i: 0, f: 0 }));
    const ap = aps.map((a) => ({ buf: new Float32Array(Math.round((a + sp) * scale)), i: 0 }));
    for (let k = 0; k < n; k++) {
      const x = src[k] * 0.015;
      let y = 0;
      for (const c of cb) {
        const o = c.buf[c.i];
        c.f = o * (1 - damp) + c.f * damp;
        c.buf[c.i] = x + c.f * size;
        c.i = (c.i + 1) % c.buf.length;
        y += o;
      }
      for (const a of ap) {
        const b = a.buf[a.i];
        const o = -y + b;
        a.buf[a.i] = y + b * 0.5;
        a.i = (a.i + 1) % a.buf.length;
        y = o;
      }
      dst[k] = y * wet;
    }
  }
  return [outL, outR];
}

/** Tempo-synced ping-pong delay. */
function delay(inL, inR, seconds, feedback = 0.35, wet = 0.25, tone = 3000) {
  const n = inL.length;
  const d = Math.round(seconds * SR);
  const outL = new Float32Array(n), outR = new Float32Array(n);
  const lp = new SVF(); lp.set(tone, 0.7);
  const bufL = new Float32Array(d), bufR = new Float32Array(d);
  let i = 0;
  for (let k = 0; k < n; k++) {
    const yl = bufL[i], yr = bufR[i];
    const fbIn = lp.run(yr);
    bufL[i] = (inL[k] + inR[k]) * 0.5 + fbIn * feedback;
    bufR[i] = yl * feedback;
    i = (i + 1) % d;
    outL[k] = yl * wet;
    outR[k] = yr * wet;
  }
  return [outL, outR];
}

/* ------------------------------------------------------------------ */
/* song renderer                                                       */
/* ------------------------------------------------------------------ */

/**
 * spec: { id, bpm, swing (0..0.5 of a 16th pair), bars, key, scale, chords[] (one per bar),
 *         parts(ctx) → schedules notes on buses, mix }
 */
function renderSong(spec) {
  const beat = 60 / spec.bpm;
  const q = beat / 4; // 16th
  const loopLen = spec.bars * 4 * beat;
  const tail = 4 * beat * 2;
  const N = Math.round((loopLen + tail) * SR);
  const loopN = Math.round(loopLen * SR);
  const buses = { drums: new Bus(N, loopN), bass: new Bus(N, loopN), keys: new Bus(N, loopN), lead: new Bus(N, loopN), pad: new Bus(N, loopN), fx: new Bus(N, loopN) };
  const R = rng(spec.seed ?? 1);
  /** Time (s) of a 16th step in a bar, with swing and humanisation. */
  const T = (bar, step, human = 0.004) => {
    const swing = spec.swing ?? 0;
    const sw = spec.swing8 ? (step % 4 === 2 ? swing * 2 * q : 0) : step % 2 === 1 ? swing * q : 0;
    return bar * 4 * beat + step * q + sw + (R() * 2 - 1) * human;
  };
  const chords = spec.chords.map(chord);
  const kicks = [];
  const ctx = { I, buses, T, q, beat, R, chords, bars: spec.bars, kicks, voice, melody, key: NOTE[spec.key], scale: spec.scale };
  ctx.kick = (bar, step, vel = 1, o) => { const t = T(bar, step, 0.001); kicks.push(t); I.kick(buses.drums, t, vel, o); };
  spec.parts(ctx);

  // Sidechain pump on bass/keys/pad from the kick hits.
  const pump = new Float32Array(N).fill(1);
  const depth = spec.mix.pump ?? 0.3;
  for (const t of kicks) {
    const s0 = Math.round(t * SR) < 0 ? Math.round(t * SR) + loopN : Math.round(t * SR);
    for (let i = 0; i < 0.3 * SR && s0 + i < N; i++) {
      const g = 1 - depth * Math.exp(-i / SR / 0.09);
      if (g < pump[s0 + i]) pump[s0 + i] = g;
    }
  }
  for (const b of ['bass', 'keys', 'pad']) for (let i = 0; i < N; i++) { buses[b].L[i] *= pump[i]; buses[b].R[i] *= pump[i]; }

  // Sends
  const m = spec.mix;
  const sendL = new Float32Array(N), sendR = new Float32Array(N);
  const dsendL = new Float32Array(N), dsendR = new Float32Array(N);
  for (const [name, bus] of Object.entries(buses)) {
    const rv = m.reverb?.[name] ?? 0, dl = m.delay?.[name] ?? 0;
    for (let i = 0; i < N; i++) {
      sendL[i] += bus.L[i] * rv; sendR[i] += bus.R[i] * rv;
      dsendL[i] += bus.L[i] * dl; dsendR[i] += bus.R[i] * dl;
    }
  }
  const [rvL, rvR] = reverb(sendL, sendR, m.roomSize ?? 0.84, 0.3, 1);
  const [dlL, dlR] = delay(dsendL, dsendR, (m.delayBeats ?? 0.75) * beat, m.delayFb ?? 0.38, 1, m.delayTone ?? 3200);

  // Sum
  const L = new Float32Array(N), Rr = new Float32Array(N);
  for (const [name, bus] of Object.entries(buses)) {
    const g = db(m.gain?.[name] ?? 0);
    for (let i = 0; i < N; i++) { L[i] += bus.L[i] * g; Rr[i] += bus.R[i] * g; }
  }
  for (let i = 0; i < N; i++) { L[i] += rvL[i] + dlL[i]; Rr[i] += rvR[i] + dlR[i]; }

  // Seamless loop: wrap the tail into the start.
  const n = Math.round(loopLen * SR);
  const outL = L.slice(0, n), outR = Rr.slice(0, n);
  for (let i = n; i < N; i++) { outL[i - n] += L[i]; outR[i - n] += Rr[i]; }

  // Master: DC/rumble high-pass, loudness normalisation, soft limiter.
  const hpL = new SVF(), hpR = new SVF(); hpL.set(32, 0.7); hpR.set(32, 0.7);
  let sum = 0;
  for (let i = 0; i < n; i++) {
    hpL.run(outL[i]); hpR.run(outR[i]);
    outL[i] = hpL.hp; outR[i] = hpR.hp;
    sum += outL[i] * outL[i] + outR[i] * outR[i];
  }
  const rms = Math.sqrt(sum / (2 * n));
  const target = db(m.loudness ?? -15);
  const g = target / Math.max(1e-9, rms);
  let peak = 0;
  for (let i = 0; i < n; i++) {
    outL[i] = Math.tanh(outL[i] * g * 1.05) * 0.94;
    outR[i] = Math.tanh(outR[i] * g * 1.05) * 0.94;
    peak = Math.max(peak, Math.abs(outL[i]), Math.abs(outR[i]));
  }
  return { L: outL, R: outR, seconds: loopLen, peak, rmsDb: 20 * Math.log10(target) };
}

/* ------------------------------------------------------------------ */
/* drum pattern helpers                                                */
/* ------------------------------------------------------------------ */
const P = (s) => [...s.replace(/\s/g, '')].map((c) => (c === '.' ? 0 : c === 'x' ? 1 : c === 'o' ? 0.55 : c === 'X' ? 1.25 : 0));

/* ------------------------------------------------------------------ */
/* the songs                                                           */
/* ------------------------------------------------------------------ */

const SONGS = [
  {
    id: 'menu', bpm: 98, swing: 0.18, bars: 24, key: 'F', scale: [0, 2, 4, 5, 7, 9, 11], seed: 11,
    chords: ['Fmaj7', 'Dm7', 'Gm7', 'C9', 'Fmaj7', 'Dm7', 'Bbmaj7', 'C7sus',
      'Bbmaj7', 'C9', 'Am7', 'Dm7', 'Gm7', 'C9', 'Fmaj7', 'Fmaj7',
      'Fmaj7', 'Dm7', 'Gm7', 'C9', 'Bbmaj7', 'Am7', 'Gm7', 'C7sus'],
    mix: { gain: { drums: -2, bass: -1, keys: 0, lead: -1, pad: -6, fx: -3 }, reverb: { keys: 0.25, lead: 0.3, pad: 0.4, drums: 0.08, fx: 0.4 }, delay: { lead: 0.22, fx: 0.25 }, delayBeats: 0.75, pump: 0.18, loudness: -16 },
    parts(c) {
      const { I, buses, T, chords, bars, R } = c;
      const kick = P('x... .... ..x. ....'), snare = P('.... x... .... x...'), shaker = P('.ooo xooo .ooo xooo');
      let prev = null;
      for (let b = 0; b < bars; b++) {
        const ch = chords[b];
        for (let s = 0; s < 16; s++) {
          if (kick[s]) c.kick(b, s, 0.75, { decay: 9 });
          if (snare[s]) I.rim(buses.drums, T(b, s), 0.9);
          if (shaker[s] && b >= 2) I.shaker(buses.drums, T(b, s), shaker[s]);
          if (b % 4 === 3 && s >= 12 && s % 2 === 0) I.brush(buses.drums, T(b, s), 0.6);
        }
        // Bass: root, fifth, approach
        const root = 36 + ch.root;
        I.bass(buses.bass, T(b, 0), root, c.beat * 1.4, 0.9, { cut: 260, env: 600, saw: 0.25, sub: 0.75 });
        I.bass(buses.bass, T(b, 6), root + 7, c.beat * 0.4, 0.7, { cut: 260, env: 500, saw: 0.25, sub: 0.75 });
        I.bass(buses.bass, T(b, 10), root + (ch.intervals[1]), c.beat * 0.9, 0.75, { cut: 260, env: 500, saw: 0.25, sub: 0.75 });
        // Electric piano comping
        const v = voice(ch, prev, 57, 76); prev = v;
        for (const [s, len] of [[0, 1.6], [6, 0.5], [10, 1.4]]) for (const n of v) I.epiano(buses.keys, T(b, s) + R() * 0.01, n, c.beat * len, 0.55 + R() * 0.15);
        // Warm pad
        if (b % 2 === 0) for (const n of v) I.stack(buses.pad, T(b, 0), n, c.beat * 8, 0.6, { voices: 3, detune: 0.08, cut: 900, a: 0.6, r: 0.8, gain: 0.08 });
      }
      // Whistle lead + marimba answers
      const mel = melody(R, chords, c.scale, c.key, [[0, 3], [4, 2], [6, 2], [8, 4], [14, 2], [16, 2], [18, 2], [20, 6]], [[2, 2], [4, 2], [6, 4], [12, 2], [14, 2], [16, 6], [24, 4]], 76);
      for (const n of mel) if (n.bar >= 4) I.lead(buses.lead, T(n.bar, n.step), n.note, n.len * c.q, 0.9, { wave: 'sine', breath: 0.04, vib: 0.35, cut: 5000, gain: 0.24, a: 0.03 });
      for (let b = 2; b < bars; b += 4) for (const [s, d] of [[12, 0], [13, 2], [14, 4]]) I.fm(buses.fx, T(b, s), 72 + chords[b].root % 12 + d, c.q, 0.6, { ratio: 4, index: 1.2, decay: 9, pan: 0.4 });
    },
  },
  {
    id: 'groove', bpm: 118, swing: 0.08, bars: 32, key: 'A', scale: [0, 2, 3, 5, 7, 9, 10], seed: 22,
    chords: ['Am7', 'D9', 'Am7', 'D9', 'Fmaj7', 'G', 'Em7', 'Am7',
      'Am7', 'D9', 'Am7', 'D9', 'Fmaj7', 'G', 'Em7', 'E7',
      'Dm7', 'G', 'Cmaj7', 'Fmaj7', 'Bm7b5', 'E7', 'Am7', 'A7',
      'Dm7', 'G', 'Cmaj7', 'Fmaj7', 'Dm7', 'E7', 'Am7', 'E7'],
    mix: { gain: { drums: 0, bass: 0, keys: -3, lead: -1, pad: -8, fx: -4 }, reverb: { keys: 0.18, lead: 0.2, pad: 0.35, drums: 0.06, fx: 0.25 }, delay: { lead: 0.18, keys: 0.12 }, delayBeats: 0.75, pump: 0.3, loudness: -14.5 },
    parts(c) {
      const { I, buses, T, chords, bars, R } = c;
      const kick = P('x... ..x. x... ..x.'), clap = P('.... x... .... x...'), hat = P('xoxo xoxo xoxo xoxx');
      const bassRh = [[0, 2, 0], [3, 1, 12], [6, 1, 0], [8, 2, 7], [11, 1, 10], [12, 1, 12], [14, 2, 0]];
      let prev = null;
      for (let b = 0; b < bars; b++) {
        const ch = chords[b];
        for (let s = 0; s < 16; s++) {
          if (kick[s]) c.kick(b, s, 1);
          if (clap[s]) { I.clap(buses.drums, T(b, s), 0.9); I.snare(buses.drums, T(b, s), 0.45); }
          if (hat[s]) I.hat(buses.drums, T(b, s), hat[s] * 0.9, s === 14 && b % 2 === 1);
        }
        if (b % 8 === 0) I.crash(buses.drums, T(b, 0), 0.8);
        const root = 33 + ((ch.root - 9 + 12) % 12) + 0;
        for (const [s, l, iv] of bassRh) I.bass(buses.bass, T(b, s), root + iv, l * c.q * 0.95, 0.95, { cut: 300, env: 2200, envDecay: 18, q: 1.6, saw: 0.75, sub: 0.45 });
        // Guitar chops on the offbeats
        const v = voice(ch, prev, 60, 79); prev = v;
        for (const s of [2, 7, 10, 15]) v.forEach((n, k) => I.pluck(buses.keys, T(b, s) + k * 0.006, n, c.q * 0.6, 0.55, { bright: 0.8, damp: 0.99, ring: 0.05, pan: -0.35 }));
        if (b % 4 === 0) for (const n of v) I.stack(buses.pad, T(b, 0), n, c.beat * 16, 0.6, { voices: 4, cut: 1300, a: 0.8, r: 1, gain: 0.07 });
      }
      // Brass stabs every 4 bars + synth lead melody
      for (let b = 3; b < bars; b += 4) for (const s of [12, 14]) for (const n of voice(chords[b], null, 62, 79)) I.stack(buses.fx, T(b, s), n, c.q * 1.4, 0.9, { voices: 3, detune: 0.06, cut: 1400, env: 2600, envDecay: 12, a: 0.02, s: 0.7, r: 0.1, scoop: 0.6, gain: 0.13 });
      const mel = melody(R, chords, c.scale, c.key, [[0, 2], [3, 1], [4, 2], [6, 2], [10, 2], [12, 4], [16, 3], [20, 2], [22, 2], [24, 6]], [[0, 4], [4, 2], [6, 2], [8, 2], [11, 3], [16, 2], [18, 2], [20, 8]], 74);
      for (const n of mel) if (n.bar >= 8) I.lead(buses.lead, T(n.bar, n.step), n.note, n.len * c.q, 0.95, { wave: 'square', cut: 2600, env: 2000, vib: 0.18, gain: 0.16, pan: 0.15 });
    },
  },
  {
    id: 'march', bpm: 124, bars: 24, key: 'D', scale: [0, 2, 4, 5, 7, 9, 11], seed: 33,
    chords: ['D', 'G', 'D', 'A', 'Bm7', 'G', 'A', 'D',
      'D', 'G', 'D', 'A', 'Bm7', 'G', 'A7', 'D',
      'G', 'A', 'F#m', 'Bm7', 'G', 'A', 'D', 'A7'],
    mix: { gain: { drums: 0, bass: -2, keys: -4, lead: 0, pad: -5, fx: -2 }, reverb: { drums: 0.15, lead: 0.25, pad: 0.35, fx: 0.3, keys: 0.25 }, delay: {}, pump: 0.12, roomSize: 0.88, loudness: -14.5 },
    parts(c) {
      const { I, buses, T, chords, bars, R } = c;
      const snare = P('x.ox x.o. x.ox xoxo'), kick = P('x... x... x... x...');
      let prev = null;
      for (let b = 0; b < bars; b++) {
        const ch = chords[b];
        for (let s = 0; s < 16; s++) {
          if (kick[s]) c.kick(b, s, 0.85, { f0: 120, f1: 55, decay: 6 });
          if (snare[s]) I.snare(buses.drums, T(b, s, 0.002), snare[s] * 0.55, { tone: 2600, decay: 24, len: 0.15, pan: -0.1 });
          if (s === 12) I.clap(buses.drums, T(b, s), 0.8, 0.2); // "hey!"
        }
        if (b % 8 === 7) for (let s = 0; s < 16; s++) I.snare(buses.drums, T(b, s, 0.001), 0.25 + s * 0.035, { tone: 2600, decay: 30, len: 0.1 });
        if (b % 4 === 0) { I.crash(buses.drums, T(b, 0), 0.9); I.timpani(buses.drums, T(b, 0), 38 + ch.root % 12, 1); }
        const root = 38 + ((ch.root - 2 + 12) % 12) - 12 + 12;
        for (const [s, iv] of [[0, 0], [4, 7], [8, 0], [12, 7]]) I.bass(buses.bass, T(b, s), root + iv, c.beat * 0.8, 0.85, { cut: 420, env: 900, saw: 0.5, sub: 0.6 });
        const v = voice(ch, prev, 59, 76); prev = v;
        for (const n of v) I.stack(buses.pad, T(b, 0), n, c.beat * 4, 0.7, { voices: 5, detune: 0.1, cut: 1800, a: 0.12, r: 0.4, gain: 0.07 }); // strings
        for (const s of [4, 12]) for (const n of v) I.stack(buses.keys, T(b, s), n + 12, c.q * 1.2, 0.6, { voices: 2, cut: 2000, env: 2500, a: 0.01, r: 0.1, gain: 0.08 });
      }
      // Brass melody (anthem)
      const mel = melody(R, chords, c.scale, c.key, [[0, 4], [4, 2], [6, 2], [8, 4], [12, 4], [16, 6], [22, 2], [24, 8]], [[0, 2], [2, 2], [4, 4], [8, 2], [10, 2], [12, 4], [16, 4], [20, 4], [24, 8]], 69);
      for (const n of mel) if (n.bar >= 4) for (const oct of [0, -12]) I.stack(buses.lead, T(n.bar, n.step), n.note + oct, n.len * c.q * 0.92, oct ? 0.55 : 1, { voices: 3, detune: 0.07, cut: 1500, env: 2400, envDecay: 7, swell: 600, a: 0.03, s: 0.85, r: 0.12, scoop: 0.5, gain: 0.14 });
    },
  },
  {
    id: 'jazz', bpm: 148, swing: 0.32, swing8: true, bars: 32, key: 'Bb', scale: [0, 2, 4, 5, 7, 9, 11], seed: 44,
    chords: ['Cm7', 'F7', 'Bbmaj7', 'Gm7', 'Cm7', 'F7', 'Bbmaj7', 'Bbmaj7',
      'Cm7', 'F7', 'Bbmaj7', 'Gm7', 'Cm7', 'F7', 'Bbmaj7', 'Bb7',
      'Ebmaj7', 'Ebm6', 'Dm7', 'G7', 'Cm7', 'F7', 'Bbmaj7', 'G7',
      'Cm7', 'F7', 'Dm7', 'G7', 'Cm7', 'F7', 'Bbmaj7', 'F7'],
    mix: { gain: { drums: -1, bass: 0, keys: -2, lead: -1, pad: -10, fx: -4 }, reverb: { keys: 0.2, lead: 0.28, drums: 0.12, bass: 0.04 }, delay: {}, pump: 0, roomSize: 0.8, loudness: -15.5 },
    parts(c) {
      const { I, buses, T, chords, bars, R } = c;
      let prev = null;
      let walk = 34 + chords[0].root;
      for (let b = 0; b < bars; b++) {
        const ch = chords[b];
        // Ride "ding ding-a ding" + hihat foot on 2 & 4, brushes
        for (const s of [0, 4, 6, 8, 12, 14]) I.ride(buses.drums, T(b, s), s === 6 || s === 14 ? 0.55 : 0.85);
        for (const s of [4, 12]) I.hat(buses.drums, T(b, s), 0.5, false, -0.3);
        if (R() < 0.35) I.brush(buses.drums, T(b, R() < 0.5 ? 6 : 14), 0.5);
        if (b % 4 === 3) c.kick(b, 14, 0.5, { decay: 10 });
        // Walking bass: chord tones + chromatic approach to the next root
        const next = chords[(b + 1) % bars];
        const tones = ch.intervals.map((x) => ch.root + x);
        const target = 34 + ((next.root - 34) % 12 + 12) % 12;
        const line = [34 + ((ch.root - 34) % 12 + 12) % 12, 0, 0, 0];
        line[1] = line[0] + (tones[1] - ch.root);
        line[2] = line[0] + (tones[2] - ch.root);
        line[3] = target + (R() < 0.5 ? 1 : -1);
        line.forEach((n, k) => {
          while (n < 30) n += 12;
          while (n > 50) n -= 12;
          I.pluck(buses.bass, T(b, k * 4), n, c.beat * 0.95, 1.1, { bright: 0.15, damp: 0.995, ring: 0.1, stiff: 0.2 });
        });
        walk = line[3];
        // Rhodes comping: Charleston rhythm, rootless voicings
        const v = voice(ch, prev, 58, 74); prev = v;
        for (const [s, len] of R() < 0.5 ? [[0, 1.2], [6, 0.6]] : [[2, 0.5], [6, 1.4]]) for (const n of v) I.epiano(buses.keys, T(b, s), n, c.beat * len, 0.5 + R() * 0.15, { bark: 2.2, pan: -0.2 });
      }
      void walk;
      // Muted-trumpet style lead
      const mel = melody(R, chords, c.scale, c.key, [[0, 3], [4, 2], [6, 4], [12, 2], [14, 2], [16, 4], [22, 2], [24, 6]], [[2, 2], [4, 2], [6, 2], [8, 4], [14, 2], [16, 2], [18, 2], [20, 8]], 72);
      for (const n of mel) if (n.bar >= 8 && n.bar < 30) I.lead(buses.lead, T(n.bar, n.step), n.note, n.len * c.q, 0.9, { wave: 'saw', cut: 1500, env: 1800, q: 1.4, vib: 0.3, gain: 0.16, a: 0.02, pan: 0.2 });
    },
  },
  {
    id: 'surf', bpm: 134, swing: 0.04, bars: 32, key: 'E', scale: [0, 2, 4, 5, 7, 9, 11], seed: 55,
    chords: ['E', 'A', 'B', 'A', 'E', 'C#m', 'A', 'B',
      'E', 'A', 'B', 'A', 'E', 'C#m', 'B', 'E',
      'A', 'B', 'G#m', 'C#m', 'A', 'B', 'E', 'E',
      'A', 'B', 'G#m', 'C#m', 'F#m', 'B', 'E', 'B'],
    mix: { gain: { drums: -1, bass: -1, keys: -3, lead: 0, pad: -9, fx: -2 }, reverb: { lead: 0.35, keys: 0.3, drums: 0.12, fx: 0.3 }, delay: { lead: 0.25, fx: 0.2 }, delayBeats: 0.5, delayFb: 0.3, pump: 0.15, roomSize: 0.9, loudness: -14.5 },
    parts(c) {
      const { I, buses, T, chords, bars, R } = c;
      const kick = P('x... ...x x... ....'), snare = P('.... x... .... x...'), shake = P('xoxo xoxo xoxo xoxo');
      let prev = null;
      for (let b = 0; b < bars; b++) {
        const ch = chords[b];
        for (let s = 0; s < 16; s++) {
          if (kick[s]) c.kick(b, s, 0.9);
          if (snare[s]) I.snare(buses.drums, T(b, s), 0.75, { tone: 2100 });
          if (shake[s]) I.shaker(buses.drums, T(b, s), shake[s]);
        }
        if (b % 8 === 7) [[8, 50], [10, 47], [12, 45], [14, 43]].forEach(([s, n], k) => I.tom(buses.drums, T(b, s), n, 0.9, -0.4 + k * 0.25));
        if (b % 8 === 0) I.crash(buses.drums, T(b, 0), 0.7);
        const root = 40 + ((ch.root - 4 + 12) % 12) - (((ch.root - 4 + 12) % 12) > 6 ? 12 : 0);
        for (const [s, iv] of [[0, 0], [3, 0], [6, 7], [8, 12], [11, 7], [14, 4]]) I.pluck(buses.bass, T(b, s), root + iv, c.q * 1.6, 1, { bright: 0.25, damp: 0.993, ring: 0.05 });
        // Rhythm guitar: "chicka" strums
        const v = voice(ch, prev, 59, 76); prev = v;
        for (const s of [2, 6, 10, 14]) v.forEach((n, k) => I.pluck(buses.keys, T(b, s) + k * 0.008, n, c.q * 0.8, 0.45, { bright: 0.65, damp: 0.992, ring: 0.06, pan: 0.35 }));
        // Steel drum arpeggio answers every other bar
        if (b % 2 === 1) [0, 1, 2, 1].forEach((k, i) => I.fm(buses.fx, T(b, 8 + i * 2), v[k % v.length] + 12, c.q * 2, 0.55, { ratio: 2.76, index: 1.6, decay: 5.5, pan: -0.3 }));
      }
      // Twang surf guitar lead (pluck + vibrato + slapback)
      const mel = melody(R, chords, c.scale, c.key, [[0, 2], [2, 2], [4, 4], [8, 2], [10, 2], [12, 4], [16, 6], [24, 8]], [[0, 3], [3, 3], [6, 2], [8, 8], [16, 2], [18, 2], [20, 2], [22, 2], [24, 8]], 71);
      for (const n of mel) if (n.bar >= 4) I.pluck(buses.lead, T(n.bar, n.step), n.note, n.len * c.q, 1.2, { bright: 0.7, damp: 0.9975, ring: 0.35, vibrato: 0.012, pan: 0.1 });
    },
  },
  {
    id: 'spooky', bpm: 112, swing: 0.22, swing8: true, bars: 24, key: 'D', scale: [0, 2, 3, 5, 7, 8, 11], seed: 66,
    chords: ['Dm', 'Bb', 'Gm', 'A7', 'Dm', 'Bb', 'Eb', 'A7',
      'Dm', 'Bb', 'Gm', 'A7', 'Dm', 'Gm', 'A7', 'Dm',
      'Gm', 'Dm', 'A7', 'Dm', 'Bb', 'Gm', 'A7', 'A7'],
    mix: { gain: { drums: -2, bass: -1, keys: -2, lead: -2, pad: -6, fx: -3 }, reverb: { keys: 0.3, lead: 0.45, pad: 0.4, fx: 0.5, drums: 0.15 }, delay: { lead: 0.2 }, delayBeats: 1, pump: 0.1, roomSize: 0.92, loudness: -15.5 },
    parts(c) {
      const { I, buses, T, chords, bars, R } = c;
      const kick = P('x... .... x... ....'), snap = P('.... x... .... x...');
      let prev = null;
      for (let b = 0; b < bars; b++) {
        const ch = chords[b];
        for (let s = 0; s < 16; s++) {
          if (kick[s]) c.kick(b, s, 0.8, { decay: 8 });
          if (snap[s]) { I.rim(buses.drums, T(b, s), 0.9); I.clap(buses.drums, T(b, s), 0.35, -0.3); }
          if (s % 4 === 2) I.hat(buses.drums, T(b, s), 0.45, false, 0.4);
        }
        if (b % 8 === 0) for (const [k, n] of [[0, 81], [1, 77], [2, 79], [3, 72]]) I.fm(buses.fx, T(b, k * 4), n, c.beat, 0.7, { ratio: 3.5, index: 3, decay: 1.6, tail: 2, pan: 0.3 }); // clock chimes
        const root = 38 + ((ch.root - 2 + 12) % 12) - (((ch.root - 2 + 12) % 12) > 6 ? 12 : 0);
        for (const [s, iv] of [[0, 0], [4, 7], [8, 12], [12, 7]]) I.pluck(buses.bass, T(b, s), root + iv, c.beat * 0.9, 1.05, { bright: 0.2, damp: 0.994, ring: 0.08, stiff: 0.15 });
        const v = voice(ch, prev, 57, 74); prev = v;
        for (const n of v) I.organ(buses.keys, T(b, 0), n, c.beat * (b % 2 ? 1.8 : 3.6), 0.8);
        // Pizzicato arpeggio
        for (let s = 0; s < 16; s += 4) I.pluck(buses.pad, T(b, s + 2), v[(s / 4) % v.length] + 12, c.q, 0.55, { bright: 0.9, damp: 0.97, ring: 0.02, pan: -0.4 });
      }
      // Theremin lead
      const mel = melody(R, chords, c.scale, c.key, [[0, 6], [8, 4], [12, 4], [16, 8], [24, 8]], [[0, 4], [4, 4], [8, 8], [16, 4], [20, 4], [24, 8]], 74);
      let last = mel[0]?.note ?? 74;
      for (const n of mel) if (n.bar >= 4) {
        I.lead(buses.lead, T(n.bar, n.step), n.note, n.len * c.q, 0.9, { wave: 'sine', from: last, glide: 0.07, vib: 0.55, vibRate: 6.4, cut: 4000, gain: 0.2, a: 0.06, r: 0.2 });
        last = n.note;
      }
    },
  },
];

/* ------------------------------------------------------------------ */
/* output                                                              */
/* ------------------------------------------------------------------ */

function writeWav(file, L, R) {
  const n = L.length;
  const b = Buffer.alloc(44 + n * 4);
  b.write('RIFF', 0); b.writeUInt32LE(36 + n * 4, 4); b.write('WAVE', 8); b.write('fmt ', 12);
  b.writeUInt32LE(16, 16); b.writeUInt16LE(1, 20); b.writeUInt16LE(2, 22); b.writeUInt32LE(SR, 24);
  b.writeUInt32LE(SR * 4, 28); b.writeUInt16LE(4, 32); b.writeUInt16LE(16, 34); b.write('data', 36); b.writeUInt32LE(n * 4, 40);
  for (let i = 0; i < n; i++) {
    b.writeInt16LE(Math.round(clamp(L[i], -1, 1) * 32767), 44 + i * 4);
    b.writeInt16LE(Math.round(clamp(R[i], -1, 1) * 32767), 46 + i * 4);
  }
  fs.writeFileSync(file, b);
}

if (require.main === module) {
  fs.mkdirSync(WORK, { recursive: true });
  fs.mkdirSync(path.join(OUT, 'web'), { recursive: true });
  const only = process.argv[2];
  for (const spec of SONGS) {
    if (only && spec.id !== only) continue;
    // Deterministic noise/phases: the same script always renders the same files.
    Math.random = rng(0x5eed0000 + (spec.seed ?? 0));
    const t0 = Date.now();
    const { L, R, seconds, peak } = renderSong(spec);
    const wav = path.join(WORK, `music_${spec.id}.wav`);
    writeWav(wav, L, R);
    // AAC in MP4 (gapless edit list), 160 kb/s stereo.
    execFileSync('ffmpeg', ['-v', 'error', '-y', '-i', wav, '-c:a', 'aac', '-b:a', '128k', '-movflags', '+faststart', path.join(OUT, `music_${spec.id}.m4a`)]);
    // Web builds: MP3 (AAC is missing from some open-source browsers). iOS keeps the AAC file.
    execFileSync('ffmpeg', ['-v', 'error', '-y', '-i', wav, '-c:a', 'libmp3lame', '-b:a', '112k', path.join(OUT, 'web', `music_${spec.id}.mp3`)]);
    const kb = (fs.statSync(path.join(OUT, `music_${spec.id}.m4a`)).size / 1024).toFixed(0);
    console.log(`music_${spec.id}: ${seconds.toFixed(1)} s, ${spec.bars} bars @ ${spec.bpm} BPM, peak ${peak.toFixed(2)}, ${kb} KB, ${((Date.now() - t0) / 1000).toFixed(1)} s`);
  }
}

module.exports = { SONGS, renderSong };
