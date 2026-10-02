import { applyOp, activeOp, gateLabelLines } from '../src/core/gates';
import { generateLevel } from '../src/core/levelGen';
import { Simulation } from '../src/core/simulation';
import { plannerBot, randomBot } from '../src/core/bot';
import { Rng } from '../src/core/rng';
import { difficultyFor } from '../src/core/difficulty';
import { getWorld, worldOfLevel } from '../src/core/worlds';
import { formatCount } from '../src/core/format';
import { TRACK, CROWD } from '../src/core/config';

describe('gates', () => {
  it('applies every operation with integer results and clamps', () => {
    expect(applyOp({ kind: 'add', n: 10 }, 5)).toBe(15);
    expect(applyOp({ kind: 'sub', n: 10 }, 5)).toBe(0);
    expect(applyOp({ kind: 'mul', n: 3 }, 7)).toBe(21);
    expect(applyOp({ kind: 'div', n: 2 }, 7)).toBe(3);
    expect(applyOp({ kind: 'div', n: 3 }, 1)).toBe(0);
    expect(applyOp({ kind: 'pct', n: 50 }, 10)).toBe(15);
    expect(applyOp({ kind: 'pct', n: -30 }, 10)).toBe(7);
    expect(applyOp({ kind: 'mystery', hidden: { kind: 'mul', n: 2 } }, 4)).toBe(8);
    const cond = { kind: 'cond', threshold: 30, below: { kind: 'mul', n: 3 }, above: { kind: 'sub', n: 10 } } as const;
    expect(applyOp(cond, 10)).toBe(30);
    expect(applyOp(cond, 40)).toBe(30);
    expect(applyOp({ kind: 'mul', n: 10 }, CROWD.maxCount)).toBe(CROWD.maxCount);
  });
  it('alternates timed gates', () => {
    const g = { x0: 0, x1: 1, op: { kind: 'mul', n: 3 } as const, timed: { alt: { kind: 'div', n: 2 } as const, period: 1 } };
    expect(activeOp(g, 0.5).kind).toBe('mul');
    expect(activeOp(g, 1.5).kind).toBe('div');
  });
  it('produces labels', () => {
    expect(gateLabelLines({ kind: 'mul', n: 5 }).big).toBe('x5');
    expect(gateLabelLines({ kind: 'mystery', hidden: { kind: 'add', n: 1 } }).big).toBe('?');
  });
});

describe('level generation', () => {
  it('is deterministic', () => {
    expect(JSON.stringify(generateLevel(37))).toBe(JSON.stringify(generateLevel(37)));
    expect(JSON.stringify(generateLevel(37))).not.toBe(JSON.stringify(generateLevel(38)));
  });
  it('is not a modulo loop: far levels differ from early ones', () => {
    const a = JSON.stringify(generateLevel(15).gateRows);
    for (const off of [10, 20, 40, 80, 800]) expect(JSON.stringify(generateLevel(15 + off).gateRows)).not.toBe(a);
  });
  it('produces valid levels from 1 to 3000 and sampled extremes', () => {
    const levels = [...Array.from({ length: 3000 }, (_, i) => i + 1), 10_000, 123_456, 9_999_999];
    for (const L of levels) {
      const d = generateLevel(L);
      expect(d.length).toBeGreaterThan(150);
      expect(Number.isFinite(d.speed)).toBe(true);
      expect(d.speed).toBeLessThan(16);
      expect(d.finish.stepCost).toBeGreaterThanOrEqual(1);
      for (const r of d.gateRows) {
        expect(r.z).toBeGreaterThan(0);
        expect(r.z).toBeLessThan(d.length);
        for (const g of r.gates) {
          expect(g.x1).toBeGreaterThan(g.x0);
          const op = g.op;
          if (op.kind !== 'mystery' && op.kind !== 'cond') expect(Number.isFinite(op.n) && op.n !== 0).toBe(true);
        }
      }
      for (const o of d.obstacles) {
        expect(Math.abs(o.x)).toBeLessThanOrEqual(TRACK.width / 2 + 0.01);
        expect(o.z).toBeLessThan(d.length);
      }
      for (const r of d.rivals) expect(r.count).toBeGreaterThan(0);
    }
  });
  it('gets harder over time', () => {
    const a = difficultyFor(5), b = difficultyFor(200), c = difficultyFor(20_000);
    expect(b.speed).toBeGreaterThan(a.speed);
    expect(b.rivalRatio).toBeGreaterThan(a.rivalRatio);
    expect(c.gap).toBeLessThanOrEqual(b.gap);
    expect(c.speed).toBeLessThan(15);
  });
  it('maps levels to worlds forever', () => {
    expect(worldOfLevel(1)).toBe(1);
    expect(worldOfLevel(10)).toBe(1);
    expect(worldOfLevel(11)).toBe(2);
    expect(getWorld(9).cycle).toBe(1);
    expect(getWorld(9).displayName.en).toContain('II');
    expect(getWorld(100000).mutators.length).toBeGreaterThan(0);
  });
});

describe('simulation', () => {
  it('a gate changes the count', () => {
    const def = generateLevel(1);
    const sim = new Simulation(def);
    sim.start();
    sim.setTarget(-3); // +15 lane
    while (sim.s.z < 40) sim.step(1 / 60);
    const gate = sim.drainEvents().find((e) => e.type === 'gate');
    expect(gate && gate.type === 'gate' && gate.after).toBe(20);
  });
  it('the tutorial is beatable and the planner wins early worlds', () => {
    for (let L = 1; L <= 25; L++) expect(plannerBot(new Simulation(generateLevel(L))).won).toBe(true);
  });
  it('random play loses more than the planner (decisions matter)', () => {
    let p = 0, r = 0;
    for (let L = 30; L < 50; L++) {
      if (plannerBot(new Simulation(generateLevel(L))).won) p++;
      if (randomBot(new Simulation(generateLevel(L)), new Rng(L)).won) r++;
    }
    expect(p).toBeGreaterThan(r + 8);
  });
  it('very high levels remain beatable with a revive', () => {
    let wins = 0;
    for (let L = 50_000; L < 50_010; L++) if (plannerBot(new Simulation(generateLevel(L)), { revive: true }).won) wins++;
    expect(wins).toBeGreaterThanOrEqual(7);
  });
  it('a crowd of 1 can die and be revived once', () => {
    const def = generateLevel(30);
    const sim = new Simulation(def);
    sim.s.count = 1; sim.s.layoutM = 1;
    sim.start();
    let guard = 0;
    while (!sim.finished && guard++ < 10000) { sim.setTarget(def.obstacles[0]?.x ?? 0); sim.step(1 / 60); }
    if (sim.s.phase === 'lost') {
      expect(sim.canRevive()).toBe(true);
      sim.revive(12);
      expect(sim.s.count).toBe(12);
      expect(sim.canRevive()).toBe(false);
    }
  });
  it('handles huge crowds and successive multipliers', () => {
    const def = generateLevel(40);
    const sim = new Simulation(def, 0);
    sim.s.count = 9_000_000; sim.s.layoutM = 220;
    const res = plannerBot(sim);
    expect(Number.isFinite(res.finishCount)).toBe(true);
    expect(sim.s.count).toBeLessThanOrEqual(CROWD.maxCount);
  });
  it('clones are independent', () => {
    const sim = new Simulation(generateLevel(12));
    sim.start();
    for (let i = 0; i < 100; i++) sim.step(1 / 60);
    const c = sim.clone();
    for (let i = 0; i < 100; i++) c.step(1 / 60);
    expect(c.s.z).toBeGreaterThan(sim.s.z);
    expect(sim.s.dead).not.toBe(c.s.dead);
  });
});

describe('format', () => {
  it('formats', () => {
    expect(formatCount(999)).toBe('999');
    expect(formatCount(1200)).toBe('1.2K');
    expect(formatCount(45_000)).toBe('45K');
    expect(formatCount(2_500_000)).toBe('2.5M');
  });
});

describe('finish corridor', () => {
  it('never contains obstacles, gates or pickups', () => {
    for (let L = 1; L < 400; L += 7) {
      const d = generateLevel(L);
      const lim = d.length - 6;
      expect(d.obstacles.every((o) => o.z < lim)).toBe(true);
      expect(d.gateRows.every((r) => r.z < lim)).toBe(true);
      expect(d.pickups.every((p) => p.z < lim)).toBe(true);
    }
  });
});
