import { LEVELS_PER_WORLD, TRACK } from './config';
import { difficultyFor, type DifficultyParams } from './difficulty';
import { estimateOption, estimateRow, makeDilemma, type DilemmaKind, type GateOption } from './dilemmas';
import { clamp, niceRound } from './math';
import { hash2, Rng } from './rng';
import type {
  ChallengeDef,
  GateRowDef,
  LevelDef,
  MechanicId,
  MutatorId,
  ObstacleDef,
  ObstacleKind,
  PickupDef,
  RivalDef,
} from './types';
import { BASE_WORLD_COUNT, BASE_THEMES, getWorld, isBossLevel, unlockedMechanics, worldOfLevel } from './worlds';

const HALF = TRACK.width / 2;
const SEED_SALT = 0x10051;
export const FINISH_MULTIPLIERS = [1, 1.2, 1.5, 2, 2.5, 3, 4, 5, 7, 10];
export const BASE_START_COUNT = 5;

interface Gen {
  rng: Rng;
  level: number;
  z: number;
  E: number;
  /** Pessimistic estimate (player takes second-best options). */
  Elow: number;
  peakE: number;
  P: DifficultyParams;
  mech: Set<MechanicId>;
  emphasis: Set<MechanicId>;
  mutators: MutatorId[];
  used: Set<MechanicId>;
  rows: GateRowDef[];
  obstacles: ObstacleDef[];
  rivals: RivalDef[];
  pickups: PickupDef[];
  nextId: number;
  length: number;
  bigMulAvailable: boolean;
}

/** Deterministic seed of a level (also used by the daily challenge with a salt). */
export const levelSeed = (level: number, salt = SEED_SALT) => hash2(level, salt);

export interface GenOptions {
  /** Override seed (daily challenge). */
  seed?: number;
  /** Extra mutators (daily challenge). */
  extraMutators?: MutatorId[];
}

export function generateLevel(level: number, opts: GenOptions = {}): LevelDef {
  const L = Math.max(1, Math.floor(level));
  const world = worldOfLevel(L);
  const info = getWorld(world);
  const mutators = [...info.mutators, ...(opts.extraMutators ?? [])];
  const seed = opts.seed ?? levelSeed(L);
  const P = difficultyFor(L, mutators);
  const rng = new Rng(seed);
  const mech = world > BASE_WORLD_COUNT ? unlockedMechanics(BASE_WORLD_COUNT) : unlockedMechanics(world);
  // Early levels of world 1 unlock mechanics gradually (natural tutorial).
  if (L <= 2) mech.delete('gate_sub');
  if (L <= 3) mech.delete('pickup');
  const levelInWorld = (L - 1) % LEVELS_PER_WORLD;
  const emphasis = new Set<MechanicId>(world <= BASE_WORLD_COUNT && levelInWorld < 5 ? BASE_THEMES[info.themeIndex].introduces : []);

  if (L === 1) return tutorialLevel(seed, P, info.themeIndex);

  const isBoss = isBossLevel(L);
  const length = Math.round(P.speed * P.duration * (isBoss ? 1.08 : 1));
  const g: Gen = {
    rng, level: L, z: TRACK.introLength, E: BASE_START_COUNT, Elow: BASE_START_COUNT, peakE: BASE_START_COUNT, P, mech, emphasis, mutators,
    used: new Set(), rows: [], obstacles: [], rivals: [], pickups: [], nextId: 1, length, bigMulAvailable: false,
  };

  const endZ = length - (isBoss ? 34 : 16);
  let lastWasGate = false;
  let jackpotPlaced = false;
  let rivalsPlaced = 0;
  const maxRivals = mech.has('rival') ? (L < 25 ? 1 : 2) + (mutators.includes('rivalry') ? 1 : 0) : 0;

  // Opening: always an easy, readable decision.
  gateRowPattern(g, { gentle: true });
  lastWasGate = true;

  while (g.z < endZ) {
    const phase = g.z / length;
    if (!jackpotPlaced && phase > 0.55 && phase < 0.8) {
      jackpotPattern(g);
      jackpotPlaced = true;
      lastWasGate = true;
      continue;
    }
    if (rivalsPlaced < maxRivals && phase > 0.35 + rivalsPlaced * 0.25 && rng.chance(0.6)) {
      rivalPattern(g, false);
      rivalsPlaced++;
      lastWasGate = false;
      continue;
    }
    if (lastWasGate) {
      if (rng.chance(P.hazard)) hazardPattern(g);
      else bonusPattern(g);
      lastWasGate = false;
    } else {
      if (rng.chance(P.combo * 0.6)) riskRewardPattern(g);
      else if (mech.has('turnstile') && rng.chance(emphasis.has('turnstile') ? 0.4 : 0.12)) turnstilePattern(g);
      else if (mech.has('boxes') && rng.chance(emphasis.has('boxes') ? 0.4 : 0.12)) boxesPattern(g);
      else gateRowPattern(g, {});
      lastWasGate = true;
    }
  }

  if (isBoss) {
    g.z = Math.max(g.z, length - 30);
    rivalPattern(g, true);
  }

  // Key pickup (chest progression) on roughly a third of the levels.
  if (L >= 3 && rng.chance(0.33)) {
    const z = rng.range(length * 0.3, length * 0.8);
    g.pickups.push({ id: g.nextId++, kind: 'key', x: rng.pick([-3.6, 3.6]), z, amount: 1 });
  }

  // Patterns may spill past their budget: keep the finish corridor clean.
  const limit = length - 6;
  g.obstacles = g.obstacles.filter((o) => o.z + (o.kind === 'roller' ? 0 : o.d) < limit);
  g.rows = g.rows.filter((r) => r.z < limit);
  g.pickups = g.pickups.filter((p) => p.z < limit);
  g.rivals = g.rivals.filter((r) => r.z < limit);

  const Efinish = Math.max(1, g.E);
  const finish = {
    z: length,
    multipliers: FINISH_MULTIPLIERS,
    stepCost: Math.max(1, Math.round(Efinish / (FINISH_MULTIPLIERS.length - 1))),
  };

  const mechanics = [...g.used];
  const def: LevelDef = {
    level: L,
    seed,
    world,
    themeIndex: info.themeIndex,
    isBoss,
    difficulty: P.scalar,
    speed: P.speed,
    length,
    startCount: BASE_START_COUNT,
    gateRows: g.rows,
    obstacles: g.obstacles.sort((a, b) => a.z - b.z),
    rivals: g.rivals,
    pickups: g.pickups.sort((a, b) => a.z - b.z),
    finish,
    mutators,
    mechanics,
    challenge: makeChallenge(rng.fork(77), L, Efinish, g.peakE, g.bigMulAvailable),
    tutorial: false,
    expectedFinish: Math.round(Efinish),
  };
  return def;
}

/* ------------------------------------------------------------------ */
/* Patterns                                                            */
/* ------------------------------------------------------------------ */

function markUsed(g: Gen, ...m: MechanicId[]) {
  for (const x of m) g.used.add(x);
}

/** Sets the expected crowd; `low` defaults to scaling the pessimistic estimate by the same factor. */
function setE(g: Gen, e: number, low?: number) {
  const prev = g.E;
  g.E = Math.max(1, e);
  g.Elow = Math.max(1, Math.min(g.E, low ?? g.Elow * (g.E / Math.max(1, prev))));
  g.peakE = Math.max(g.peakE, g.E);
}

/** Second-best option value: what a less careful player gets. */
function lowRow(options: GateOption[], E: number) {
  const vals = options.map((o) => estimateOption(o, E)).sort((a, b) => b - a);
  return vals.length > 1 ? vals[1] : vals[0];
}

function obstacle(g: Gen, kind: ObstacleKind, o: Omit<ObstacleDef, 'id' | 'kind'>): ObstacleDef {
  const def: ObstacleDef = { id: g.nextId++, kind, ...o };
  g.obstacles.push(def);
  markUsed(g, kind as MechanicId);
  return def;
}

function rowFromOptions(g: Gen, options: GateOption[], z: number, moving?: GateRowDef['moving']): GateRowDef {
  const n = options.length;
  const shuffled = g.rng.shuffle([...options]);
  let span = TRACK.width;
  let start = -HALF;
  if (moving) {
    span = TRACK.width - moving.amp * 2;
    start = -span / 2;
  }
  const w = span / n;
  const row: GateRowDef = {
    id: g.nextId++,
    z,
    gates: shuffled.map((o, i) => ({ x0: start + i * w, x1: start + (i + 1) * w, op: o.op, timed: o.timed })),
    moving,
  };
  g.rows.push(row);
  if (options.some((o) => o.op.kind === 'mul' && o.op.n >= 3)) g.bigMulAvailable = true;
  return row;
}

function dilemmaCtx(g: Gen, gentle: boolean) {
  return {
    rng: g.rng,
    E: g.E,
    hardness: gentle ? Math.min(0.2, g.P.dilemma) : g.P.dilemma,
    has: (m: MechanicId) => g.mech.has(m),
    maxOptions: g.P.maxOptions,
    band: g.P.crowdBand,
    motion: g.P.motion,
    emphasis: g.emphasis,
    gentle,
  };
}

function gateRowPattern(g: Gen, o: { gentle?: boolean; forced?: DilemmaKind }) {
  const d = makeDilemma(dilemmaCtx(g, !!o.gentle), o.forced);
  const canMove = g.mech.has('gate_moving') && !o.gentle && d.options.length === 2;
  const moving = canMove && g.rng.chance(g.emphasis.has('gate_moving') ? 0.5 : 0.22)
    ? { amp: 1.3, freq: g.rng.range(0.9, 1.5) * Math.sqrt(g.P.motion) }
    : undefined;
  rowFromOptions(g, d.options, g.z, moving);
  markUsed(g, ...d.mechanics);
  if (moving) markUsed(g, 'gate_moving');
  // Moving rows can be missed entirely: estimate pessimistically.
  const est = estimateRow(d.options, g.E);
  const low = lowRow(d.options, g.Elow);
  setE(g, moving ? (est + g.E) / 2 : est, moving ? (low + g.Elow) / 2 : low);
  g.z += g.P.gap;
}

function jackpotPattern(g: Gen) {
  // Spectacular moment: a big multiplier, guarded on its side by a hazard when possible.
  const d = makeDilemma(dilemmaCtx(g, false), 'jackpot');
  const row = rowFromOptions(g, d.options, g.z + 9);
  markUsed(g, ...d.mechanics);
  const bigGate = row.gates.find((x) => x.op.kind === 'mul')!;
  const cx = (bigGate.x0 + bigGate.x1) / 2;
  if (g.level > 6 && g.rng.chance(0.75)) guardLane(g, cx, g.z + 3);
  const big = bigGate.op.kind === 'mul' ? g.E * bigGate.op.n : g.E;
  setE(g, g.E + (big - g.E) * 0.7);
  g.z += 9 + g.P.gap;
}

/** Places a lane hazard centered at cx in front of a reward. */
function guardLane(g: Gen, cx: number, z: number) {
  const m = g.P.motion;
  const choices: ObstacleKind[] = ['wall'];
  if (g.mech.has('sweeper')) choices.push('sweeper');
  if (g.mech.has('stomper')) choices.push('stomper');
  if (g.mech.has('slider')) choices.push('slider');
  const kind = g.rng.pick(choices);
  const laneHalf = 2.2;
  switch (kind) {
    case 'wall': // a wall with a narrow slit in the lane
      obstacle(g, 'wall', { x: cx - laneHalf * 0.75, z, w: laneHalf * 0.45, d: 0.35 });
      obstacle(g, 'wall', { x: cx + laneHalf * 0.75, z, w: laneHalf * 0.45, d: 0.35 });
      break;
    case 'sweeper':
      obstacle(g, 'sweeper', { x: cx, z, w: 2.1, d: 0.22, speed: 1.9 * m * (g.rng.chance(0.5) ? 1 : -1), phase: g.rng.range(0, Math.PI) });
      break;
    case 'stomper':
      obstacle(g, 'stomper', { x: cx, z, w: 1.6, d: 1.6, speed: 0.55 * m, phase: g.rng.next() });
      break;
    case 'slider':
      obstacle(g, 'slider', { x: cx, z, w: 1.1, d: 0.6, amp: 1.6, speed: 2.2 * m, phase: g.rng.range(0, 6) });
      break;
  }
  setE(g, g.E * 0.94);
}

function hazardPattern(g: Gen) {
  const m = g.mech;
  const w = (k: string, weight: number, ok: boolean) => ({ item: k, weight: ok ? weight * (g.emphasis.has(k as MechanicId) ? 3 : 1) : 0 });
  const kind = g.rng.weighted<string>([
    w('wall', 1.2, m.has('wall')),
    w('narrow', 0.7, m.has('wall') && g.level > 5),
    w('sweeper', 1, m.has('sweeper')),
    w('slider', 1, m.has('slider')),
    w('puddle', 1, m.has('puddle')),
    w('roller', 1, m.has('roller') || g.mutators.includes('butterfingers')),
    w('stomper', 1, m.has('stomper')),
    w('blower', 0.8, m.has('blower') || g.mutators.includes('windy')),
  ]);
  const P = g.P;
  const rng = g.rng;
  const z0 = g.z;
  let len = 14;
  switch (kind) {
    case 'wall': {
      const n = rng.int(2, 3);
      let side = rng.chance(0.5) ? -1 : 1;
      for (let i = 0; i < n; i++) {
        const cover = rng.range(3.4, 4.6);
        obstacle(g, 'wall', { x: side * (HALF - cover / 2), z: z0 + i * 7.5, w: cover / 2, d: 0.35 });
        side = -side;
      }
      len = n * 7.5;
      setE(g, g.E * 0.97);
      break;
    }
    case 'narrow': {
      const gapW = clamp(5.6 - 2.2 * P.dilemma - (g.mutators.includes('tight') ? 0.8 : 0), 3.0, 5.6);
      const gx = rng.range(-HALF + gapW / 2 + 0.4, HALF - gapW / 2 - 0.4);
      const lw = gx - gapW / 2 + HALF;
      const rw = HALF - (gx + gapW / 2);
      for (let i = 0; i < 2; i++) {
        const z = z0 + i * 3.2;
        if (lw > 0.2) obstacle(g, 'wall', { x: -HALF + lw / 2, z, w: lw / 2, d: 0.35 });
        if (rw > 0.2) obstacle(g, 'wall', { x: HALF - rw / 2, z, w: rw / 2, d: 0.35 });
      }
      len = 8;
      setE(g, g.E > 60 ? g.E * 0.9 : g.E * 0.97);
      break;
    }
    case 'sweeper': {
      const n = rng.int(1, 2);
      for (let i = 0; i < n; i++) {
        const x = n === 1 ? rng.range(-1.5, 1.5) : (i === 0 ? -2.4 : 2.4);
        obstacle(g, 'sweeper', {
          x, z: z0 + i * 6, w: n === 1 ? rng.range(2.6, 3.4) : 2.3, d: 0.22,
          speed: 1.6 * P.motion * (i % 2 === 0 ? 1 : -1), phase: rng.range(0, Math.PI),
        });
      }
      len = 6 + n * 6;
      setE(g, g.E * 0.94);
      break;
    }
    case 'slider': {
      const n = rng.int(2, 3);
      for (let i = 0; i < n; i++) {
        const w = rng.range(1.0, 1.4);
        obstacle(g, 'slider', {
          x: 0, z: z0 + i * 5.5, w, d: 0.6, amp: HALF - w - 0.2,
          speed: 1.5 * P.motion, phase: i * 2.1 + rng.range(0, 1),
        });
      }
      len = n * 5.5 + 4;
      setE(g, g.E * 0.95);
      break;
    }
    case 'puddle': {
      const n = rng.int(2, 4);
      let side = rng.chance(0.5) ? -1 : 1;
      for (let i = 0; i < n; i++) {
        const rx = rng.range(1.3, 2.1);
        obstacle(g, 'puddle', { x: side * rng.range(1.2, HALF - rx * 0.6), z: z0 + i * 5, w: rx, d: rng.range(1.0, 1.5) });
        side = -side;
      }
      len = n * 5 + 3;
      setE(g, g.E * 0.95);
      break;
    }
    case 'roller': {
      const n = rng.int(2, 3) + (g.mutators.includes('butterfingers') ? 1 : 0);
      for (let i = 0; i < n; i++) {
        obstacle(g, 'roller', {
          x: rng.range(-3.2, 3.2), z: z0 + 10 + i * 6, w: 1.3, d: 0.55,
          speed: rng.range(5, 8) * Math.sqrt(P.motion), phase: 0,
        });
      }
      len = 10 + n * 6;
      setE(g, g.E * 0.95);
      break;
    }
    case 'stomper': {
      const n = rng.int(2, 3);
      for (let i = 0; i < n; i++) {
        obstacle(g, 'stomper', {
          x: rng.range(-3, 3), z: z0 + i * 5.5, w: rng.range(1.3, 1.8), d: 0,
          speed: 0.55 * P.motion, phase: i / n + rng.range(0, 0.2),
        });
      }
      len = n * 5.5 + 3;
      setE(g, g.E * 0.95);
      break;
    }
    case 'blower': {
      const dir = rng.chance(0.5) ? -1 : 1;
      const zoneLen = 13;
      obstacle(g, 'blower', { x: 0, z: z0 + zoneLen / 2, w: HALF, d: zoneLen / 2, push: dir * rng.range(3.5, 5.5) * Math.sqrt(P.motion) });
      // Danger on the downwind edge.
      if (g.mech.has('puddle')) obstacle(g, 'puddle', { x: dir * (HALF - 0.9), z: z0 + zoneLen * 0.6, w: 1.2, d: 3.2 });
      else obstacle(g, 'wall', { x: dir * (HALF - 0.6), z: z0 + zoneLen * 0.6, w: 0.6, d: 2.5 });
      len = zoneLen + 2;
      setE(g, g.E * 0.96);
      break;
    }
  }
  // Occasionally scatter a coin trail through the safe line.
  if (rng.chance(0.35)) coinTrail(g, z0 - 4, 4);
  g.z += len + P.gap * 0.7;
}

function bonusPattern(g: Gen) {
  const rng = g.rng;
  if (g.mech.has('pickup') && rng.chance(0.55)) {
    const side = rng.chance(0.5) ? -1 : 1;
    const amount = niceRound(Math.max(3, g.E * rng.range(0.15, 0.35) + 3));
    g.pickups.push({ id: g.nextId++, kind: 'stragglers', x: side * rng.range(2.2, 3.4), z: g.z + 4, amount });
    markUsed(g, 'pickup');
    if (g.level > 8 && rng.chance(0.5)) guardLane(g, side * 2.6, g.z);
    setE(g, g.E + amount * 0.6);
  } else {
    coinTrail(g, g.z, rng.int(5, 8));
  }
  g.z += 8 + g.P.gap * 0.5;
}

function coinTrail(g: Gen, z: number, n: number) {
  let x = g.rng.range(-3, 3);
  const value = 1 + Math.floor(g.level / 15);
  for (let i = 0; i < n; i++) {
    g.pickups.push({ id: g.nextId++, kind: 'coin', x, z: z + i * 1.6, amount: value });
    x = clamp(x + g.rng.range(-0.8, 0.8), -3.8, 3.8);
  }
}

function rivalPattern(g: Gen, boss: boolean) {
  const ratio = boss ? clamp(g.P.rivalRatio + 0.12, 0.45, 0.88) : g.P.rivalRatio * g.rng.range(0.8, 1.05);
  const basis = Math.sqrt(g.E * g.Elow);
  const count = Math.max(3, Math.round(basis * ratio));
  g.rivals.push({ id: g.nextId++, z: g.z + 8, x: g.rng.range(-1.5, 1.5), count, boss });
  markUsed(g, 'rival');
  setE(g, g.E - count, g.Elow - count);
  g.z += 8 + g.P.gap;
}

function riskRewardPattern(g: Gen) {
  // Two lanes: big multiplier behind a hazard vs. a guaranteed bonus.
  const k = g.E < 50 ? g.rng.pick([3, 4, 5]) : g.rng.pick([2, 3]);
  const safeVal = niceRound(Math.max(5, g.E * (k - 1) * g.rng.range(0.3, 0.55)));
  const row = rowFromOptions(g, [{ op: { kind: 'mul', n: k } }, { op: { kind: 'add', n: safeVal } }], g.z + 10);
  markUsed(g, 'gate_mul', 'gate_add');
  const big = row.gates.find((x) => x.op.kind === 'mul')!;
  guardLane(g, (big.x0 + big.x1) / 2, g.z + 4);
  setE(g, Math.max(g.E + safeVal, g.E * k * 0.75));
  g.z += 10 + g.P.gap;
}

function turnstilePattern(g: Gen) {
  // VIP lane: only a crowd >= threshold may pass; behind it a juicy gate.
  const side = g.rng.chance(0.5) ? -1 : 1;
  const T = Math.max(8, niceRound(g.E * g.rng.range(0.6, 1.05)));
  obstacle(g, 'turnstile', { x: side * HALF / 2, z: g.z + 3, w: HALF / 2, d: 0.4, hp: T });
  const k = g.rng.pick([2, 3]);
  const safe = niceRound(Math.max(4, g.E * 0.4));
  const left = side < 0 ? { op: { kind: 'mul' as const, n: k } } : { op: { kind: 'add' as const, n: safe } };
  const right = side < 0 ? { op: { kind: 'add' as const, n: safe } } : { op: { kind: 'mul' as const, n: k } };
  // Row is not shuffled here: lanes must match the turnstile side.
  g.rows.push({
    id: g.nextId++,
    z: g.z + 7,
    gates: [
      { x0: -HALF, x1: 0, op: left.op },
      { x0: 0, x1: HALF, op: right.op },
    ],
  });
  markUsed(g, 'gate_mul', 'gate_add');
  setE(g, g.E >= T ? g.E * k * 0.85 : g.E + safe);
  g.z += 7 + g.P.gap;
}

function boxesPattern(g: Gen) {
  // Destructible boxes cost members but hide a big group of stragglers.
  const side = g.rng.chance(0.5) ? -1 : 1;
  const hp = Math.max(3, niceRound(g.E * g.rng.range(0.12, 0.22)));
  obstacle(g, 'boxes', { x: side * 2.5, z: g.z + 2, w: 2.4, d: 0.9, hp });
  const amount = niceRound(hp * g.rng.range(2.2, 3.2));
  g.pickups.push({ id: g.nextId++, kind: 'stragglers', x: side * 2.5, z: g.z + 6, amount });
  markUsed(g, 'pickup');
  setE(g, g.E + (amount - hp) * 0.6);
  g.z += 8 + g.P.gap;
}

/* ------------------------------------------------------------------ */
/* Challenges & tutorial                                               */
/* ------------------------------------------------------------------ */

function makeChallenge(rng: Rng, level: number, Efinish: number, peakE: number, bigMul: boolean): ChallengeDef | undefined {
  if (level < 4 || level % 3 !== 1) return undefined;
  const kinds: ChallengeDef['kind'][] = ['finishWith', 'maxLoss', 'peak'];
  if (level >= 12) kinds.push('noDivide');
  if (bigMul) kinds.push('bigMultiplier');
  const kind = rng.pick(kinds);
  const rewardGems = 2 + Math.min(6, Math.floor(level / 40));
  switch (kind) {
    case 'finishWith':
      return { kind, target: Math.max(10, niceRound(Efinish * 0.9)), rewardGems };
    case 'maxLoss':
      return { kind, target: Math.max(5, niceRound(peakE * 0.12)), rewardGems };
    case 'peak':
      return { kind, target: Math.max(20, niceRound(peakE * 0.95)), rewardGems };
    case 'noDivide':
      return { kind, target: 0, rewardGems };
    case 'bigMultiplier':
      return { kind, target: 3, rewardGems };
  }
}

/** Level 1: hand-authored so the player learns move → gate → multiplier → obstacle → finish. */
function tutorialLevel(seed: number, P: DifficultyParams, themeIndex: number): LevelDef {
  const rows: GateRowDef[] = [
    { id: 1, z: 34, gates: [{ x0: -HALF, x1: 0, op: { kind: 'add', n: 15 } }, { x0: 0, x1: HALF, op: { kind: 'add', n: 3 } }] },
    { id: 2, z: 92, gates: [{ x0: -HALF, x1: 0, op: { kind: 'add', n: 10 } }, { x0: 0, x1: HALF, op: { kind: 'mul', n: 3 } }] },
    { id: 3, z: 160, gates: [{ x0: -HALF, x1: 0, op: { kind: 'mul', n: 2 } }, { x0: 0, x1: HALF, op: { kind: 'add', n: 20 } }] },
  ];
  const obstacles: ObstacleDef[] = [
    { id: 10, kind: 'wall', x: -2.4, z: 118, w: 2.6, d: 0.35 },
    { id: 11, kind: 'wall', x: 2.4, z: 132, w: 2.6, d: 0.35 },
  ];
  const pickups: PickupDef[] = [];
  for (let i = 0; i < 6; i++) pickups.push({ id: 20 + i, kind: 'coin', x: 2.5, z: 60 + i * 1.6, amount: 1 });
  pickups.push({ id: 30, kind: 'stragglers', x: -2.6, z: 74, amount: 5 });
  const length = 205;
  const expected = (5 + 15 + 5) * 3 * 2;
  return {
    level: 1, seed, world: 1, themeIndex, isBoss: false, difficulty: 0, speed: P.speed, length, startCount: BASE_START_COUNT,
    gateRows: rows, obstacles, rivals: [], pickups,
    finish: { z: length, multipliers: FINISH_MULTIPLIERS, stepCost: Math.max(1, Math.round(expected / 9)) },
    mutators: [], mechanics: ['gate_add', 'gate_mul', 'wall', 'pickup'], tutorial: true, expectedFinish: expected,
  };
}
