/* eslint-disable */
/**
 * Procedural audio generator for LOO RUSH. Produces every SFX and the music
 * loops as 16-bit mono WAV files in assets/audio. Original content, no licenses.
 * Run: node scripts/gen-audio.js
 */
const fs = require('fs');
const path = require('path');

const SR = 22050;
const OUT = path.join(__dirname, '..', 'assets', 'audio');
fs.mkdirSync(OUT, { recursive: true });

let seed = 1234567;
const rand = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296) * 2 - 1;
const buf = (sec) => new Float32Array(Math.ceil(sec * SR));
const midi = (n) => 440 * Math.pow(2, (n - 69) / 12);

function writeWav(name, data, gain = 1) {
  let peak = 0;
  for (const v of data) peak = Math.max(peak, Math.abs(v));
  const norm = peak > 0 ? (0.89 * gain) / peak : 1;
  const b = Buffer.alloc(44 + data.length * 2);
  b.write('RIFF', 0); b.writeUInt32LE(36 + data.length * 2, 4); b.write('WAVE', 8);
  b.write('fmt ', 12); b.writeUInt32LE(16, 16); b.writeUInt16LE(1, 20); b.writeUInt16LE(1, 22);
  b.writeUInt32LE(SR, 24); b.writeUInt32LE(SR * 2, 28); b.writeUInt16LE(2, 32); b.writeUInt16LE(16, 34);
  b.write('data', 36); b.writeUInt32LE(data.length * 2, 40);
  for (let i = 0; i < data.length; i++) b.writeInt16LE(Math.max(-32767, Math.min(32767, Math.round(data[i] * norm * 32767))), 44 + i * 2);
  fs.writeFileSync(path.join(OUT, name + '.wav'), b);
  console.log(name, (b.length / 1024).toFixed(0) + 'KB');
}

/* ---------- oscillators & helpers ---------- */
const osc = {
  sine: (p) => Math.sin(2 * Math.PI * p),
  square: (p) => ((p % 1) < 0.5 ? 1 : -1),
  saw: (p) => 2 * (p % 1) - 1,
  tri: (p) => 1 - 4 * Math.abs((p % 1) - 0.5),
};

/** Adds a tone with frequency function f(t) and envelope env(t). */
function tone(out, start, dur, f, env, wave = 'sine', vol = 1) {
  const s0 = Math.floor(start * SR);
  const n = Math.floor(dur * SR);
  let phase = 0;
  for (let i = 0; i < n && s0 + i < out.length; i++) {
    const t = i / SR;
    phase += f(t) / SR;
    out[s0 + i] += osc[wave](phase) * env(t, dur) * vol;
  }
}
function noise(out, start, dur, env, vol = 1, lp = 1) {
  const s0 = Math.floor(start * SR);
  const n = Math.floor(dur * SR);
  let y = 0;
  for (let i = 0; i < n && s0 + i < out.length; i++) {
    const t = i / SR;
    const a = typeof lp === 'function' ? lp(t) : lp;
    y += a * (rand() - y);
    out[s0 + i] += y * env(t, dur) * vol;
  }
}
const adsr = (a, d, s, r) => (t, dur) => {
  if (t < a) return t / a;
  if (t < a + d) return 1 - (1 - s) * ((t - a) / d);
  if (t > dur - r) return s * Math.max(0, (dur - t) / r);
  return s;
};
const perc = (a, decay) => (t) => (t < a ? t / a : Math.exp(-(t - a) / decay));

/* ---------- SFX ---------- */
function sfx() {
  let b;
  b = buf(0.06); tone(b, 0, 0.06, (t) => 900 + 6000 * t, perc(0.002, 0.02), 'sine'); writeWav('tap', b, 0.6);

  b = buf(0.35);
  [72, 76, 79, 84].forEach((n, i) => tone(b, i * 0.05, 0.2, () => midi(n), perc(0.004, 0.08), 'tri', 0.8));
  writeWav('gate_good', b, 0.8);

  b = buf(0.7);
  tone(b, 0, 0.45, (t) => 300 * Math.pow(4, t / 0.45), adsr(0.01, 0.1, 0.6, 0.15), 'saw', 0.25);
  [76, 79, 83, 88, 91].forEach((n, i) => tone(b, 0.06 + i * 0.06, 0.35, () => midi(n), perc(0.003, 0.12), 'square', 0.25));
  noise(b, 0, 0.5, perc(0.01, 0.15), 0.25, 0.6);
  writeWav('gate_mult', b, 0.9);

  b = buf(0.45);
  tone(b, 0, 0.4, (t) => 330 * Math.pow(0.45, t / 0.4) * (1 + 0.03 * Math.sin(t * 60)), adsr(0.01, 0.05, 0.8, 0.12), 'saw', 0.6);
  writeWav('gate_bad', b, 0.75);

  b = buf(0.08); tone(b, 0, 0.08, (t) => 700 * Math.pow(0.3, t / 0.08), perc(0.002, 0.03), 'sine'); writeWav('pop', b, 0.5);

  b = buf(0.18); noise(b, 0, 0.18, perc(0.002, 0.05), 1, (t) => 0.5 - t * 2); tone(b, 0, 0.12, (t) => 160 - 400 * t, perc(0.002, 0.04), 'sine', 0.8); writeWav('splat', b, 0.6);

  b = buf(0.25); tone(b, 0, 0.07, () => midi(83), perc(0.002, 0.05), 'square', 0.5); tone(b, 0.06, 0.19, () => midi(88), perc(0.002, 0.1), 'square', 0.5); writeWav('coin', b, 0.5);

  b = buf(0.3); tone(b, 0, 0.28, (t) => (300 + 1400 * t) * (1 + 0.04 * Math.sin(t * 90)), adsr(0.01, 0.05, 0.7, 0.1), 'tri', 1); writeWav('gain', b, 0.7);

  b = buf(0.5);
  for (let k = 0; k < 6; k++) { noise(b, k * 0.07, 0.1, perc(0.002, 0.03), 0.7, 0.3); tone(b, k * 0.07, 0.08, (t) => 120 - 300 * t, perc(0.002, 0.03), 'sine', 0.6); }
  writeWav('battle', b, 0.7);

  // Fanfare: arpeggio + held major chord.
  b = buf(1.9);
  [60, 64, 67, 72].forEach((n, i) => tone(b, i * 0.11, 0.25, () => midi(n), perc(0.005, 0.12), 'square', 0.35));
  [72, 76, 79, 84].forEach((n) => tone(b, 0.48, 1.35, (t) => midi(n) * (1 + 0.006 * Math.sin(t * 30)), adsr(0.02, 0.2, 0.7, 0.5), 'saw', 0.18));
  tone(b, 0.48, 1.3, () => midi(48), adsr(0.01, 0.2, 0.6, 0.5), 'tri', 0.5);
  noise(b, 0.46, 0.6, perc(0.005, 0.25), 0.25, 0.5);
  writeWav('win', b, 0.9);

  // Sad trombone.
  b = buf(1.7);
  [[62, 0], [61, 0.32], [60, 0.64]].forEach(([n, s]) => tone(b, s, 0.3, (t) => midi(n), adsr(0.02, 0.05, 0.8, 0.08), 'saw', 0.5));
  tone(b, 0.96, 0.75, (t) => midi(59) * (1 + 0.03 * Math.sin(t * 38)), adsr(0.02, 0.1, 0.8, 0.25), 'saw', 0.5);
  writeWav('lose', b, 0.8);

  // Flush: resonant noise swirl going down.
  b = buf(1.3);
  noise(b, 0, 1.3, adsr(0.08, 0.2, 0.8, 0.5), 1, (t) => 0.08 + 0.3 * Math.abs(Math.sin(t * 14)) * (1 - t / 1.3));
  tone(b, 0, 1.2, (t) => 500 * Math.pow(0.35, t / 1.2) + 30 * Math.sin(t * 40), adsr(0.05, 0.2, 0.4, 0.4), 'sine', 0.25);
  writeWav('flush', b, 0.75);

  b = buf(1.0);
  for (let k = 0; k < 14; k++) tone(b, k * 0.05, 0.3, () => midi(84 + ((k * 5) % 12)), perc(0.002, 0.12), 'sine', 0.4);
  noise(b, 0, 0.4, perc(0.003, 0.12), 0.4, 0.7);
  writeWav('chest_open', b, 0.85);

  b = buf(0.6);
  noise(b, 0, 0.06, perc(0.001, 0.02), 0.8, 0.9);
  tone(b, 0.05, 0.5, () => midi(91), perc(0.002, 0.2), 'sine', 0.6);
  tone(b, 0.05, 0.5, () => midi(96), perc(0.002, 0.25), 'sine', 0.4);
  writeWav('purchase', b, 0.8);

  b = buf(1.1);
  tone(b, 0, 0.9, (t) => midi(60) * Math.pow(4, t / 0.9), adsr(0.02, 0.1, 0.7, 0.3), 'tri', 0.6);
  [72, 79, 84, 91].forEach((n, i) => tone(b, 0.5 + i * 0.08, 0.5, () => midi(n), perc(0.003, 0.2), 'sine', 0.35));
  writeWav('unlock', b, 0.85);

  b = buf(0.3); noise(b, 0, 0.3, (t) => Math.sin((Math.PI * t) / 0.3), 1, (t) => 0.05 + t * 2); writeWav('whoosh', b, 0.45);

  b = buf(0.22); tone(b, 0, 0.22, () => midi(79), perc(0.002, 0.08), 'tri', 1); tone(b, 0, 0.22, () => midi(91), perc(0.002, 0.05), 'sine', 0.3); writeWav('stall', b, 0.6);
}

/* Music lives in scripts/gen-music.js (full soundtrack). */

sfx();
