/**
 * Films the REAL app (production web export, debug hooks on) frame by frame.
 *   node scripts/promo/capture.js <clip[,clip...]|all>
 * Output: .promo/clips/<clip>/00001.jpg… (886×1920, 30 fps) + sounds.json
 * See scripts/promo/README.md.
 */
const http = require('http');
const fs = require('fs');
const path = require('path');
const handler = require('serve-handler');
const { chromium } = require('playwright');
const TIMECAP = require('./timecap');
const CLIPS = require('./clips');

const ROOT = path.resolve(__dirname, '../..');
const WORK = process.env.PROMO_WORK || path.join(ROOT, '.promo');
const WEB = process.env.PROMO_WEB || path.join(WORK, 'web');
const FPS = 30;
const VIEW = { width: 443, height: 960 }; // ×2 = 886×1920 (App Store 6.9" preview size)

async function filmClip(browser, port, name, clip) {
  const out = path.join(WORK, 'clips', name);
  fs.rmSync(out, { recursive: true, force: true });
  fs.mkdirSync(out, { recursive: true });
  const page = await browser.newPage({ viewport: VIEW, deviceScaleFactor: 2 });
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  if (clip.save) {
    const txt = fs.readFileSync(path.join(WORK, 'saves', clip.save + '.json'), 'utf8');
    await page.addInitScript((t) => {
      if (!sessionStorage.getItem('seeded')) {
        localStorage.setItem('loorush.save', t);
        localStorage.setItem('loorush.save.bak', t);
        sessionStorage.setItem('seeded', '1');
      }
    }, txt);
  }
  await page.addInitScript(TIMECAP);
  await page.goto(`http://localhost:${port}/?insets=59,34`);
  let frame = 0;
  const ctx = {
    page,
    wait: (ms) => page.waitForTimeout(ms),
    ev: (code) => page.evaluate(code),
    tid: (id) => page.getByTestId(id).first().click({ timeout: 8000, force: true }),
    /** Advance virtual time without recording (manual mode). */
    async skip(seconds, perFrame = '') {
      await page.evaluate('__tc.setManual(true)');
      for (let i = 0; i < Math.round(seconds * FPS); i++) await page.evaluate(`(() => { ${perFrame} })(); __tc.advance(${1000 / FPS})`);
    },
    /** Record `seconds` of footage; perFrame runs in the page before each frame. */
    async film(seconds, perFrame = '') {
      await page.evaluate('__tc.setManual(true)');
      const n = Math.round(seconds * FPS);
      for (let i = 0; i < n; i++) {
        await page.evaluate(`(() => { ${perFrame} })(); __tc.advance(${1000 / FPS})`);
        frame++;
        states.push(await page.evaluate(`(() => { const s = globalThis.__game && __game.sim && __game.sim.s; return s ? [Math.round(__tc.t), s.phase, +s.x.toFixed(2), +s.z.toFixed(2), s.count] : [Math.round(__tc.t)]; })()`));
        await page.screenshot({ path: path.join(out, String(frame).padStart(5, '0') + '.jpg'), type: 'jpeg', quality: 92 });
      }
    },
    /** Tap a real button at a given point of the recording (keeps filming). */
    async tapFilm(id, seconds, perFrame = '') {
      const box = await page.getByTestId(id).first().boundingBox();
      await page.evaluate(`window.__tap = ${JSON.stringify(box)}`);
      await page.getByTestId(id).first().click({ force: true });
      await ctx.film(seconds, perFrame);
    },
    mark: async (label) => {
      const t = await page.evaluate('__tc.t');
      marks.push({ label, frame, t });
    },
  };
  const marks = [];
  const states = [];
  const t0 = Date.now();
  const startT = { t: 0 };
  ctx.onFilmStart = async () => (startT.t = await page.evaluate('__tc.t'));
  await clip.run(ctx);
  const sounds = await page.evaluate('__tc.sounds');
  fs.writeFileSync(path.join(out, 'meta.json'), JSON.stringify({ frames: frame, fps: FPS, marks, sounds, errors, states }));
  console.log(`${name}: ${frame} frames in ${((Date.now() - t0) / 1000).toFixed(0)}s`, errors.length ? errors.slice(0, 3) : 'ok');
  await page.close();
}

(async () => {
  const which = process.argv[2] ?? 'all';
  const names = which === 'all' ? Object.keys(CLIPS) : which.split(',');
  const server = http.createServer((req, res) => handler(req, res, { public: WEB, cleanUrls: false, rewrites: [{ source: '**', destination: '/index.html' }] }));
  await new Promise((r) => server.listen(0, r));
  const browser = await chromium.launch({
    executablePath: process.env.CHROMIUM || '/opt/pw-browsers/chromium',
    args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required'],
  });
  for (const n of names) await filmClip(browser, server.address().port, n, CLIPS[n]);
  await browser.close();
  server.close();
})();
