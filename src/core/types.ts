/**
 * Level data model. A LevelDef is fully deterministic from (level number, seed)
 * and is consumed both by the headless Simulation and by the renderer.
 *
 * Coordinates: x ∈ [-TRACK.width/2, TRACK.width/2] (right = +x),
 * z = distance along the track from the start line (forward = +z).
 */

export type GateOp =
  | { kind: 'add'; n: number }
  | { kind: 'sub'; n: number }
  | { kind: 'mul'; n: number }
  | { kind: 'div'; n: number }
  /** Percentage change, n may be negative (-50 => lose half). */
  | { kind: 'pct'; n: number }
  /** Hidden content, revealed on entry. `hidden` is resolved at generation time. */
  | { kind: 'mystery'; hidden: SimpleGateOp }
  /** `below` applies if count < threshold, else `above`. */
  | { kind: 'cond'; threshold: number; below: SimpleGateOp; above: SimpleGateOp };

export type SimpleGateOp = Extract<GateOp, { kind: 'add' | 'sub' | 'mul' | 'div' | 'pct' }>;

export interface GateDef {
  /** Left/right bounds (relative to the row's offset). */
  x0: number;
  x1: number;
  op: GateOp;
  /** Timed gate: alternates between `op` and `alt` every `period` seconds. */
  timed?: { alt: SimpleGateOp; period: number };
}

export interface GateRowDef {
  id: number;
  z: number;
  gates: GateDef[];
  /** Whole row slides left/right: x offset = amp * sin(t * freq). */
  moving?: { amp: number; freq: number };
}

export type ObstacleKind =
  | 'wall' // static barrier ("Out of order" panels)
  | 'sweeper' // rotating mop bar around a pivot
  | 'slider' // box moving left/right (cleaning cart)
  | 'puddle' // hole/slippery zone: members inside are lost
  | 'roller' // toilet paper roll rolling toward the crowd
  | 'stomper' // plunger slamming periodically (telegraphed)
  | 'blower' // hand-dryer wind zone: pushes the crowd sideways (not lethal)
  | 'boxes' // destructible stack: costs `hp` members, then breaks
  | 'turnstile'; // toll: costs `hp` members to pass (guards a reward)

export interface ObstacleDef {
  id: number;
  kind: ObstacleKind;
  /** Center position at t=0. */
  x: number;
  z: number;
  /** Half extents (x, z) for box-like obstacles; radius in `w` for round ones. */
  w: number;
  d: number;
  /** Motion amplitude / speed / phase (meaning depends on kind). */
  amp?: number;
  speed?: number;
  phase?: number;
  /** Members required (boxes/turnstile). */
  hp?: number;
  /** Lateral push in m/s for blowers (sign = direction). */
  push?: number;
}

export interface RivalDef {
  id: number;
  z: number;
  x: number;
  count: number;
  /** Boss rivals are bigger and wear crowns. */
  boss?: boolean;
}

export interface PickupDef {
  id: number;
  kind: 'stragglers' | 'coin' | 'key';
  x: number;
  z: number;
  /** Members gained for stragglers, coins for coin piles. */
  amount: number;
}

export interface FinishDef {
  z: number;
  /** Multipliers for each stall pair, in order. */
  multipliers: number[];
  /** Members consumed by each stall pair. */
  stepCost: number;
}

export type MutatorId = 'rushHour' | 'butterfingers' | 'rivalry' | 'foggy' | 'mystery' | 'tight' | 'windy';

export type MechanicId =
  | 'gate_add'
  | 'gate_mul'
  | 'gate_sub'
  | 'gate_div'
  | 'gate_pct'
  | 'gate_timed'
  | 'gate_mystery'
  | 'gate_cond'
  | 'gate_moving'
  | 'wall'
  | 'sweeper'
  | 'slider'
  | 'puddle'
  | 'roller'
  | 'stomper'
  | 'blower'
  | 'boxes'
  | 'turnstile'
  | 'rival'
  | 'pickup';

export type ChallengeKind =
  | 'finishWith' // finish with at least N members
  | 'maxLoss' // lose at most N members to obstacles/rivals
  | 'noDivide' // never take ÷ or negative gates
  | 'bigMultiplier' // take a ×N gate at least once
  | 'peak'; // reach a peak of N members

export interface ChallengeDef {
  kind: ChallengeKind;
  target: number;
  rewardGems: number;
}

export interface LevelDef {
  level: number;
  seed: number;
  world: number; // 1-based
  themeIndex: number; // index into base themes
  isBoss: boolean;
  difficulty: number; // 0..∞ (unbounded scalar, see difficulty.ts)
  speed: number;
  length: number; // z of finish line
  startCount: number;
  gateRows: GateRowDef[];
  obstacles: ObstacleDef[];
  rivals: RivalDef[];
  pickups: PickupDef[];
  finish: FinishDef;
  mutators: MutatorId[];
  /** Mechanics present in this level (used for "NEW!" intro cards). */
  mechanics: MechanicId[];
  challenge?: ChallengeDef;
  tutorial: boolean;
  /** Generator's estimate of the count a decent player reaches at the finish. */
  expectedFinish: number;
}
