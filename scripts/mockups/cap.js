// Captures real app screens for the mockups. node cap.js <scenario|all>
const http = require('http'); const handler = require('serve-handler'); const { chromium } = require('playwright'); const fs = require('fs');
const P = process.env.MOCKUP_WORK || require('path').resolve(__dirname, '../../.mockups');
const WEB = P + '/webdev';
const OUT = P + '/shots';
fs.mkdirSync(OUT, { recursive: true });

const HELPERS = `
window.ffUntil = (pred, steer, maxSec = 80) => { const g = __game; let t = 0; while (t < maxSec && !pred(g.sim) && !g.sim.finished) { g.debugFastForward(0.05, steer); t += 0.05; } return t; };
window.closeAll = () => document.querySelectorAll('[aria-label=Close]').forEach((e) => e.click());
`;

function scenarios(page, shot, tid, wait, ev, freezeShot) {
  return {
    async fresh() {
      await wait(300); await shot('02_boot');
      await wait(4500); await shot('04b_home_world1');
      await tid('btn-play'); await wait(1800); await shot('03_onboarding');
      await ev(`ffUntil((s) => s.s.z > 22)`); await freezeShot('03b_tutorial_gate', 2200);
    },
    async meta() {
      await wait(5000); await shot('19_daily');
      await tid('btn-claim-daily'); await wait(1800); await shot('18_rewards');
      await tid('btn-reward-ok'); await wait(1500); await shot('04_home');
      await tid('btn-missions'); await wait(1300); await shot('20_missions');
      await tid('tab-ach'); await wait(1000); await shot('06_progression');
      await ev('closeAll()'); await wait(700);
      await tid('btn-worlds'); await wait(1300); await shot('05_worlds');
      await ev('closeAll()'); await wait(700);
      await tid('btn-challenges'); await wait(1300); await shot('21_challenges');
      await ev('closeAll()'); await wait(700);
      await tid('btn-shop'); await wait(1500); await shot('27_remove_ads_offer');
      await page.mouse.move(195, 600); await page.mouse.wheel(0, 900); await wait(1200); await shot('22_shop');
      await ev('closeAll()'); await wait(700);
      await tid('btn-skins'); await wait(1500); await tid('skin-robot'); await wait(2600); await shot('23_characters');
      await tid('skin-golden'); await wait(2600); await shot('24_skins');
      await ev('closeAll()'); await wait(900);
      await tid('btn-chest'); await wait(1200); await shot('25a_chests');
      await tid('open-epic'); await wait(500); await shot('25b_chest_opening'); await wait(2600); await shot('25_chests');
      await tid('btn-chest-ok'); await wait(600); await ev('closeAll()'); await wait(700);
      await tid('btn-settings'); await wait(1300); await shot('26_settings');
    },
    async run25() {
      await wait(4500);
      await tid('btn-play'); await wait(2000); await shot('07_level_start');
      await ev(`__game.debugFastForward(4)`); await freezeShot('08_gameplay', 2500);
      await ev(`ffUntil((s) => s.s.phase === 'battle')`); await ev(`__game.debugFastForward(0.5)`); await freezeShot('14b_rival_battle', 2500);
      await ev(`ffUntil((s) => s.s.phase === 'finish')`); await ev(`__game.debugFastForward(1.6)`); await freezeShot('15_finish', 2500);
      await ev(`ffUntil((s) => s.s.phase === 'won')`); await wait(9000); await shot('16_victory');
      await tid('btn-triple'); await wait(1300); await shot('29_rewarded_ad');
      await wait(3600); await tid('devad-done'); await wait(2500); await shot('16b_victory_tripled');
    },
    async purchase() {
      await wait(4500);
      await tid('btn-shop'); await wait(1500); await tid('buy-removeads'); await wait(1200); await shot('28_purchase');
      await tid('devpay-confirm'); await wait(1200); await shot('28b_purchase_done');
    },
    async defeat() {
      await wait(4500);
      await tid('btn-play'); await wait(800); await ev(`__game.debugFastForward(7)`); await ev(`(() => { __game.sim.s.count = 0; return 1; })()`);
      await wait(6500); await shot('17a_revive');
      await tid('btn-revive-no'); await wait(4500); await shot('17_defeat');
    },
    async boss() {
      await wait(4500);
      await tid('btn-play'); await wait(800);
      await ev(`ffUntil((s) => s.s.phase === 'battle' && s.s.rivals[s.s.activeRival] && s.s.rivals[s.s.activeRival].boss, undefined, 120)`); await ev(`__game.debugFastForward(0.25)`); await freezeShot('14c_boss', 2500);
      await ev(`__game.debugFreeze = false; ffUntil((s) => s.s.phase === 'won', undefined, 120)`); await wait(9000);
      await tid('btn-next'); await wait(5000); await shot('30_new_world');
    },
    async obstacles() {
      await wait(4500);
      await tid('btn-play'); await wait(800);
      await ev(`ffUntil((s) => s.level.obstacles.some((o) => o.kind === 'stomper' && o.z - s.s.z < 16 && o.z - s.s.z > 6))`); await freezeShot('13_obstacles', 2500);
    },
    async strategy() {
      await wait(4500);
      await tid('btn-play'); await wait(800);
      await ev(`ffUntil((s) => s.level.gateRows.some((r) => r.gates.some((g) => g.op.kind === 'cond' || g.op.kind === 'mystery' || g.timed) && r.z - s.s.z < 13 && r.z - s.s.z > 7) || s.level.obstacles.some((o) => o.kind === 'turnstile' && o.z - s.s.z < 12 && o.z - s.s.z > 6))`); await freezeShot('14_strategy', 2500);
    },
    async sequence() {
      await wait(4500);
      await tid('btn-play'); await wait(2000); await shot('seq01_start');
      await ev(`__game.debugFastForward(2.2)`); await freezeShot('seq02_advance', 2400);
      await ev(`ffUntil((s) => s.s.z > 102 - 22)`); await freezeShot('seq03_gates_ahead', 2400);
      await ev(`ffUntil((s) => s.s.z > 102 - 11, 0)`); await freezeShot('seq04_gates_labels', 2400);
      await ev(`ffUntil((s) => s.s.z > 102 - 3, 0)`); await freezeShot('seq05_choose_x5', 2400);
      await ev(`ffUntil((s) => s.s.z > 102.6, 0)`); await freezeShot('seq06_grows', 1400);
      await ev(`(() => { const s = __game.sim; window.__lost = s.s.stats.lost; const o = s.level.obstacles.find((o) => o.z > s.s.z + 8 && o.kind !== 'blower'); window.__o = o; return o && o.kind; })()`);
      await ev(`ffUntil((s) => window.__o.z - s.s.z < 11)`); await freezeShot('seq07_obstacle', 2400);
      await ev(`ffUntil((s) => window.__o.z - s.s.z < 4)`); await freezeShot('seq08_dodge', 2400);
      await ev(`ffUntil((s) => s.level.gateRows.some((r) => r.z > 110 && r.z - s.s.z < 12 && r.z - s.s.z > 6) || s.s.phase === 'battle')`); await freezeShot('seq09_decision', 2400);
      await ev(`ffUntil((s) => s.s.phase === 'finish')`); await ev(`__game.debugFastForward(0.4)`); await freezeShot('seq10_arrival', 2400);
      await ev(`ffUntil((s) => s.s.phase === 'won')`); await ev(`__game.debugFastForward(0.3)`); await freezeShot('seq11_victory', 1800);
      await ev(`__game.debugFreeze = false`); await wait(9000); await shot('seq12_reward');
    },
    async shrink() {
      await wait(4500);
      await tid('btn-play'); await wait(800);
      await ev(`ffUntil((s) => s.s.z > 105)`);
      await ev(`(() => { const s = __game.sim; const o = s.level.obstacles.find((o) => o.z > s.s.z + 6 && (o.kind === 'wall' || o.kind === 'sweeper' || o.kind === 'stomper')); window.__o = o; window.__lost = s.s.stats.lost; return o && o.kind; })()`);
      await ev(`ffUntil((s) => s.s.stats.lost > window.__lost + 8, window.__o.x)`); await ev(`__game.debugFastForward(0.12, window.__o.x)`); await freezeShot('12_shrinks', 1500);
    },
    async grows() {
      await wait(4500);
      await tid('btn-play'); await wait(800);
      await ev(`ffUntil((s) => s.s.z > 102 - 9, 0)`); await freezeShot('10_multi_choice', 2400);
      await ev(`ffUntil((s) => s.s.z > 102.4, 0)`); await freezeShot('11_grows', 1300);
      await ev(`ffUntil((s) => s.s.z > 60, 0)`);
    },
  };
}

const SAVES = { fresh: null, meta: 's25o', run25: 's25c', purchase: 's25c', defeat: 's25c', boss: 's20', obstacles: 's45', strategy: 's57', sequence: 's86', shrink: 's86', grows: 's86' };

(async () => {
  const which = process.argv[2] ?? 'all';
  const names = which === 'all' ? Object.keys(SAVES) : which.split(',');
  const server = http.createServer((req, res) => handler(req, res, { public: WEB, rewrites: [{ source: '**', destination: '/index.html' }] }));
  await new Promise((r) => server.listen(0, r));
  const port = server.address().port;
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  for (const name of names) {
    const page = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 3 });
    const errors = [];
    page.on('pageerror', (e) => { if (!/play\(\) failed/.test(e.message)) errors.push(e.message); });
    const save = SAVES[name];
    if (save) {
      const txt = fs.readFileSync(`${P}/${save}.json`, 'utf8');
      await page.addInitScript((t) => { if (!sessionStorage.getItem('seeded')) { localStorage.setItem('loorush.save', t); localStorage.setItem('loorush.save.bak', t); sessionStorage.setItem('seeded', '1'); } }, txt);
    }
    await page.addInitScript(HELPERS);
    await page.goto(`http://localhost:${port}/?insets=59,34`);
    const shot = (n) => page.screenshot({ path: `${OUT}/${n}.png` });
    const wait = (ms) => page.waitForTimeout(ms);
    const tid = (id) => page.getByTestId(id).first().click({ timeout: 6000, force: true }).catch(() => errors.push('TIDFAIL ' + id));
    const ev = (code) => page.evaluate(code).catch((e) => errors.push('EVAL ' + e.message.split('\n')[0]));
    const freezeShot = async (n, ms) => { await ev('__game.debugFreeze = true'); await wait(ms); await shot(n); await ev('__game.debugFreeze = false'); };
    const t0 = Date.now();
    await scenarios(page, shot, tid, wait, ev, freezeShot)[name]();
    console.log(name, ((Date.now() - t0) / 1000).toFixed(0) + 's', errors.length ? errors : 'ok');
    await page.close();
  }
  await browser.close(); server.close();
})();
