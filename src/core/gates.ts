import { CROWD } from './config';
import type { GateDef, GateOp, SimpleGateOp } from './types';

/** Applies a gate operation to a crowd count. Result is an integer in [0, maxCount]. */
export function applyOp(op: GateOp, count: number): number {
  let r: number;
  switch (op.kind) {
    case 'add':
      r = count + op.n;
      break;
    case 'sub':
      r = count - op.n;
      break;
    case 'mul':
      r = count * op.n;
      break;
    case 'div':
      r = Math.floor(count / op.n);
      break;
    case 'pct':
      r = Math.round(count * (1 + op.n / 100));
      break;
    case 'mystery':
      return applyOp(op.hidden, count);
    case 'cond':
      return applyOp(count < op.threshold ? op.below : op.above, count);
  }
  return Math.max(0, Math.min(CROWD.maxCount, Math.floor(r)));
}

/** Resolves the operation actually in effect for a (possibly timed) gate at time t. */
export function activeOp(gate: GateDef, t: number): GateOp {
  if (!gate.timed) return gate.op;
  const phase = Math.floor(t / gate.timed.period) % 2;
  return phase === 0 ? gate.op : gate.timed.alt;
}

/** Is this op good for the player in isolation (used for colors)? */
export function isPositive(op: GateOp): boolean {
  switch (op.kind) {
    case 'add':
    case 'mul':
      return true;
    case 'sub':
    case 'div':
      return false;
    case 'pct':
      return op.n > 0;
    case 'mystery':
      return true; // shown in neutral "mystery" color anyway
    case 'cond':
      return isPositive(op.below) || isPositive(op.above);
  }
}

export type GateTone = 'good' | 'bad' | 'mystery' | 'cond';

export function gateTone(op: GateOp): GateTone {
  if (op.kind === 'mystery') return 'mystery';
  if (op.kind === 'cond') return 'cond';
  return isPositive(op) ? 'good' : 'bad';
}

/** Short label text using glyphs supported by the voxel font. */
export function opLabel(op: SimpleGateOp): string {
  switch (op.kind) {
    case 'add':
      return `+${op.n}`;
    case 'sub':
      return `-${op.n}`;
    case 'mul':
      return `x${op.n}`;
    case 'div':
      return `÷${op.n}`;
    case 'pct':
      return `${op.n > 0 ? '+' : '-'}${Math.abs(op.n)}%`;
  }
}

/** Label lines for a gate (top line is small text, last line is the big value). */
export function gateLabelLines(op: GateOp): { small?: string; big: string; small2?: string } {
  switch (op.kind) {
    case 'mystery':
      return { big: '?' };
    case 'cond':
      return { small: `<${op.threshold}`, big: opLabel(op.below), small2: `ELSE ${opLabel(op.above)}` };
    default:
      return { big: opLabel(op) };
  }
}

/** Mechanic category of an op (analytics + missions). */
export function opCategory(op: GateOp): 'add' | 'sub' | 'mul' | 'div' | 'pct' | 'mystery' | 'cond' {
  return op.kind;
}

/** True when the op can only reduce the crowd (for the "no divide" challenge). */
export function isHarmful(op: GateOp, countBefore: number): boolean {
  return applyOp(op, countBefore) < countBefore;
}
