/**
 * Simulation monkey / stress tests: random (and hostile) finger input on
 * hundreds of levels, with invariants checked after EVERY step; determinism,
 * clone fidelity, revive rules, extreme crowds, performance.
 */
import { CROWD, LOGIC_MEMBER_CAP, SIM, TRACK } from '../src/core/config';
import { generateLevel } from '../src/core/levelGen';
import { Simulation, stallZ, type SimEvent, type SimPhase } from '../src/core/simulation';
import { bestTarget, plannerBot } from '../src/core/bot';
import { EDGE_NUMBERS, range, Rng } from '../test-utils/fuzz';
import { dailyChallengeLevel } from '../src/meta/progression';
import { defaultSave } from '../src/meta/save';
import type { LevelDef } from '../src/core/types';

const HALF = TRACK.width / 2;
const DT = SIM.fixedDt;

const LEGAL: Record<SimPhase, SimPhase[]> = {
  ready: ['ready', 'running'],
  running: ['running', 'battle', 'finish', 'lost'],
  battle: ['battle', 'running', 'lost'],
  finish: ['finish', 'won'],
  won: ['won'],
  lost: ['lost', 'running', 'finish'], // via revive
};

type Monkey = 'random' | 'jitter' | 'hostile' | 'edges' | 'idle' | 'planner';

/** One input per step depending on the monkey personality. */
function monkeyInput(sim: Simulation, rng: Rng, kind: Monkey, step: number) {
  switch (kind) {
    case 'random':
      if (step % 20 === 0) sim.setTarget(rng.range(-HALF, HALF));
      break;
    case 'jitter':
      sim.moveTarget(rng.range(-3, 3));
      break;
    case 'hostile':
      // Garbage the UI layer could theoretically produce.
      if (rng.chance(0.3)) sim.moveTarget(rng.pick(EDGE_NUMBERS));
      if (rng.chance(0.05)) sim.setTarget(rng.pick(EDGE_NUMBERS));
      if (rng.chance(0.01)) sim.start();
      break;
    case 'edges':
      if (step % 90 === 0) sim.setTarget(step % 180 === 0 ? -99 : 99);
      break;
    case 'idle':
      break;
    case 'planner':
      break;
  }
}

interface MonkeyRun {
  sim: Simulation;
  events: SimEvent[];
  steps: number;
}

/** Runs a level with a monkey, asserting invariants after each step. */
function runMonkey(def: LevelDef, seed: number, kind: Monkey, opts: { revive?: boolean; startBonus?: number } = {}): MonkeyRun {
  const rng = new Rng(seed);
  const sim = new Simulation(def, opts.startBonus ?? 0);
  const events: SimEvent[] = [];
  sim.start();
  let prevPhase: SimPhase = sim.s.phase;
  let prevZ = sim.s.z;
  let steps = 0;
  const fail = (msg: string) => {
    throw new Error(`L${def.level} seed ${seed} ${kind} step ${steps} (${sim.s.phase} z=${sim.s.z.toFixed(2)} n=${sim.s.count}): ${msg}`);
  };
  while (steps < 60 * 300) {
    monkeyInput(sim, rng, kind, steps);
    sim.step(DT);
    steps++;
    const s = sim.s;
    const evs = sim.drainEvents();
    events.push(...evs);
    // ---- state invariants ----
    if (!Number.isInteger(s.count) || s.count < 0 || s.count > CROWD.maxCount) fail(`bad count ${s.count}`);
    if (!Number.isFinite(s.x) || Math.abs(s.x) > HALF + 1e-9) fail(`bad x ${s.x}`);
    if (!Number.isFinite(s.targetX) || Math.abs(s.targetX) > HALF + 1e-9) fail(`bad targetX ${s.targetX}`);
    if (!Number.isFinite(s.z) || s.z < prevZ - 1e-9) fail(`z went backwards ${prevZ} -> ${s.z}`);
    if (s.layoutM < 0 || s.layoutM > LOGIC_MEMBER_CAP) fail(`layoutM ${s.layoutM}`);
    if (s.deadCount < 0 || s.deadCount > s.layoutM) fail(`deadCount ${s.deadCount}/${s.layoutM}`);
    let dead = 0;
    for (let i = 0; i < LOGIC_MEMBER_CAP; i++) dead += s.dead[i];
    if (dead !== s.deadCount) fail(`dead bitmap ${dead} != ${s.deadCount}`);
    if (s.count > 0 && sim.alive <= 0 && s.phase !== 'won') fail('alive crowd with no visible member');
    if (s.stats.peak < s.count && s.phase !== 'won') fail('peak below count');
    if (!LEGAL[prevPhase].includes(s.phase)) fail(`illegal transition ${prevPhase} -> ${s.phase}`);
    if (s.phase === 'battle' && (s.activeRival < 0 || !s.rivals[s.activeRival])) fail('battle without rival');
    for (const r of s.rivals) if (!Number.isFinite(r.x) || !Number.isFinite(r.z) || r.count < 0) fail('bad rival state');
    // ---- event invariants ----
    for (const e of evs) {
      switch (e.type) {
        case 'gate':
          if (e.after !== Math.max(0, Math.min(CROWD.maxCount, e.after)) || !Number.isInteger(e.after)) fail('gate after');
          break;
        case 'loss':
          if (!(e.amount > 0) || !Number.isInteger(e.amount)) fail(`loss amount ${e.amount}`);
          if (e.points.some((p) => !Number.isFinite(p.x) || !Number.isFinite(p.z))) fail('loss point');
          break;
        case 'gain':
          if (!(e.amount >= 0)) fail('gain amount');
          break;
        case 'won':
          if (!(e.finishCount >= 1)) fail(`won with finishCount ${e.finishCount}`);
          if (e.multiplier !== def.finish.multipliers[e.stallIndex]) fail('won multiplier');
          break;
        case 'stall':
          if (Math.abs(sim.s.z - stallZ(def, e.index)) > def.speed * DT + 1e-6) fail('stall position');
          break;
      }
    }
    if (s.phase === 'lost' && opts.revive && sim.canRevive()) {
      sim.revive(Math.max(10, Math.ceil(s.stats.peak * 0.35)));
      events.push(...sim.drainEvents());
    }
    prevPhase = s.phase;
    prevZ = s.z;
    if (sim.finished) break;
  }
  if (!sim.finished) fail('run never ended (stuck)');
  // A finished simulation is inert.
  const snap = JSON.stringify({ ...sim.s, dead: [...sim.s.dead] });
  for (let i = 0; i < 30; i++) {
    sim.moveTarget(1);
    sim.step(DT);
  }
  if (JSON.stringify({ ...sim.s, dead: [...sim.s.dead] }) !== snap) fail('finished sim still changes');
  if (sim.drainEvents().length) fail('finished sim emits events');
  return { sim, events, steps };
}

const MONKEYS: Monkey[] = ['random', 'jitter', 'hostile', 'edges', 'idle'];

describe('monkey runs: 5 personalities × 60 levels', () => {
  const levels = [...range(1, 30), ...range(31, 400, 13), 1000, 5000, 77_777, 1_000_000];
  it.each(levels)('level %i survives every monkey with all invariants', (L) => {
    const def = generateLevel(L);
    for (const m of MONKEYS) runMonkey(def, L * 7 + m.length, m);
  });
});

describe('monkey runs with revive', () => {
  it.each(range(1, 30).map((i) => i * 17))('level %i: revive keeps invariants', (L) => {
    const def = generateLevel(L);
    for (const seed of [1, 2, 3]) {
      const r = runMonkey(def, seed, 'random', { revive: true });
      const revives = r.events.filter((e) => e.type === 'revived').length;
      expect(revives).toBeLessThanOrEqual(1);
    }
  });
});

describe('daily challenges under monkeys', () => {
  it.each(range(0, 11))('month %i', (m) => {
    const now = new Date(2027, m, 15, 12).getTime();
    const def = dailyChallengeLevel({ ...defaultSave(now), level: 1 + m * 37 }, now);
    for (const k of MONKEYS) runMonkey(def, m, k);
  });
});

describe('start bonus extremes', () => {
  it.each([0, 1, 50, 120, 219, 220, 221, 5000, 9_999_999])('start bonus %i', (b) => {
    runMonkey(generateLevel(45), b, 'random', { startBonus: b });
  });
});

describe('determinism', () => {
  it.each(range(1, 12).map((i) => i * 23))('level %i: identical inputs give identical runs', (L) => {
    const a = runMonkey(generateLevel(L), 99, 'jitter');
    const b = runMonkey(generateLevel(L), 99, 'jitter');
    expect(JSON.stringify(a.events)).toBe(JSON.stringify(b.events));
    expect(a.sim.s.count).toBe(b.sim.s.count);
  });
});

describe('clone fidelity', () => {
  it.each(range(1, 12).map((i) => i * 19))('level %i: a clone replays exactly like the original', (L) => {
    const def = generateLevel(L);
    const sim = new Simulation(def);
    sim.start();
    const rng = new Rng(L);
    for (let i = 0; i < 400 && !sim.finished; i++) {
      sim.setTarget(rng.range(-HALF, HALF));
      sim.step(DT);
    }
    sim.drainEvents();
    const c = sim.clone();
    const r1 = new Rng(5), r2 = new Rng(5);
    for (let i = 0; i < 1500; i++) {
      sim.moveTarget(r1.range(-1, 1));
      c.moveTarget(r2.range(-1, 1));
      sim.step(DT);
      c.step(DT);
    }
    expect(JSON.stringify(c.drainEvents())).toBe(JSON.stringify(sim.drainEvents()));
    expect(JSON.stringify({ ...c.s, dead: [...c.s.dead] })).toBe(JSON.stringify({ ...sim.s, dead: [...sim.s.dead] }));
  });
});

describe('revive rules', () => {
  function killed(L: number): Simulation {
    const sim = new Simulation(generateLevel(L));
    sim.s.count = 1;
    sim.s.layoutM = 1;
    sim.start();
    const rng = new Rng(L);
    for (let i = 0; i < 60 * 200 && !sim.finished; i++) {
      sim.setTarget(rng.range(-HALF, HALF));
      sim.step(DT);
    }
    return sim;
  }
  it('cannot revive a running, won or ready simulation', () => {
    const sim = new Simulation(generateLevel(5));
    expect(sim.canRevive()).toBe(false);
    sim.revive(50);
    expect(sim.s.count).toBe(5);
    sim.start();
    sim.revive(50);
    expect(sim.s.phase).toBe('running');
  });
  it.each(range(20, 60, 4))('level %i: one revive at most, with a sane count', (L) => {
    const sim = killed(L);
    if (sim.s.phase !== 'lost') return;
    expect(sim.canRevive()).toBe(true);
    sim.revive(NaN);
    expect(Number.isFinite(sim.s.count) && sim.s.count >= 1).toBe(true);
    // A second death cannot be revived.
    sim.s.count = 0;
    sim.s.phase = 'lost';
    expect(sim.canRevive()).toBe(false);
  });
  it('revive past the finish line resumes the finish with a real finish count', () => {
    const def = generateLevel(12);
    const sim = new Simulation(def);
    sim.start();
    sim.s.z = def.finish.z + 0.01;
    sim.s.count = 0;
    sim.s.phase = 'lost';
    sim.revive(30);
    expect(sim.s.phase).toBe('finish');
    let won: SimEvent | undefined;
    for (let i = 0; i < 60 * 60 && !sim.finished; i++) {
      sim.step(DT);
      won = sim.drainEvents().find((e) => e.type === 'won') ?? won;
    }
    expect(won && won.type === 'won' && won.finishCount).toBe(30);
  });
  it('revive in the middle of a battle clears that rival', () => {
    for (let L = 11; L < 80; L++) {
      const def = generateLevel(L);
      if (!def.rivals.length) continue;
      const sim = new Simulation(def);
      sim.start();
      sim.s.count = 2;
      sim.s.layoutM = 2;
      for (let i = 0; i < 60 * 200 && !sim.finished; i++) {
        sim.setTarget(def.rivals[0].x);
        sim.step(DT);
      }
      if (sim.s.phase !== 'lost' || sim.s.lossCause !== 'rival') continue;
      const id = sim.s.activeRival;
      sim.revive(40);
      expect(sim.s.activeRival).toBe(-1);
      if (id >= 0) expect(sim.s.rivals[id].defeated).toBe(true);
      return;
    }
  });
});

describe('extreme crowds', () => {
  it.each([221, 1000, 50_000, 1_000_000, CROWD.maxCount])('crowd of %i through a full level', (n) => {
    const def = generateLevel(64);
    const sim = new Simulation(def);
    sim.s.count = n;
    sim.s.layoutM = Math.min(n, LOGIC_MEMBER_CAP);
    sim.s.stats.peak = n;
    sim.start();
    const rng = new Rng(n);
    for (let i = 0; i < 60 * 300 && !sim.finished; i++) {
      sim.setTarget(rng.range(-HALF, HALF));
      sim.step(DT);
      expect(sim.s.count).toBeLessThanOrEqual(CROWD.maxCount);
    }
    expect(sim.finished).toBe(true);
  });
  it('a crowd of 1 at full speed never produces fractional members', () => {
    for (let L = 2; L < 60; L++) {
      const sim = new Simulation(generateLevel(L));
      sim.start();
      for (let i = 0; i < 60 * 120 && !sim.finished; i++) {
        sim.step(DT);
        expect(Number.isInteger(sim.s.count)).toBe(true);
      }
    }
  });
});

describe('frame-time robustness', () => {
  it.each([1 / 30, 1 / 120, 1 / 240, 0])('dt=%f keeps invariants', (dt) => {
    const sim = new Simulation(generateLevel(33));
    sim.start();
    for (let i = 0; i < 20_000 && !sim.finished; i++) {
      sim.setTarget(Math.sin(i / 50) * HALF);
      sim.step(dt);
      expect(Number.isFinite(sim.s.z) && Number.isInteger(sim.s.count)).toBe(true);
    }
  });
  it('a hostile dt (NaN / Infinity / negative) never corrupts the state', () => {
    for (const dt of [NaN, Infinity, -1, -Infinity, 1e9]) {
      const sim = new Simulation(generateLevel(33));
      sim.start();
      sim.step(DT);
      sim.step(dt);
      sim.step(DT);
      expect(Number.isFinite(sim.s.t)).toBe(true);
      expect(Number.isFinite(sim.s.z)).toBe(true);
      expect(Number.isInteger(sim.s.count)).toBe(true);
    }
  });
});

describe('performance', () => {
  it('one step with a full 220-member crowd costs < 0.25 ms on average', () => {
    const def = generateLevel(150);
    const sim = new Simulation(def);
    sim.s.count = 5000;
    sim.s.layoutM = 220;
    sim.start();
    let steps = 0;
    const t0 = performance.now();
    while (!sim.finished && steps < 20_000) {
      sim.setTarget(Math.sin(steps / 40) * 3);
      sim.step(DT);
      steps++;
    }
    expect((performance.now() - t0) / steps).toBeLessThan(0.25);
  });
  it('the in-game autopilot (menu demo) picks a target in < 25 ms', () => {
    const sim = new Simulation(generateLevel(120));
    sim.start();
    for (let i = 0; i < 300; i++) sim.step(DT);
    bestTarget(sim, 1.6); // warm-up (JIT)
    const t0 = performance.now();
    for (let i = 0; i < 10; i++) bestTarget(sim, 1.6);
    expect((performance.now() - t0) / 10).toBeLessThan(25);
  });
});

describe('balance smoke (planner) for every base world boss', () => {
  it.each([10, 20, 30, 40, 50, 60, 70, 80, 90])('boss level %i is winnable by the planner (with a revive)', (L) => {
    expect(plannerBot(new Simulation(generateLevel(L)), { revive: true }).won).toBe(true);
  });
});
