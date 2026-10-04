/**
 * Level generator stress test: structural invariants for every level 1..200
 * individually, then thousands more in chunks, extreme level numbers, daily
 * challenges for a whole year and every world (base + remix).
 */
import { TRACK, LEVELS_PER_WORLD } from '../src/core/config';
import { generateLevel, FINISH_MULTIPLIERS } from '../src/core/levelGen';
import { BASE_WORLD_COUNT, getWorld, unlockedMechanics, worldOfLevel, isBossLevel } from '../src/core/worlds';
import { difficultyFor } from '../src/core/difficulty';
import { dailyChallengeLevel } from '../src/meta/progression';
import { defaultSave } from '../src/meta/save';
import type { GateOp, LevelDef, MechanicId, SimpleGateOp } from '../src/core/types';
import { chunks, findNonFinite, range } from '../test-utils/fuzz';

const HALF = TRACK.width / 2;
const EPS = 1e-6;

function checkSimple(op: SimpleGateOp, where: string) {
  if (!Number.isFinite(op.n)) throw new Error(`${where}: non-finite n`);
  if (!Number.isInteger(op.n)) throw new Error(`${where}: fractional ${op.kind} ${op.n}`);
  if (op.kind === 'pct') {
    if (op.n === 0 || op.n <= -100) throw new Error(`${where}: bad pct ${op.n}`);
  } else if (op.kind === 'mul' || op.kind === 'div') {
    if (op.n < 2) throw new Error(`${where}: useless ${op.kind}${op.n}`);
  } else if (op.n < 1) throw new Error(`${where}: ${op.kind} ${op.n}`);
}

function checkOp(op: GateOp, where: string) {
  if (op.kind === 'mystery') return checkSimple(op.hidden, where + '.hidden');
  if (op.kind === 'cond') {
    if (!Number.isInteger(op.threshold) || op.threshold < 1) throw new Error(`${where}: threshold ${op.threshold}`);
    checkSimple(op.below, where + '.below');
    return checkSimple(op.above, where + '.above');
  }
  checkSimple(op, where);
}

/** Throws a descriptive error on the first violated invariant. */
export function validateLevel(d: LevelDef) {
  const tag = `L${d.level}`;
  const bad = findNonFinite(d);
  if (bad) throw new Error(`${tag}: non-finite number at ${bad}`);
  if (d.length < 150) throw new Error(`${tag}: too short ${d.length}`);
  if (d.finish.z !== d.length) throw new Error(`${tag}: finish z`);
  if (d.speed <= 0 || d.speed >= 16) throw new Error(`${tag}: speed ${d.speed}`);
  if (d.startCount < 1) throw new Error(`${tag}: start`);
  if (d.expectedFinish < 1) throw new Error(`${tag}: expectedFinish`);
  if (!Number.isInteger(d.finish.stepCost) || d.finish.stepCost < 1) throw new Error(`${tag}: stepCost`);
  if (d.finish.multipliers.length < 2) throw new Error(`${tag}: multipliers`);
  for (let i = 1; i < d.finish.multipliers.length; i++) if (!(d.finish.multipliers[i] > d.finish.multipliers[i - 1])) throw new Error(`${tag}: multipliers not ascending`);

  // Unique ids across every entity kind (the renderer keys visuals on them).
  const ids = [...d.gateRows.map((r) => r.id), ...d.obstacles.map((o) => o.id), ...d.pickups.map((p) => p.id), ...d.rivals.map((r) => r.id)];
  if (new Set(ids).size !== ids.length) throw new Error(`${tag}: duplicate ids`);

  const limit = d.length - 6;
  for (const r of d.gateRows) {
    if (r.z <= 0 || r.z >= limit) throw new Error(`${tag}: row z ${r.z}`);
    if (r.gates.length < 1 || r.gates.length > 3) throw new Error(`${tag}: ${r.gates.length} gates`);
    const amp = r.moving?.amp ?? 0;
    if (r.moving && (r.moving.amp <= 0 || r.moving.freq <= 0)) throw new Error(`${tag}: moving params`);
    for (let i = 0; i < r.gates.length; i++) {
      const g = r.gates[i];
      if (!(g.x1 - g.x0 > 1.5)) throw new Error(`${tag}: gate too narrow ${g.x1 - g.x0}`);
      if (g.x0 - amp < -HALF - EPS || g.x1 + amp > HALF + EPS) throw new Error(`${tag}: gate off track`);
      if (i > 0 && Math.abs(r.gates[i - 1].x1 - g.x0) > EPS) throw new Error(`${tag}: gap/overlap between gates`);
      checkOp(g.op, `${tag} row ${r.id}`);
      if (g.timed) {
        if (!(g.timed.period > 0.3)) throw new Error(`${tag}: timed period ${g.timed.period}`);
        checkSimple(g.timed.alt, `${tag} timed alt`);
      }
    }
    if (!r.moving) {
      if (Math.abs(r.gates[0].x0 + HALF) > EPS || Math.abs(r.gates[r.gates.length - 1].x1 - HALF) > EPS) throw new Error(`${tag}: static row does not span track`);
    }
  }
  // Rows must be readable one at a time.
  const zs = d.gateRows.map((r) => r.z).sort((a, b) => a - b);
  for (let i = 1; i < zs.length; i++) if (zs[i] - zs[i - 1] < 6) throw new Error(`${tag}: rows ${zs[i - 1]} and ${zs[i]} too close`);

  for (const o of d.obstacles) {
    if (o.z <= 0 || o.z >= d.length) throw new Error(`${tag}: obstacle z`);
    if (!(o.w > 0) || o.d < 0) throw new Error(`${tag}: obstacle size ${o.kind} ${o.w} ${o.d}`);
    if (Math.abs(o.x) > HALF + EPS) throw new Error(`${tag}: obstacle x ${o.kind} ${o.x}`);
    if ((o.kind === 'boxes' || o.kind === 'turnstile') && !(Number.isInteger(o.hp) && o.hp! >= 1)) throw new Error(`${tag}: ${o.kind} hp ${o.hp}`);
    if (o.kind === 'blower' && !o.push) throw new Error(`${tag}: blower push`);
    if ((o.kind === 'sweeper' || o.kind === 'slider' || o.kind === 'stomper' || o.kind === 'roller') && !(Math.abs(o.speed ?? 0) > 0)) throw new Error(`${tag}: ${o.kind} has no speed`);
    if (o.kind === 'slider' && Math.abs(o.x) + (o.amp ?? 0) + o.w > HALF + 0.5) throw new Error(`${tag}: slider leaves the track`);
    // A static wall exactly on a gate row would make that gate unreachable.
    if (o.kind === 'wall') for (const r of d.gateRows) if (Math.abs(o.z - r.z) < o.d + 0.3) throw new Error(`${tag}: wall on gate row`);
  }
  for (let i = 1; i < d.obstacles.length; i++) if (d.obstacles[i].z < d.obstacles[i - 1].z) throw new Error(`${tag}: obstacles not sorted`);
  // The simulation relies on pickups being sorted by z (early break).
  for (let i = 1; i < d.pickups.length; i++) if (d.pickups[i].z < d.pickups[i - 1].z) throw new Error(`${tag}: pickups not sorted`);
  for (const p of d.pickups) {
    if (Math.abs(p.x) > HALF) throw new Error(`${tag}: pickup x`);
    if (p.z <= 0 || p.z >= limit) throw new Error(`${tag}: pickup z`);
    if (!(p.amount >= 1) || !Number.isInteger(p.amount)) throw new Error(`${tag}: pickup amount ${p.amount}`);
  }
  for (const r of d.rivals) {
    if (!Number.isInteger(r.count) || r.count < 1) throw new Error(`${tag}: rival count ${r.count}`);
    if (Math.abs(r.x) > HALF) throw new Error(`${tag}: rival x`);
    if (r.z <= 0 || r.z >= limit) throw new Error(`${tag}: rival z`);
  }

  // Mechanics: only unlocked ones (or mutator-driven), every listed one present.
  const world = worldOfLevel(d.level);
  const allowed = unlockedMechanics(Math.min(world, BASE_WORLD_COUNT));
  if (d.mutators.includes('butterfingers')) allowed.add('roller');
  if (d.mutators.includes('windy')) { allowed.add('blower'); allowed.add('wall'); }
  if (d.isBoss) allowed.add('rival');
  for (const m of d.mechanics) if (!allowed.has(m)) throw new Error(`${tag}: mechanic ${m} not unlocked`);
  const present = new Set<MechanicId>();
  for (const o of d.obstacles) present.add(o.kind as MechanicId);
  if (d.rivals.length) present.add('rival');
  if (d.pickups.some((p) => p.kind === 'stragglers')) present.add('pickup');
  for (const r of d.gateRows) {
    if (r.moving) present.add('gate_moving');
    for (const g of r.gates) {
      if (g.timed) present.add('gate_timed');
      const k = g.op.kind;
      present.add(k === 'mystery' ? 'gate_mystery' : k === 'cond' ? 'gate_cond' : (`gate_${k}` as MechanicId));
      for (const o of [g.timed?.alt, g.op.kind === 'cond' ? g.op.below : null, g.op.kind === 'cond' ? g.op.above : null, g.op.kind === 'mystery' ? g.op.hidden : null]) {
        if (o) present.add(`gate_${o.kind}` as MechanicId);
      }
    }
  }
  for (const m of d.mechanics) if (!present.has(m)) throw new Error(`${tag}: mechanic ${m} announced but absent`);

  if (d.challenge) {
    const minTarget = d.challenge.kind === 'noDivide' || d.challenge.kind === 'maxLoss' ? 0 : 1;
    if (!(d.challenge.target >= minTarget) || !Number.isInteger(d.challenge.target) || !(d.challenge.rewardGems >= 1)) throw new Error(`${tag}: challenge ${JSON.stringify(d.challenge)}`);
  }
  if (d.isBoss !== isBossLevel(d.level)) throw new Error(`${tag}: boss flag`);
  if (d.isBoss && !d.rivals.some((r) => r.boss)) throw new Error(`${tag}: boss level without boss`);
}

describe('every level from 1 to 200, one by one', () => {
  it.each(range(1, 200))('level %i is valid', (L) => {
    validateLevel(generateLevel(L));
  });
});

describe('levels 201 → 20 000 in chunks', () => {
  it.each(chunks(201, 20_000, 40))('levels %i–%i are valid', (a, b) => {
    for (let L = a; L <= b; L += 3) validateLevel(generateLevel(L));
  });
});

describe('extreme and weird level numbers', () => {
  it.each([50_000, 99_999, 123_456, 1_000_000, 9_999_999, 100_000_000, 2 ** 31 - 1, 2 ** 31, 2 ** 40])('level %p is valid', (L) => {
    validateLevel(generateLevel(L));
  });
  it.each([0, -1, -1000, 0.5, 1.9999, NaN, Infinity, -Infinity])('generateLevel(%p) degrades gracefully', (L) => {
    const d = generateLevel(L);
    expect(d.level).toBeGreaterThanOrEqual(1);
    expect(findNonFinite(d)).toBeNull();
  });
});

describe('determinism & variety', () => {
  it.each(range(1, 20).map((i) => i * 37))('level %i is a pure function of its number', (L) => {
    expect(JSON.stringify(generateLevel(L))).toBe(JSON.stringify(generateLevel(L)));
  });
  it('no two levels among 1..2000 share the same layout', () => {
    const seen = new Set<string>();
    for (let L = 2; L <= 2000; L++) {
      const d = generateLevel(L);
      const k = JSON.stringify([d.gateRows, d.obstacles]);
      expect(seen.has(k)).toBe(false);
      seen.add(k);
    }
  });
  it('generation does not mutate shared constants', () => {
    const before = JSON.stringify(FINISH_MULTIPLIERS);
    for (let L = 1; L < 200; L++) generateLevel(L);
    expect(JSON.stringify(FINISH_MULTIPLIERS)).toBe(before);
  });
  it('generates 1000 levels in well under a frame budget each', () => {
    const t0 = performance.now();
    for (let L = 5000; L < 6000; L++) generateLevel(L);
    const per = (performance.now() - t0) / 1000;
    expect(per).toBeLessThan(15); // ms, on a CI machine
  });
});

describe('tutorial (level 1)', () => {
  const d = generateLevel(1);
  it('is flagged, gentle and short', () => {
    expect(d.tutorial).toBe(true);
    expect(d.rivals).toHaveLength(0);
    expect(d.gateRows.every((r) => r.gates.every((g) => g.op.kind !== 'cond' && g.op.kind !== 'mystery' && !g.timed))).toBe(true);
  });
  it('always offers a positive option in every row', () => {
    for (const r of d.gateRows) expect(r.gates.some((g) => g.op.kind === 'add' || g.op.kind === 'mul')).toBe(true);
  });
});

describe('worlds', () => {
  it.each(range(1, 40))('world %i has a valid palette, name and level range', (w) => {
    const info = getWorld(w);
    for (const c of [info.colors.skyTop, info.colors.skyBottom, info.colors.fog, info.colors.tileA, info.colors.tileB, info.colors.rail, info.colors.wall, info.colors.accent, ...info.colors.ui]) {
      expect(c).toMatch(/^#[0-9a-fA-F]{6}$/);
    }
    expect(info.displayName.en.length).toBeGreaterThan(2);
    expect(info.displayName.fr.length).toBeGreaterThan(2);
    expect(info.lastLevel - info.firstLevel).toBe(LEVELS_PER_WORLD - 1);
    expect(worldOfLevel(info.firstLevel)).toBe(w);
    expect(worldOfLevel(info.lastLevel)).toBe(w);
    expect(new Set(info.mutators).size).toBe(info.mutators.length);
  });
  it('remix worlds always have mutators, base worlds (except the manor) have none', () => {
    for (let w = 1; w <= 8; w++) expect(getWorld(w).mutators.length).toBe(w === 8 ? 1 : 0);
    for (let w = 9; w < 500; w++) expect(getWorld(w).mutators.length).toBeGreaterThan(0);
  });
  it('mechanics unlock monotonically', () => {
    for (let w = 2; w <= 12; w++) {
      const a = unlockedMechanics(w - 1), b = unlockedMechanics(w);
      for (const m of a) expect(b.has(m)).toBe(true);
    }
  });
});

describe('difficulty curves', () => {
  it('every parameter is finite and bounded up to level 10^9', () => {
    for (let e = 0; e <= 9; e += 0.05) {
      const p = difficultyFor(Math.round(Math.pow(10, e)), ['rushHour']);
      expect(findNonFinite(p)).toBeNull();
      expect(p.speed).toBeLessThan(15);
      expect(p.gap).toBeGreaterThanOrEqual(10.5);
      expect(p.hazard).toBeLessThanOrEqual(0.95);
      expect(p.dilemma).toBeLessThanOrEqual(1);
    }
  });
  it('speed and duration never decrease with the level', () => {
    let prev = difficultyFor(1);
    for (let L = 2; L < 5000; L++) {
      const p = difficultyFor(L);
      expect(p.speed).toBeGreaterThanOrEqual(prev.speed - 1e-9);
      if (L > 2) expect(p.duration).toBeGreaterThanOrEqual(prev.duration - 1e-9);
      prev = p;
    }
  });
});

describe('daily challenge for a whole year', () => {
  const months = range(0, 11);
  it.each(months)('month %i: every day yields a valid, unique, stable level', (m) => {
    const keys = new Set<string>();
    for (let day = 1; day <= 28; day++) {
      const now = new Date(2027, m, day, 9).getTime();
      const save = { ...defaultSave(now), level: 1 + ((day * 37 + m * 11) % 400) };
      const d = dailyChallengeLevel(save, now);
      validateLevel(d);
      expect(d.challenge).toBeUndefined();
      expect(JSON.stringify(dailyChallengeLevel(save, now + 3_600_000))).toBe(JSON.stringify(d));
      keys.add(JSON.stringify(d.gateRows));
    }
    expect(keys.size).toBe(28);
  });
});
