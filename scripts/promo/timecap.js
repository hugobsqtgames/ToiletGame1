/**
 * Virtual clock injected into the app page (Playwright addInitScript) so the REAL
 * app can be filmed frame by frame at a perfect 30 fps, however slow the
 * (software) renderer is. performance.now, Date, requestAnimationFrame and timers
 * all run on a virtual time line:
 *  - "auto" mode (boot, menus): virtual time follows real time;
 *  - "manual" mode (filming): time only moves when __tc.advance(ms) is called.
 * Every sound the game starts is logged with its virtual timestamp, so the
 * soundtrack of the promo can replay the game's own SFX in sync.
 */
module.exports = `(() => {
  const realNow = performance.now.bind(performance);
  const realSetTimeout = window.setTimeout.bind(window);
  const realRaf = window.requestAnimationFrame.bind(window);
  const RealDate = Date;
  const dateBase = RealDate.now();
  const realBase = realNow();
  let vt = 0;
  let manual = false;
  let lastReal = realNow();
  let nextId = 1;
  const timers = new Map();
  let rafs = new Map();
  const sounds = [];

  performance.now = () => vt;
  class VDate extends RealDate {
    constructor(...a) { if (a.length === 0) super(dateBase + vt); else super(...a); }
    static now() { return dateBase + vt; }
  }
  window.Date = VDate;

  window.setTimeout = (fn, ms = 0, ...args) => { const id = nextId++; timers.set(id, { due: vt + Math.max(0, +ms || 0), fn, args, every: 0 }); return id; };
  window.setInterval = (fn, ms = 0, ...args) => { const id = nextId++; const every = Math.max(1, +ms || 0); timers.set(id, { due: vt + every, fn, args, every }); return id; };
  window.clearTimeout = window.clearInterval = (id) => { timers.delete(id); };
  window.requestAnimationFrame = (fn) => { const id = nextId++; rafs.set(id, fn); return id; };
  window.cancelAnimationFrame = (id) => { rafs.delete(id); };

  function runTimers(until) {
    for (let guard = 0; guard < 10000; guard++) {
      let best = null;
      for (const [id, t] of timers) if (t.due <= until && (!best || t.due < best[1].due)) best = [id, t];
      if (!best) break;
      const [id, t] = best;
      if (t.due > vt) vt = t.due;
      if (t.every) t.due += t.every; else timers.delete(id);
      try { typeof t.fn === 'function' ? t.fn(...t.args) : eval(t.fn); } catch (e) { console.error(e); }
    }
    vt = Math.max(vt, until);
  }
  function runFrame() {
    const list = rafs;
    rafs = new Map();
    for (const fn of list.values()) { try { fn(vt); } catch (e) { console.error(e); } }
  }
  function pump() {
    if (!manual) {
      const r = realNow();
      const d = Math.min(50, r - lastReal);
      lastReal = r;
      runTimers(vt + d);
      runFrame();
    }
    realRaf(pump);
  }
  realRaf(pump);
  // Keep timers alive even when rAF is throttled (background tabs).
  (function tick() { if (!manual) { const r = realNow(); const d = Math.min(50, r - lastReal); if (d > 30) { lastReal = r; runTimers(vt + d); } } realSetTimeout(tick, 20); })();

  const play = HTMLMediaElement.prototype.play;
  HTMLMediaElement.prototype.play = function () {
    const src = (this.currentSrc || this.src || '').split('/').pop().split('?')[0];
    sounds.push({ t: vt, src, vol: this.volume, rate: this.playbackRate });
    const p = play.call(this);
    return p && p.catch ? p.catch(() => {}) : p;
  };

  window.__tc = {
    get t() { return vt; },
    get manual() { return manual; },
    setManual(on) { manual = on; lastReal = realNow(); },
    /** Advance virtual time by ms in sub-steps; resolves after React has committed. */
    advance(ms, sub = 1) {
      for (let i = 0; i < sub; i++) { runTimers(vt + ms / sub); runFrame(); }
      return new Promise((r) => realSetTimeout(() => realSetTimeout(r, 0), 0));
    },
    sounds,
  };
})();`;
