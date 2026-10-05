/**
 * Renders the App Store preview from the captured clips.
 *   node scripts/promo/render.js [en|fr|all] [--preview]
 * → docs/preview/loo-rush-preview-<lang>.mp4 (886×1920, 30 fps, H.264 + AAC 256k)
 *   + poster frame. --preview renders every 3rd frame at half size (fast check).
 */
const http = require('http');
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const handler = require('serve-handler');
const { chromium } = require('playwright');

const ROOT = path.resolve(__dirname, '../..');
const WORK = process.env.PROMO_WORK || path.join(ROOT, '.promo');
const STAGE = path.join(WORK, 'stage');
const OUTDIR = path.join(ROOT, 'docs', 'preview');
const FPS = 30;
const FRAMES = 899; // 29.97 s
const PREVIEW = process.argv.includes('--preview');
const SR = 44100;

function prepareStage() {
  fs.rmSync(STAGE, { recursive: true, force: true });
  fs.mkdirSync(path.join(STAGE, 'fonts'), { recursive: true });
  fs.mkdirSync(path.join(STAGE, 'img'), { recursive: true });
  fs.copyFileSync(path.join(__dirname, 'compose.html'), path.join(STAGE, 'compose.html'));
  const g = path.join(ROOT, 'node_modules', '@expo-google-fonts');
  fs.copyFileSync(path.join(g, 'lilita-one/400Regular/LilitaOne_400Regular.ttf'), path.join(STAGE, 'fonts/LilitaOne_400Regular.ttf'));
  fs.copyFileSync(path.join(g, 'nunito/900Black/Nunito_900Black.ttf'), path.join(STAGE, 'fonts/Nunito_900Black.ttf'));
  fs.copyFileSync(path.join(g, 'nunito/800ExtraBold/Nunito_800ExtraBold.ttf'), path.join(STAGE, 'fonts/Nunito_800ExtraBold.ttf'));
  fs.copyFileSync(path.join(ROOT, 'assets/icon.png'), path.join(STAGE, 'img/icon.png'));
  fs.symlinkSync(path.join(WORK, 'clips'), path.join(STAGE, 'clips'));
}

function loadMeta() {
  const meta = {};
  for (const name of fs.readdirSync(path.join(WORK, 'clips'))) {
    const f = path.join(WORK, 'clips', name, 'meta.json');
    if (fs.existsSync(f)) meta[name] = JSON.parse(fs.readFileSync(f, 'utf8'));
  }
  return meta;
}

/* ---------------- audio ---------------- */
function readWav(file) {
  const b = fs.readFileSync(file);
  let p = 12, rate = 22050, ch = 1, data = null;
  while (p < b.length) {
    const id = b.toString('ascii', p, p + 4), size = b.readUInt32LE(p + 4);
    if (id === 'fmt ') { ch = b.readUInt16LE(p + 10); rate = b.readUInt32LE(p + 12); }
    if (id === 'data') data = b.subarray(p + 8, p + 8 + size);
    p += 8 + size + (size % 2);
  }
  const n = data.length / 2 / ch;
  const out = new Float32Array(n);
  for (let i = 0; i < n; i++) out[i] = data.readInt16LE(i * 2 * ch) / 32768;
  return { rate, s: out };
}
const wavCache = {};
const wav = (id) => (wavCache[id] ??= readWav(path.join(ROOT, 'assets/audio', id + '.wav')));

function writeWav(file, L, R) {
  const n = L.length;
  const b = Buffer.alloc(44 + n * 4);
  b.write('RIFF', 0); b.writeUInt32LE(36 + n * 4, 4); b.write('WAVE', 8); b.write('fmt ', 12);
  b.writeUInt32LE(16, 16); b.writeUInt16LE(1, 20); b.writeUInt16LE(2, 22); b.writeUInt32LE(SR, 24);
  b.writeUInt32LE(SR * 4, 28); b.writeUInt16LE(4, 32); b.writeUInt16LE(16, 34); b.write('data', 36); b.writeUInt32LE(n * 4, 40);
  for (let i = 0; i < n; i++) {
    b.writeInt16LE(Math.round(Math.max(-1, Math.min(1, L[i])) * 32767), 44 + i * 4);
    b.writeInt16LE(Math.round(Math.max(-1, Math.min(1, R[i])) * 32767), 46 + i * 4);
  }
  fs.writeFileSync(file, b);
}

/** Adds a sound at time t (s); pan -1..1; optional one-pole low-pass (Hz). */
function place(L, R, id, t, vol, pan = 0, rate = 1) {
  const w = wav(id);
  const step = (w.rate / SR) * rate;
  const start = Math.round(t * SR);
  const gl = vol * Math.min(1, 1 - pan), gr = vol * Math.min(1, 1 + pan);
  for (let i = 0; ; i++) {
    const src = i * step;
    const k = Math.floor(src);
    if (k + 1 >= w.s.length) break;
    const v = w.s[k] + (w.s[k + 1] - w.s[k]) * (src - k);
    const j = start + i;
    if (j < 0) continue;
    if (j >= L.length) break;
    L[j] += v * gl;
    R[j] += v * gr;
  }
}

function mix(sfx, scenes, outFile) {
  const n = Math.round((FRAMES / FPS) * SR);
  const L = new Float32Array(n), R = new Float32Array(n);
  // Music bed: the game's own track (128 BPM, 15 s), twice. First bar muffled (the "problem"),
  // opens on the hook.
  const m = wav('music_game');
  const mStep = m.rate / SR;
  let lp = 0;
  const bar = 4 * 60 / 128;
  for (let j = 0; j < n; j++) {
    const src = (j * mStep) % m.s.length;
    const k = Math.floor(src);
    const v = m.s[k] + ((m.s[(k + 1) % m.s.length] ?? 0) - m.s[k]) * (src - k);
    const t = j / SR;
    const open = Math.min(1, Math.max(0, (t - (bar - 0.08)) / 0.08));
    const a = 0.09 + open * 0.91; // one-pole low-pass ≈ 650 Hz → full range
    lp += (v - lp) * a;
    const fadeOut = Math.min(1, (FRAMES / FPS - t) / 0.12);
    const g = (0.58 + open * 0.17) * fadeOut;
    L[j] += lp * g;
    R[j] += lp * g;
  }
  for (const s of sfx) place(L, R, s.id, s.t, s.vol, s.pan ?? 0, s.rate ?? 1);
  // Gentle limiter (tanh soft clip) keeps the punch without distortion.
  let peak = 0;
  for (let i = 0; i < n; i++) peak = Math.max(peak, Math.abs(L[i]), Math.abs(R[i]));
  const norm = peak > 0.95 ? 0.95 / peak : 1;
  for (let i = 0; i < n; i++) { L[i] = Math.tanh(L[i] * norm * 1.15) / 1.05; R[i] = Math.tanh(R[i] * norm * 1.15) / 1.05; }
  writeWav(outFile, L, R);
}

/** Game SFX replayed in sync with the footage actually on screen (see compose VIS). */
function gameSfx(meta, vis) {
  const out = [];
  const lastCoin = { t: -1 };
  const SKIP = /^(music_|whoosh)/;
  for (let i = 1; i < vis.length; i++) {
    for (const src of new Set(vis[i])) {
      const m = /clips\/([^/]+)\/(\d+)\.jpg/.exec(src);
      if (!m) continue;
      const clip = m[1], fc = Number(m[2]);
      const prev = [...new Set(vis[i - 1])].map((s) => /clips\/([^/]+)\/(\d+)\.jpg/.exec(s)).find((x) => x && x[1] === clip);
      if (!prev) continue;
      const fp = Number(prev[2]);
      if (fc <= fp || fc - fp > 4) continue;
      const st = meta[clip].states;
      const t0 = st[fp - 1][0], t1 = st[fc - 1][0];
      for (const s of meta[clip].sounds) {
        if (s.t <= t0 || s.t > t1) continue;
        const id = s.src.split('.')[0];
        if (SKIP.test(id)) continue;
        const at = (i - 1 + (s.t - t0) / Math.max(1, t1 - t0)) / FPS;
        if (id === 'coin') { if (at - lastCoin.t < 0.12) continue; lastCoin.t = at; }
        out.push({ id, t: at, vol: (s.vol ?? 0.8) * (id === 'coin' ? 0.55 : 1), rate: s.rate ?? 1 });
      }
    }
  }
  return out;
}

/** Sound design of the edit itself (transitions, titles, CTA). */
function designSfx(S, BEAT) {
  const out = [];
  const w = (t, v = 0.55, pan = 0) => out.push({ id: 'whoosh', t, vol: v, pan });
  w(S.hook - 0.18, 0.5);
  w(S.brand + 0.05, 0.45, -0.3);
  w(S.swipe - 0.38, 0.5, 0.3);
  for (const c of [S.dodge, S.rivals, S.finish]) w(c - 0.17, 0.6, 0.2);
  w(S.worlds + 0.02, 0.45, -0.2);
  for (let k = 1; k < 8; k++) out.push({ id: 'pop', t: S.worlds + 0.3 + k * BEAT, vol: 0.32 });
  w(S.meta - 0.05, 0.45, 0.4);
  w(S.meta + 4 * BEAT - 0.25, 0.4, 0.4);
  w(S.cta - 0.1, 0.5);
  out.push({ id: 'pop', t: S.brand + 0.55, vol: 0.4 });
  out.push({ id: 'flush', t: S.cta + 0.02, vol: 0.45 });
  out.push({ id: 'pop', t: S.cta + 0.8, vol: 0.45 });
  out.push({ id: 'tap', t: S.swipe - 1.0, vol: 0.5 });
  return out;
}

async function renderLang(browser, port, lang, meta) {
  const worlds = JSON.parse(execFileSync(path.join(ROOT, 'node_modules/.bin/tsx'), [path.join(__dirname, 'worlds.ts'), lang], { encoding: 'utf8' }));
  const scale = PREVIEW ? 0.5 : 1;
  const page = await browser.newPage({ viewport: { width: 886, height: 1920 }, deviceScaleFactor: scale });
  page.on('pageerror', (e) => console.error('page error', e.message));
  await page.goto(`http://localhost:${port}/compose.html?lang=${lang}`);
  await page.evaluate(([m, w]) => window.init(m, w), [meta, worlds]);
  const S = await page.evaluate('window.SCENES');
  const frameDir = path.join(WORK, 'render', lang + (PREVIEW ? '-preview' : ''));
  fs.rmSync(frameDir, { recursive: true, force: true });
  fs.mkdirSync(frameDir, { recursive: true });
  const vis = [];
  const step = PREVIEW ? 3 : 1;
  const t0 = Date.now();
  for (let i = 0; i < FRAMES; i += step) {
    vis[i] = await page.evaluate((t) => window.renderAt(t), i / FPS);
    await page.screenshot({ path: path.join(frameDir, String(i / step + 1).padStart(5, '0') + '.jpg'), type: 'jpeg', quality: 95 });
  }
  await page.close();
  console.log(`${lang}: frames rendered in ${((Date.now() - t0) / 1000).toFixed(0)}s`);
  fs.mkdirSync(OUTDIR, { recursive: true });
  const name = `loo-rush-preview-${lang}${PREVIEW ? '-draft' : ''}`;
  const out = path.join(PREVIEW ? WORK : OUTDIR, name + '.mp4');
  const audio = path.join(WORK, `mix-${lang}.wav`);
  const visFull = PREVIEW ? null : vis;
  mix(visFull ? [...gameSfx(meta, visFull), ...designSfx(S, 60 / 128)] : designSfx(S, 60 / 128), S, audio);
  execFileSync('ffmpeg', [
    '-v', 'error', '-y', '-framerate', String(FPS / step), '-i', path.join(frameDir, '%05d.jpg'), '-i', audio,
    '-vf', 'scale=trunc(iw/2)*2:trunc(ih/2)*2', '-c:v', 'libx264', '-profile:v', 'high', '-level', '4.2', '-pix_fmt', 'yuv420p', '-r', String(FPS),
    '-b:v', PREVIEW ? '3M' : '10M', '-maxrate', '12M', '-bufsize', '20M', '-preset', PREVIEW ? 'veryfast' : 'slow',
    '-c:a', 'aac', '-b:a', '256k', '-ar', String(SR), '-ac', '2', '-shortest', '-movflags', '+faststart', out,
  ]);
  if (!PREVIEW) {
    // Poster frame: the brand lockup of the CTA.
    fs.copyFileSync(path.join(frameDir, String(Math.round((S.cta + 2.2) * FPS)).padStart(5, '0') + '.jpg'), path.join(OUTDIR, `poster-${lang}.jpg`));
  }
  console.log('→', path.relative(ROOT, out));
}

(async () => {
  const arg = process.argv[2] && !process.argv[2].startsWith('--') ? process.argv[2] : 'all';
  const langs = arg === 'all' ? ['en', 'fr'] : arg.split(',');
  prepareStage();
  const meta = loadMeta();
  const server = http.createServer((req, res) => handler(req, res, { public: STAGE, symlinks: true, cleanUrls: false }));
  await new Promise((r) => server.listen(0, r));
  const browser = await chromium.launch({ executablePath: process.env.CHROMIUM || '/opt/pw-browsers/chromium' });
  for (const lang of langs) await renderLang(browser, server.address().port, lang, meta);
  await browser.close();
  server.close();
})();
