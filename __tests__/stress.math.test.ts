/**
 * Stress / property tests: gate math, number formatting, RNG, helpers.
 * Every random case is seeded, so failures are reproducible.
 */
import { applyOp, activeOp, gateLabelLines, gateTone, isPositive, opLabel } from '../src/core/gates';
import { CROWD } from '../src/core/config';
import { formatCount, formatDuration, toRoman } from '../src/core/format';
import { clamp, damp, lerp, niceRound, saturate } from '../src/core/math';
import { hash2, hashString, Rng } from '../src/core/rng';
import { spacingFor, radiusFor, logicMembers, UNIT_X, UNIT_Z } from '../src/core/formation';
import { EDGE_NUMBERS, randomOp, randomSimpleOp, range } from '../test-utils/fuzz';
import type { SimpleGateOp } from '../src/core/types';

const COUNTS = [0, 1, 2, 3, 5, 9, 10, 11, 99, 100, 219, 220, 221, 1000, 12_345, 999_999, 5_000_000, CROWD.maxCount];

describe('applyOp — exhaustive small ops × counts', () => {
  const ops: SimpleGateOp[] = [];
  for (const n of [1, 2, 3, 5, 10, 50, 100, 1000]) ops.push({ kind: 'add', n }, { kind: 'sub', n });
  for (const n of [2, 3, 4, 5, 10]) ops.push({ kind: 'mul', n }, { kind: 'div', n });
  for (const n of [-99, -50, -25, -10, 10, 25, 50, 100, 200]) ops.push({ kind: 'pct', n });

  it.each(ops.map((o) => [opLabel(o), o] as const))('%s keeps results integer, bounded and exact', (_l, op) => {
    for (const c of COUNTS) {
      const r = applyOp(op, c);
      expect(Number.isInteger(r)).toBe(true);
      expect(r).toBeGreaterThanOrEqual(0);
      expect(r).toBeLessThanOrEqual(CROWD.maxCount);
      let exact: number;
      switch (op.kind) {
        case 'add': exact = c + op.n; break;
        case 'sub': exact = c - op.n; break;
        case 'mul': exact = c * op.n; break;
        case 'div': exact = Math.floor(c / op.n); break;
        case 'pct': exact = Math.round(c * (1 + op.n / 100)); break;
      }
      expect(r).toBe(Math.max(0, Math.min(CROWD.maxCount, exact)));
    }
  });
});

describe('applyOp — properties over 20 000 random ops', () => {
  it.each(range(1, 20))('seed %i: positive ops never shrink, negative never grow', (seed) => {
    const rng = new Rng(seed * 7919);
    for (let i = 0; i < 1000; i++) {
      const op = randomSimpleOp(rng, rng.chance(0.3));
      const c = rng.chance(0.2) ? rng.pick(COUNTS) : rng.int(0, 100_000);
      const r = applyOp(op, c);
      if (isPositive(op)) expect(r).toBeGreaterThanOrEqual(Math.min(c, CROWD.maxCount));
      else expect(r).toBeLessThanOrEqual(c);
      expect(Number.isInteger(r)).toBe(true);
    }
  });
});

describe('applyOp — composite ops', () => {
  it.each(range(1, 10))('seed %i: mystery equals its hidden op, cond picks by threshold', (seed) => {
    const rng = new Rng(seed * 31 + 3);
    for (let i = 0; i < 500; i++) {
      const hidden = randomSimpleOp(rng);
      const c = rng.int(0, 2000);
      expect(applyOp({ kind: 'mystery', hidden }, c)).toBe(applyOp(hidden, c));
      const below = randomSimpleOp(rng), above = randomSimpleOp(rng);
      const threshold = rng.int(1, 500);
      expect(applyOp({ kind: 'cond', threshold, below, above }, c)).toBe(applyOp(c < threshold ? below : above, c));
    }
  });
  it('cond threshold boundary is strict (< below, >= above)', () => {
    const op = { kind: 'cond', threshold: 50, below: { kind: 'add', n: 1 }, above: { kind: 'sub', n: 1 } } as const;
    expect(applyOp(op, 49)).toBe(50);
    expect(applyOp(op, 50)).toBe(49);
  });
  it('division by one is identity and never yields fractions', () => {
    for (const c of COUNTS) expect(applyOp({ kind: 'div', n: 1 }, c)).toBe(c);
  });
  it('-100% wipes the crowd, +0 add keeps it', () => {
    expect(applyOp({ kind: 'pct', n: -100 }, 500)).toBe(0);
    expect(applyOp({ kind: 'add', n: 0 }, 500)).toBe(500);
  });
});

describe('timed gates', () => {
  it.each([0.3, 0.5, 1, 1.7, 2.5])('period %f alternates exactly at boundaries', (period) => {
    const g = { x0: 0, x1: 1, op: { kind: 'add', n: 5 } as const, timed: { alt: { kind: 'sub', n: 5 } as const, period } };
    for (let k = 0; k < 40; k++) {
      const t = k * period + period / 2;
      expect(activeOp(g, t).kind).toBe(k % 2 === 0 ? 'add' : 'sub');
    }
  });
  it('untimed gates ignore time', () => {
    const g = { x0: 0, x1: 1, op: { kind: 'mul', n: 2 } as const };
    for (const t of [0, 1, 1e6, -5]) expect(activeOp(g, t)).toBe(g.op);
  });
});

describe('labels', () => {
  const GLYPHS = new Set('0123456789+-x÷%?<>.,:!/×= ABCDEFGHIJKLMNOPQRSTUVWXYZ');
  it.each(range(1, 10))('seed %i: every gate label only uses glyphs of the 3D font', (seed) => {
    const rng = new Rng(seed * 101);
    for (let i = 0; i < 500; i++) {
      const op = randomOp(rng, rng.chance(0.5));
      const l = gateLabelLines(op);
      for (const s of [l.big, l.small ?? '', l.small2 ?? '']) for (const ch of s) expect(GLYPHS.has(ch)).toBe(true);
      expect(l.big.length).toBeGreaterThan(0);
      expect(['good', 'bad', 'mystery', 'cond']).toContain(gateTone(op));
    }
  });
  it('negative percentages render with a single minus sign', () => {
    expect(opLabel({ kind: 'pct', n: -30 })).toBe('-30%');
    expect(opLabel({ kind: 'pct', n: 30 })).toBe('+30%');
  });
});

describe('formatCount', () => {
  it.each([
    [0, '0'], [-5, '0'], [1, '1'], [999, '999'], [1000, '1K'], [1049, '1K'], [1050, '1.1K'], [9999, '10K'],
    [10_000, '10K'], [999_999, '999K'], [1_000_000, '1M'], [9_999_999, '10M'], [12_000_000, '12M'], [2_500_000_000, '2.5B'],
    [NaN, '0'], [0.9, '0'],
  ])('formatCount(%p) = %p', (n, s) => {
    expect(formatCount(n)).toBe(s);
  });
  it('is short and monotonic-ish for 100k random values', () => {
    const rng = new Rng(42);
    for (let i = 0; i < 100_000; i++) {
      const n = Math.floor(Math.pow(10, rng.range(0, 10)));
      const s = formatCount(n);
      expect(s.length).toBeLessThanOrEqual(5);
      expect(s).toMatch(/^\d+(\.\d)?[KMB]?$/);
    }
  });
});

describe('formatDuration / toRoman', () => {
  it.each([[0, '0s'], [999, '1s'], [59_000, '59s'], [60_000, '1m 00s'], [3_600_000, '1h 00m'], [-100, '0s'], [86_399_000, '23h 59m']])('formatDuration(%p) = %p', (ms, s) => {
    expect(formatDuration(ms)).toBe(s);
  });
  it.each([[1, 'I'], [4, 'IV'], [9, 'IX'], [14, 'XIV'], [40, 'XL'], [90, 'XC'], [400, 'CD'], [1994, 'MCMXCIV'], [3999, 'MMMCMXCIX'], [0, '0'], [4000, '4000']])('toRoman(%p) = %p', (n, s) => {
    expect(toRoman(n)).toBe(s);
  });
});

describe('math helpers', () => {
  it('niceRound returns positive "human" numbers, close to the input', () => {
    const rng = new Rng(9);
    for (let i = 0; i < 50_000; i++) {
      const v = Math.pow(10, rng.range(-1, 8));
      const r = niceRound(v);
      expect(r).toBeGreaterThanOrEqual(1);
      expect(Number.isFinite(r)).toBe(true);
      if (v > 10) expect(Math.abs(r - v) / v).toBeLessThan(0.25);
      // No ugly floating point tails like 1200.0000000002
      expect(Number.isInteger(r)).toBe(true);
    }
  });
  it('clamp/lerp/damp/saturate behave', () => {
    expect(clamp(5, 0, 1)).toBe(1);
    expect(clamp(-5, 0, 1)).toBe(0);
    expect(lerp(0, 10, 0.25)).toBe(2.5);
    expect(damp(10, 0)).toBe(0);
    expect(damp(10, 100)).toBeCloseTo(1);
    expect(saturate(0, 5)).toBe(0);
    expect(saturate(1e9, 5)).toBeCloseTo(1);
  });
});

describe('rng', () => {
  it('is deterministic and stays in [0,1)', () => {
    const a = new Rng(123), b = new Rng(123);
    for (let i = 0; i < 100_000; i++) {
      const x = a.next();
      expect(x).toBe(b.next());
      if (x < 0 || x >= 1) throw new Error('out of range ' + x);
    }
  });
  it('is roughly uniform (chi-square over 20 buckets)', () => {
    const rng = new Rng(77);
    const buckets = new Array(20).fill(0);
    const N = 200_000;
    for (let i = 0; i < N; i++) buckets[Math.floor(rng.next() * 20)]++;
    const exp = N / 20;
    const chi = buckets.reduce((s, b) => s + ((b - exp) ** 2) / exp, 0);
    expect(chi).toBeLessThan(45); // p≈0.001 for 19 dof
  });
  it.each(EDGE_NUMBERS.map((n) => [n]))('seed %p never breaks the generator', (seed) => {
    const rng = new Rng(seed);
    for (let i = 0; i < 100; i++) {
      const x = rng.next();
      expect(x >= 0 && x < 1).toBe(true);
    }
  });
  it('int() covers the inclusive range and nothing outside', () => {
    const rng = new Rng(5);
    const seen = new Set<number>();
    for (let i = 0; i < 10_000; i++) {
      const v = rng.int(-3, 3);
      expect(v).toBeGreaterThanOrEqual(-3);
      expect(v).toBeLessThanOrEqual(3);
      seen.add(v);
    }
    expect(seen.size).toBe(7);
  });
  it('weighted() never picks zero-weight items', () => {
    const rng = new Rng(8);
    for (let i = 0; i < 10_000; i++) {
      expect(rng.weighted([{ item: 'a', weight: 0 }, { item: 'b', weight: 1 }, { item: 'c', weight: -2 }])).toBe('b');
    }
  });
  it('shuffle is a permutation', () => {
    const rng = new Rng(3);
    for (let i = 0; i < 1000; i++) {
      const arr = range(0, rng.int(0, 30));
      const s = rng.shuffle([...arr]);
      expect([...s].sort((a, b) => a - b)).toEqual(arr);
    }
  });
  it('hash2 / hashString have no collisions on 100k consecutive inputs', () => {
    const a = new Set<number>(), b = new Set<number>();
    for (let i = 0; i < 100_000; i++) {
      a.add(hash2(i, 0x10051));
      b.add(hashString('daily-' + i));
    }
    expect(a.size).toBe(100_000);
    expect(b.size).toBe(100_000);
  });
  it('fork() gives independent but reproducible streams', () => {
    const r = new Rng(1);
    const f1 = r.fork(1).next(), f2 = r.fork(2).next();
    expect(f1).not.toBe(f2);
    expect(new Rng(1).fork(1).next()).toBe(f1);
  });
});

describe('formation', () => {
  it('slots never overlap and radius grows monotonically', () => {
    let prevR = 0;
    for (let m = 1; m <= 220; m++) {
      const sp = spacingFor(m);
      const r = radiusFor(m);
      expect(r).toBeGreaterThanOrEqual(prevR - 1e-9);
      expect(r).toBeLessThanOrEqual(CROWD.maxFormationRadius + CROWD.memberRadius + 1e-6);
      prevR = r;
      // min distance between laid out slots (sampled)
      if (m % 20 === 0) {
        let min = Infinity;
        for (let i = 0; i < m; i++) for (let j = i + 1; j < m; j++) {
          const d = Math.hypot((UNIT_X[i] - UNIT_X[j]) * sp, (UNIT_Z[i] - UNIT_Z[j]) * sp);
          if (d < min) min = d;
        }
        expect(min).toBeGreaterThan(CROWD.memberRadius * 0.9);
      }
    }
  });
  it('logicMembers caps at 220 and radius(0) = 0', () => {
    expect(logicMembers(1e7)).toBe(220);
    expect(logicMembers(3)).toBe(3);
    expect(radiusFor(0)).toBe(0);
  });
});
