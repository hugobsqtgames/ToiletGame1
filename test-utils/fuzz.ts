/**
 * Helpers shared by the stress / fuzz / monkey suites (__tests__/stress.*).
 * Everything is seeded: a failing case can be replayed from its seed.
 */
import { Rng } from '../src/core/rng';
import type { GateOp, SimpleGateOp } from '../src/core/types';

export { Rng };

/** Interesting numbers for boundary testing. */
export const EDGE_NUMBERS = [
  0, -0, 1, -1, 2, 0.5, -0.5, 0.0001, 9.99, 10, 99.5, 220, 221, 999, 1000, 9_999_999, 10_000_000,
  2 ** 31 - 1, 2 ** 31, 2 ** 32, 2 ** 53, -(2 ** 53), Number.MAX_SAFE_INTEGER, Number.MAX_VALUE, Number.MIN_VALUE,
  Number.EPSILON, Infinity, -Infinity, NaN, 1e-300, 1e300,
];

/** Random value of any JSON-ish (and some non-JSON) type. */
export function randomValue(rng: Rng, depth = 0): unknown {
  const r = rng.int(0, depth > 3 ? 7 : 10);
  switch (r) {
    case 0: return null;
    case 1: return undefined;
    case 2: return rng.chance(0.5);
    case 3: return rng.pick(EDGE_NUMBERS);
    case 4: return rng.range(-1e6, 1e6);
    case 5: return rng.int(-5, 500);
    case 6: return rng.pick(['', 'x', 'rookie', 'golden', '2026-10-04', '9999-99-99', '__proto__', 'constructor', '{}', 'NaN', '💩', 'a'.repeat(300)]);
    case 7: return String(rng.int(0, 99999));
    case 8: return Array.from({ length: rng.int(0, 6) }, () => randomValue(rng, depth + 1));
    default: {
      const o: Record<string, unknown> = {};
      const n = rng.int(0, 6);
      for (let i = 0; i < n; i++) o[rng.pick(['a', 'level', 'coins', 'skins', 'owned', 'version', 'missions', 'daily', 'x', '__proto__', 'constructor'])] = randomValue(rng, depth + 1);
      return o;
    }
  }
}

/** Deep-mutates a JSON tree in place (replace/delete/insert random nodes). */
export function mutateTree(rng: Rng, node: unknown, rate: number): unknown {
  if (rng.chance(rate)) return randomValue(rng, 2);
  if (Array.isArray(node)) {
    const out = node.map((v) => mutateTree(rng, v, rate));
    if (rng.chance(rate)) out.push(randomValue(rng, 2));
    if (out.length && rng.chance(rate)) out.splice(rng.int(0, out.length - 1), 1);
    return out;
  }
  if (node && typeof node === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(node)) {
      if (rng.chance(rate * 0.5)) continue; // drop key
      out[k] = mutateTree(rng, v, rate);
    }
    if (rng.chance(rate)) out['extra' + rng.int(0, 9)] = randomValue(rng, 2);
    return out;
  }
  return node;
}

export function randomSimpleOp(rng: Rng, big = false): SimpleGateOp {
  const kind = rng.pick(['add', 'sub', 'mul', 'div', 'pct'] as const);
  const max = big ? 1e7 : 200;
  switch (kind) {
    case 'add':
    case 'sub':
      return { kind, n: rng.int(1, max) };
    case 'mul':
    case 'div':
      return { kind, n: rng.int(2, big ? 100 : 10) };
    case 'pct':
      return { kind, n: rng.chance(0.5) ? rng.int(1, 300) : -rng.int(1, 99) };
  }
}

export function randomOp(rng: Rng, big = false): GateOp {
  const r = rng.next();
  if (r < 0.15) return { kind: 'mystery', hidden: randomSimpleOp(rng, big) };
  if (r < 0.3) return { kind: 'cond', threshold: rng.int(1, 500), below: randomSimpleOp(rng, big), above: randomSimpleOp(rng, big) };
  return randomSimpleOp(rng, big);
}

/** Deep check that no number anywhere in a tree is NaN/Infinity. */
export function findNonFinite(node: unknown, path = '$'): string | null {
  if (typeof node === 'number') return Number.isFinite(node) ? null : path;
  if (Array.isArray(node)) {
    for (let i = 0; i < node.length; i++) {
      const r = findNonFinite(node[i], `${path}[${i}]`);
      if (r) return r;
    }
    return null;
  }
  if (node && typeof node === 'object') {
    for (const [k, v] of Object.entries(node)) {
      const r = findNonFinite(v, `${path}.${k}`);
      if (r) return r;
    }
  }
  return null;
}

/** Splits [a, b] into `n` chunks (for it.each grouping). */
export function chunks(a: number, b: number, n: number): [number, number][] {
  const out: [number, number][] = [];
  const size = Math.ceil((b - a + 1) / n);
  for (let s = a; s <= b; s += size) out.push([s, Math.min(b, s + size - 1)]);
  return out;
}

export const range = (a: number, b: number, step = 1) => {
  const out: number[] = [];
  for (let i = a; i <= b; i += step) out.push(i);
  return out;
};
