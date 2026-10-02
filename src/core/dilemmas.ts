import { applyOp } from './gates';
import { clamp, lerp, niceRound } from './math';
import type { Rng } from './rng';
import type { GateOp, MechanicId, SimpleGateOp } from './types';

/**
 * Gate "dilemmas": sets of options designed so that the best choice depends on
 * the current crowd size, timing or risk appetite — not just "biggest number".
 * Each option carries the op, an optional timed alternative and an estimated
 * value used by the generator to track the expected crowd.
 */
export interface GateOption {
  op: GateOp;
  timed?: { alt: SimpleGateOp; period: number };
}

export interface DilemmaResult {
  options: GateOption[];
  /** Mechanics used by this row. */
  mechanics: MechanicId[];
}

export type DilemmaKind =
  | 'addVsMul'
  | 'goodVsBad'
  | 'mulVsDiv'
  | 'twoBad'
  | 'pctVsAdd'
  | 'mysteryVsSafe'
  | 'condVsSafe'
  | 'timedVsSafe'
  | 'triple'
  | 'jackpot';

export interface DilemmaCtx {
  rng: Rng;
  /** Expected crowd entering the row. */
  E: number;
  /** 0..1 hardness (how close options are). */
  hardness: number;
  has: (m: MechanicId) => boolean;
  maxOptions: number;
  /** Soft upper band for E (inflation control). */
  band: number;
  motion: number;
  /** Mechanics to feature (new in this world). */
  emphasis: Set<MechanicId>;
  /** Forbid harmful-only rows (tutorial / very early). */
  gentle: boolean;
}

const addOp = (n: number): SimpleGateOp => ({ kind: 'add', n: Math.max(1, niceRound(n)) });
const subOp = (n: number): SimpleGateOp => ({ kind: 'sub', n: Math.max(1, niceRound(n)) });

/** Tie factor: close to 1 when hard, far from 1 when easy. Never exactly 1. */
function tie(rng: Rng, hardness: number): number {
  const spread = lerp(0.85, 0.22, hardness);
  const side = rng.chance(0.5) ? 1 : -1;
  return clamp(1 + side * rng.range(0.08, spread), 0.25, 2.2);
}

export function pickDilemmaKind(ctx: DilemmaCtx): DilemmaKind {
  const { E, band, has, gentle, hardness, emphasis } = ctx;
  const inflated = E > band;
  const tiny = E < 12;
  const w = (k: DilemmaKind, base: number, cond = true) => ({ item: k, weight: cond ? base : 0 });
  const boost = (m: MechanicId) => (emphasis.has(m) ? 3.5 : 1);
  return ctx.rng.weighted<DilemmaKind>([
    w('addVsMul', inflated ? 0.4 : 3, has('gate_mul')),
    w('goodVsBad', gentle ? 2 : lerp(1.4, 0.3, hardness), has('gate_sub')),
    w('mulVsDiv', inflated ? 0.3 : lerp(1.2, 0.3, hardness), has('gate_div')),
    w('twoBad', inflated ? 3 : 0.6, has('gate_sub') && has('gate_div') && E >= 30 && !gentle),
    w('pctVsAdd', (inflated ? 1.6 : 1.1) * boost('gate_pct'), has('gate_pct') && E >= 8),
    w('mysteryVsSafe', 0.9 * boost('gate_mystery'), has('gate_mystery')),
    w('condVsSafe', 0.9 * boost('gate_cond'), has('gate_cond') && E >= 10),
    w('timedVsSafe', 0.9 * boost('gate_timed'), has('gate_timed')),
    w('triple', inflated ? 0.6 : 1.6, ctx.maxOptions >= 3 && has('gate_sub') && !tiny),
    w('addVsMul', 1, true), // safety net: always available
  ]);
}

export function makeDilemma(ctx: DilemmaCtx, forced?: DilemmaKind): DilemmaResult {
  const { rng, hardness } = ctx;
  const E = Math.max(1, ctx.E);
  const kind = forced ?? pickDilemmaKind(ctx);
  const mulPool = hardness < 0.25 ? [2] : hardness < 0.6 ? [2, 3] : E < 40 ? [2, 3, 4, 5] : [2, 3, 4];

  switch (kind) {
    case 'addVsMul': {
      const k = rng.pick(mulPool);
      const a = addOp(Math.max(3, E * (k - 1) * tie(rng, hardness)));
      return { options: [{ op: a }, { op: { kind: 'mul', n: k } }], mechanics: ['gate_add', 'gate_mul'] };
    }
    case 'goodVsBad': {
      const good = rng.chance(0.5) && ctx.has('gate_mul') && E < ctx.band ? ({ kind: 'mul', n: 2 } as const) : addOp(Math.max(5, E * rng.range(0.4, 0.9)));
      const bad = subOp(Math.max(2, E * rng.range(0.2, 0.5)));
      return { options: [{ op: good }, { op: bad }], mechanics: ['gate_add', 'gate_sub', good.kind === 'mul' ? 'gate_mul' : 'gate_add'] };
    }
    case 'mulVsDiv': {
      const k = rng.pick([2, 2, 3]);
      return { options: [{ op: { kind: 'mul', n: k } }, { op: { kind: 'div', n: rng.pick([2, 3]) } }], mechanics: ['gate_mul', 'gate_div'] };
    }
    case 'twoBad': {
      // Choose the lesser evil: -a vs ÷2 where a ≈ E/2 * tie.
      const d = 2;
      const a = subOp(E * 0.5 * tie(rng, hardness));
      const opts: GateOption[] = [{ op: a }, { op: { kind: 'div', n: d } }];
      if (ctx.has('gate_pct') && rng.chance(0.4)) opts.push({ op: { kind: 'pct', n: -rng.pick([30, 40]) } });
      return { options: opts.slice(0, ctx.maxOptions), mechanics: ['gate_sub', 'gate_div'] };
    }
    case 'pctVsAdd': {
      const p = rng.pick([20, 30, 50, 50, 100]);
      const a = addOp(Math.max(3, (E * p) / 100 * tie(rng, hardness)));
      return { options: [{ op: { kind: 'pct', n: p } }, { op: a }], mechanics: ['gate_pct', 'gate_add'] };
    }
    case 'mysteryVsSafe': {
      const goodHidden: SimpleGateOp = rng.pick<SimpleGateOp>([
        { kind: 'mul', n: 3 },
        { kind: 'mul', n: 2 },
        addOp(E * 1.2 + 10),
        { kind: 'pct', n: 100 },
      ]);
      const badHidden: SimpleGateOp = rng.pick<SimpleGateOp>([{ kind: 'div', n: 2 }, subOp(E * 0.4 + 2)]);
      const hidden = rng.chance(0.6) ? goodHidden : badHidden;
      const safe = addOp(Math.max(4, E * 0.45 * tie(rng, hardness)));
      return { options: [{ op: { kind: 'mystery', hidden } }, { op: safe }], mechanics: ['gate_mystery', 'gate_add'] };
    }
    case 'condVsSafe': {
      const T = Math.max(10, niceRound(E * rng.range(0.75, 1.3)));
      const below: SimpleGateOp = { kind: 'mul', n: rng.pick([2, 3]) };
      const above: SimpleGateOp = rng.chance(0.5) ? { kind: 'pct', n: -30 } : subOp(T * 0.3);
      const safe = addOp(Math.max(4, E * 0.6 * tie(rng, hardness)));
      return {
        options: [{ op: { kind: 'cond', threshold: T, below, above } }, { op: safe }],
        mechanics: ['gate_cond', 'gate_add'],
      };
    }
    case 'timedVsSafe': {
      const big: SimpleGateOp = { kind: 'mul', n: rng.pick([2, 3]) };
      const alt: SimpleGateOp = rng.chance(0.5) ? { kind: 'div', n: 2 } : subOp(E * 0.4 + 3);
      const period = clamp(rng.range(1.4, 2.2) / Math.sqrt(ctx.motion), 0.9, 2.2);
      const safe = addOp(Math.max(4, E * 0.6 * tie(rng, hardness)));
      return { options: [{ op: big, timed: { alt, period } }, { op: safe }], mechanics: ['gate_timed', 'gate_add'] };
    }
    case 'jackpot': {
      // The "spectacular moment": a huge multiplier against a decent sure thing.
      const k = E < 60 ? rng.pick([5, 5, 10]) : rng.pick([3, 4, 5]);
      const safe = addOp(Math.max(10, E * (k - 1) * rng.range(0.35, 0.6)));
      return { options: [{ op: { kind: 'mul', n: k } }, { op: safe }], mechanics: ['gate_mul', 'gate_add'] };
    }
    case 'triple': {
      const k = rng.pick(mulPool);
      const a = addOp(Math.max(3, E * (k - 1) * tie(rng, hardness)));
      const bad: SimpleGateOp = ctx.has('gate_div') && rng.chance(0.5) ? { kind: 'div', n: 2 } : subOp(Math.max(3, E * 0.3));
      return { options: [{ op: a }, { op: { kind: 'mul', n: k } }, { op: bad }], mechanics: ['gate_add', 'gate_mul', 'gate_sub'] };
    }
  }
}

/** What a reasonable (not perfect) player gets from an option. */
export function estimateOption(opt: GateOption, E: number): number {
  const op = opt.op;
  if (op.kind === 'mystery') return E * 1.15;
  if (opt.timed) return (applyOp(op, E) + applyOp(opt.timed.alt, E)) / 2;
  return applyOp(op, E);
}

/** Expected crowd after a row: between second-best and best (imperfect play). */
export function estimateRow(options: GateOption[], E: number): number {
  const vals = options.map((o) => estimateOption(o, E)).sort((a, b) => b - a);
  const best = vals[0];
  const second = vals.length > 1 ? vals[1] : best;
  return Math.max(1, lerp(second, best, 0.65));
}
