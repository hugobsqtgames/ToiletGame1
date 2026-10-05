/**
 * Shot list of the promo: every clip is the REAL app, driven like a player would
 * (taps on real buttons, steering through the game controller). Saves come from
 * scripts/make-save.ts (see README). Times are virtual seconds at 30 fps.
 */
const CLOSE = `document.querySelectorAll('[aria-label=Close]').forEach((e) => e.click())`;
const AUTO = `__game.autoplay = true;`;
const ff = (pred, steer = 'undefined', max = 90) =>
  `(() => { const g = __game; let t = 0; while (t < ${max} && !(${pred})(g.sim) && !g.sim.finished) { g.debugFastForward(0.05, ${steer}); t += 0.05; } return t; })()`;

const boot = async (c, ms = 6500) => {
  await c.wait(ms);
};

/** A short gameplay shot of world N: lands just before an interesting gate row. */
const worldShot = (save) => ({
  save,
  async run(c) {
    await boot(c);
    await c.tid('btn-play');
    await c.wait(1200);
    await c.ev(AUTO);
    await c.ev(ff(`(s) => s.s.z > 40 && s.level.gateRows.some((r) => r.z - s.s.z > 15 && r.z - s.s.z < 19 && r.gates.some((g) => g.op.kind === 'mul'))`));
    await c.skip(0.5, AUTO); // let the renderer catch up after the jump
    await c.film(1.4, AUTO);
  },
});

module.exports = {
  /** Home screen (the 3D level is the menu) → tap PLAY → level card. */
  home: {
    save: 'l86',
    async run(c) {
      await boot(c, 8000);
      await c.film(3.2);
      await c.mark('tap-play');
      await c.tapFilm('btn-play', 2.2);
    },
  },

  /** Level 86 (same level as the screenshots): start, steering, the +90 / x5 / -9 row,
   *  a rival battle, the finish corridor and the results screen. */
  hero86: {
    save: 'l86',
    async run(c) {
      await boot(c);
      await c.tid('btn-play');
      await c.wait(1500);
      await c.mark('ready');
      await c.film(0.5);
      await c.ev('__game.startRun()');
      await c.mark('run');
      // Planner steering, then line up on the x5 gate at z = 102.
      await c.film(10.4, `const s = __game.sim.s; if (s.z > 84 && s.z < 104) { __game.autoplay = false; __game.sim.setTarget(0); } else { __game.autoplay = true; }`);
      await c.mark('x5-done');
      // Rival crowd at z = 150.
      await c.ev(AUTO + ff(`(s) => s.s.z > 129`));
      await c.skip(0.4, AUTO);
      await c.mark('battle');
      await c.film(4.2, AUTO);
      // Finish corridor + results.
      await c.ev(AUTO + ff(`(s) => s.s.z > s.level.finish.z - 30`));
      await c.skip(0.4, AUTO);
      await c.mark('finish');
      await c.film(9.5, AUTO);
    },
  },

  /** Level 45 (museum): giant plungers + sweeping mops. */
  obstacles45: {
    save: 'l45',
    async run(c) {
      await boot(c);
      await c.tid('btn-play');
      await c.wait(1200);
      await c.ev(AUTO + ff(`(s) => s.s.z > 141 - 27`));
      await c.skip(0.4, AUTO);
      await c.film(3.6, AUTO);
    },
  },

  w5: worldShot('w5'),
  w15: worldShot('w15'),
  w25: worldShot('w25'),
  w35: worldShot('w35'),
  w45: worldShot('w45'),
  w55: worldShot('w55'),
  w65: worldShot('w65'),
  w75: worldShot('w75'),

  /** Daily reward → skins (live 3D preview) → epic chest opening. */
  meta: {
    save: 'daily',
    async run(c) {
      await boot(c, 8000);
      await c.mark('daily');
      await c.film(1.2);
      await c.tapFilm('btn-claim-daily', 1.8);
      await c.ev(`document.querySelector('[data-testid=btn-reward-ok]')?.click()`);
      await c.skip(1.0);
      await c.mark('skins');
      await c.tapFilm('btn-skins', 1.4);
      await c.mark('golden');
      await c.tapFilm('skin-golden', 2.4);
      await c.ev(CLOSE);
      await c.skip(1.0);
      await c.mark('chest');
      await c.tapFilm('btn-chest', 1.0);
      await c.mark('open');
      await c.tapFilm('open-epic', 3.4);
    },
  },
};
