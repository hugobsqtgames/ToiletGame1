import { BATTLE, CROWD, LOGIC_MEMBER_CAP, TRACK } from './config';
import { radiusFor, logicMembers, spacingFor, UNIT_X, UNIT_Z } from './formation';
import { activeOp, applyOp } from './gates';
import { clamp } from './math';
import type { LevelDef, ObstacleDef, ObstacleKind, SimpleGateOp } from './types';

/**
 * Headless, deterministic gameplay simulation. No rendering, no timers:
 * the caller advances it with step(dt). The renderer only reads its state
 * and consumes its events. The same class powers the autoplay test bot.
 */

export type SimPhase = 'ready' | 'running' | 'battle' | 'finish' | 'won' | 'lost';
export type LossCause = ObstacleKind | 'rival' | 'gate';

export interface Point {
  x: number;
  z: number;
}

export type SimEvent =
  | { type: 'gate'; rowId: number; gateIndex: number; op: SimpleGateOp; before: number; after: number; x: number; z: number }
  | { type: 'loss'; amount: number; cause: LossCause; points: Point[] }
  | { type: 'gain'; amount: number; x: number; z: number }
  | { type: 'coin'; id: number; amount: number; x: number; z: number }
  | { type: 'key'; id: number; x: number; z: number }
  | { type: 'boxBreak'; id: number }
  | { type: 'turnstileOpen'; id: number }
  | { type: 'battleStart'; rivalId: number; rivalCount: number }
  | { type: 'battleEnd'; rivalId: number; won: boolean }
  | { type: 'finishLine'; count: number }
  | { type: 'stall'; index: number; multiplier: number }
  | { type: 'won'; stallIndex: number; multiplier: number; finishCount: number; perfect: boolean }
  | { type: 'lost'; cause: LossCause }
  | { type: 'revived'; count: number };

export interface RivalState {
  id: number;
  x: number;
  z: number;
  count: number;
  boss: boolean;
  /** Fractional battle damage accumulator. */
  acc: number;
  charging: boolean;
  defeated: boolean;
}

export interface RunStats {
  gatesTaken: number;
  harmfulGates: number;
  multipliersTaken: number;
  maxMultiplier: number;
  bigMultipliers: number; // ×3 or more
  peak: number;
  lost: number; // to hazards and rivals
  gained: number;
  coins: number;
  keys: number;
  rivalsDefeated: number;
  stragglers: number;
}

export interface SimState {
  t: number;
  phase: SimPhase;
  x: number;
  targetX: number;
  z: number;
  count: number;
  rivals: RivalState[];
  activeRival: number; // index or -1
  rollerStart: Record<number, number>;
  broken: Record<number, true>;
  opened: Record<number, true>;
  takenRows: Record<number, true>;
  takenPickups: Record<number, true>;
  graceUntil: number;
  revived: boolean;
  finishCount: number;
  stallIndex: number;
  stats: RunStats;
  lossCause: LossCause;
  /** Formation size (slots laid out). Slots >= layoutM are unused. */
  layoutM: number;
  /** 1 = slot member died and leaves a hole until the crowd compacts. */
  dead: Uint8Array;
  deadCount: number;
  lastLossT: number;
}

const HALF = TRACK.width / 2;
const R = CROWD.memberRadius;
const STALL_SPACING = 4;
const STALL_OFFSET = 5;
const ROLLER_ACTIVATION = 34;
export const RIVAL_TRIGGER = 15;
/** Seconds without losses before holes in the crowd close up. */
const COMPACT_DELAY = 0.45;

export function stallZ(level: LevelDef, i: number) {
  return level.finish.z + STALL_OFFSET + i * STALL_SPACING;
}

/** Visual/logic radius of a rival crowd. */
export const rivalRadius = (count: number) => radiusFor(logicMembers(count));

/** Stomper lethal window inside its normalized cycle. */
export const STOMP_START = 0.62;
export const STOMP_END = 0.74;
export const stomperCycle = (o: ObstacleDef, t: number) => {
  const c = t * (o.speed ?? 0.5) + (o.phase ?? 0);
  return c - Math.floor(c);
};
export const sliderX = (o: ObstacleDef, t: number) => o.x + (o.amp ?? 0) * Math.sin((o.speed ?? 1) * t + (o.phase ?? 0));
export const sweeperAngle = (o: ObstacleDef, t: number) => (o.phase ?? 0) + (o.speed ?? 1) * t;
export const rowOffset = (moving: { amp: number; freq: number } | undefined, t: number) =>
  moving ? moving.amp * Math.sin(t * moving.freq) : 0;

export class Simulation {
  readonly level: LevelDef;
  s: SimState;
  private events: SimEvent[] = [];

  constructor(level: LevelDef, startBonus = 0, state?: SimState) {
    this.level = level;
    const start = Math.max(1, level.startCount + startBonus);
    this.s = state ?? {
      t: 0,
      phase: 'ready',
      x: 0,
      targetX: 0,
      z: 0,
      count: start,
      rivals: level.rivals.map((r) => ({ id: r.id, x: r.x, z: r.z, count: r.count, boss: !!r.boss, acc: 0, charging: false, defeated: false })),
      activeRival: -1,
      rollerStart: {},
      broken: {},
      opened: {},
      takenRows: {},
      takenPickups: {},
      graceUntil: 0,
      revived: false,
      finishCount: 0,
      stallIndex: -1,
      stats: {
        gatesTaken: 0, harmfulGates: 0, multipliersTaken: 0, maxMultiplier: 1, bigMultipliers: 0,
        peak: start, lost: 0, gained: 0, coins: 0, keys: 0, rivalsDefeated: 0, stragglers: 0,
      },
      lossCause: 'wall',
      layoutM: logicMembers(start),
      dead: new Uint8Array(LOGIC_MEMBER_CAP),
      deadCount: 0,
      lastLossT: -1,
    };
  }

  clone(): Simulation {
    const s = this.s;
    const copy: SimState = {
      ...s,
      rivals: s.rivals.map((r) => ({ ...r })),
      rollerStart: { ...s.rollerStart },
      broken: { ...s.broken },
      opened: { ...s.opened },
      takenRows: { ...s.takenRows },
      takenPickups: { ...s.takenPickups },
      stats: { ...s.stats },
      dead: s.dead.slice(),
    };
    return new Simulation(this.level, 0, copy);
  }

  /* ---------------- input ---------------- */

  start() {
    if (this.s.phase === 'ready') this.s.phase = 'running';
  }

  /** Relative steering (finger delta in meters). */
  moveTarget(dx: number) {
    this.s.targetX = this.clampX(this.s.targetX + dx);
  }

  setTarget(x: number) {
    this.s.targetX = this.clampX(x);
  }

  get radius() {
    return radiusFor(this.s.layoutM);
  }

  /** Number of laid-out slots (alive or dead). */
  get members() {
    return this.s.layoutM;
  }

  get alive() {
    return this.s.layoutM - this.s.deadCount;
  }

  get spacing() {
    return spacingFor(this.s.layoutM);
  }

  /** Re-lays the formation for the current count (closes holes). */
  private relayout() {
    const s = this.s;
    s.layoutM = logicMembers(s.count);
    if (s.deadCount > 0) {
      s.dead.fill(0);
      s.deadCount = 0;
    }
  }

  get finished() {
    return this.s.phase === 'won' || this.s.phase === 'lost';
  }

  get progress() {
    return clamp(this.s.z / this.level.finish.z, 0, 1);
  }

  canRevive() {
    return this.s.phase === 'lost' && !this.s.revived;
  }

  /** Second chance (rewarded ad). Clears the rival that beat the player. */
  revive(count: number) {
    if (!this.canRevive()) return;
    const s = this.s;
    s.revived = true;
    s.count = Math.max(1, Math.floor(count));
    if (s.activeRival >= 0) s.rivals[s.activeRival].defeated = true;
    s.activeRival = -1;
    s.graceUntil = s.t + CROWD.reviveGrace;
    s.phase = s.z >= this.level.finish.z ? 'finish' : 'running';
    this.emit({ type: 'revived', count: s.count });
  }

  drainEvents(): SimEvent[] {
    const e = this.events;
    this.events = [];
    return e;
  }

  private emit(e: SimEvent) {
    this.events.push(e);
  }

  private clampX(x: number) {
    const lim = Math.max(0, HALF - this.radius * 0.92);
    return clamp(x, -lim, lim);
  }

  /* ---------------- simulation ---------------- */

  step(dt: number) {
    const s = this.s;
    if (s.phase === 'ready' || s.phase === 'won' || s.phase === 'lost') return;
    s.t += dt;
    if (s.phase === 'battle') return this.stepBattle(dt);
    if (s.phase === 'finish') return this.stepFinish(dt);

    // Lateral steering toward the finger target.
    s.targetX = this.clampX(s.targetX);
    const maxDx = CROWD.lateralSpeed * dt;
    s.x += clamp(s.targetX - s.x, -maxDx, maxDx);
    s.x = this.clampX(s.x);

    const prevZ = s.z;
    s.z += this.level.speed * dt;

    this.checkGates(prevZ);
    if (s.deadCount > 0 && s.t - s.lastLossT > COMPACT_DELAY) this.relayout();
    if (s.count > 0) this.checkObstacles(dt);
    if (s.count > 0) this.checkPickups();
    if (s.count > 0) this.checkRivals(dt);

    if (s.count <= 0) return this.lose();
    if (s.phase === 'running' && s.z >= this.level.finish.z) {
      s.phase = 'finish';
      s.finishCount = s.count;
      this.emit({ type: 'finishLine', count: s.count });
    }
  }

  private lose() {
    this.s.count = 0;
    this.s.phase = 'lost';
    this.emit({ type: 'lost', cause: this.s.lossCause });
  }

  private setCount(n: number) {
    const s = this.s;
    const before = s.count;
    s.count = clamp(Math.floor(n), 0, CROWD.maxCount);
    if (s.count > s.stats.peak) s.stats.peak = s.count;
    if (s.count > before || s.count < this.alive || (s.deadCount === 0 && logicMembers(s.count) !== s.layoutM)) this.relayout();
  }

  private checkGates(prevZ: number) {
    const s = this.s;
    for (const row of this.level.gateRows) {
      if (s.takenRows[row.id]) continue;
      if (row.z <= prevZ || row.z > s.z) continue;
      s.takenRows[row.id] = true;
      const off = rowOffset(row.moving, s.t);
      const idx = row.gates.findIndex((g) => s.x >= g.x0 + off && s.x < g.x1 + off);
      if (idx < 0) continue; // missed a moving row
      const gate = row.gates[idx];
      const op = activeOp(gate, s.t);
      const resolved = op.kind === 'mystery' ? op.hidden : op.kind === 'cond' ? (s.count < op.threshold ? op.below : op.above) : op;
      const before = s.count;
      const after = applyOp(op, before);
      this.setCount(after);
      const st = s.stats;
      st.gatesTaken++;
      if (after < before) {
        st.harmfulGates++;
        s.lossCause = 'gate';
      } else st.gained += after - before;
      if (resolved.kind === 'mul') {
        st.multipliersTaken++;
        st.maxMultiplier = Math.max(st.maxMultiplier, resolved.n);
        if (resolved.n >= 3) st.bigMultipliers++;
      }
      this.emit({ type: 'gate', rowId: row.id, gateIndex: idx, op: resolved, before, after, x: s.x, z: row.z });
    }
  }

  /** Kills the given logic member indices; converts them to a weighted loss. */
  private killMembers(indices: number[], cause: LossCause) {
    if (indices.length === 0) return;
    const s = this.s;
    const alive = this.alive;
    const k = Math.min(indices.length, alive);
    const amount = k >= alive ? s.count : Math.min(s.count, Math.max(k, Math.round((k * s.count) / alive)));
    for (const i of indices) {
      if (!s.dead[i]) {
        s.dead[i] = 1;
        s.deadCount++;
      }
    }
    s.lastLossT = s.t;
    this.removeCount(amount, cause, indices);
  }

  private removeCount(amount: number, cause: LossCause, indices: number[]) {
    if (amount <= 0) return;
    const s = this.s;
    const sp = this.spacing;
    const points: Point[] = [];
    for (let i = 0; i < indices.length && points.length < 24; i++) {
      const j = indices[i];
      points.push({ x: s.x + UNIT_X[j] * sp, z: s.z + UNIT_Z[j] * sp });
    }
    s.lossCause = cause;
    s.stats.lost += Math.min(amount, s.count);
    this.setCount(s.count - amount);
    this.emit({ type: 'loss', amount, cause, points });
  }

  private checkObstacles(dt: number) {
    const s = this.s;
    const t = s.t;
    const rad = this.radius;
    const graced = t < s.graceUntil;
    for (const o of this.level.obstacles) {
      // Rollers move, so their window is computed from their current position.
      let oz = o.z;
      if (o.kind === 'roller') {
        if (s.rollerStart[o.id] === undefined) {
          if (s.z >= o.z - ROLLER_ACTIVATION) s.rollerStart[o.id] = t;
          else continue;
        }
        oz = o.z - (o.speed ?? 6) * (t - s.rollerStart[o.id]);
      }
      const extentZ = o.kind === 'sweeper' ? o.w : o.kind === 'stomper' ? o.w : o.d;
      if (oz + extentZ < s.z - rad - 0.5 || oz - extentZ > s.z + rad + 0.5) continue;

      switch (o.kind) {
        case 'blower':
          if (Math.abs(s.z - o.z) < o.d) s.targetX = this.clampX(s.targetX + (o.push ?? 0) * dt);
          continue;
        case 'boxes':
          if (s.broken[o.id]) continue;
          if (this.anyMemberInBox(o.x, oz, o.w, o.d)) {
            s.broken[o.id] = true;
            this.emit({ type: 'boxBreak', id: o.id });
            this.removeCount(Math.min(o.hp ?? 1, s.count), 'boxes', this.membersInBox(o.x, oz, o.w, o.d));
          }
          continue;
        case 'turnstile':
          if (s.opened[o.id]) continue;
          if (this.anyMemberInBox(o.x, oz, o.w, o.d)) {
            if (s.count >= (o.hp ?? 0)) {
              s.opened[o.id] = true;
              this.emit({ type: 'turnstileOpen', id: o.id });
            } else if (!graced) {
              this.killMembers(this.membersInBox(o.x, oz, o.w, o.d), 'turnstile');
            }
          }
          continue;
      }
      if (graced) continue;

      let hits: number[] = [];
      switch (o.kind) {
        case 'wall':
          hits = this.membersInBox(o.x, oz, o.w, o.d);
          break;
        case 'slider':
          hits = this.membersInBox(sliderX(o, t), oz, o.w, o.d);
          break;
        case 'roller':
          hits = this.membersInBox(o.x, oz, o.w, o.d);
          break;
        case 'sweeper':
          hits = this.membersInRotatedBar(o.x, oz, o.w, o.d, sweeperAngle(o, t));
          break;
        case 'puddle':
          hits = this.membersInEllipse(o.x, oz, o.w, o.d);
          break;
        case 'stomper': {
          const c = stomperCycle(o, t);
          if (c >= STOMP_START && c <= STOMP_END) hits = this.membersInEllipse(o.x, oz, o.w, o.w);
          break;
        }
      }
      if (hits.length) this.killMembers(hits, o.kind);
      if (s.count <= 0) return;
    }
  }

  private anyMemberInBox(cx: number, cz: number, hw: number, hd: number) {
    return this.membersInBox(cx, cz, hw, hd, true).length > 0;
  }

  private membersInBox(cx: number, cz: number, hw: number, hd: number, firstOnly = false): number[] {
    const s = this.s;
    const m = this.members;
    const sp = this.spacing;
    const out: number[] = [];
    const ex = hw + R;
    const ez = hd + R;
    for (let i = 0; i < m; i++) {
      if (s.dead[i]) continue;
      const px = s.x + UNIT_X[i] * sp;
      const pz = s.z + UNIT_Z[i] * sp;
      if (Math.abs(px - cx) < ex && Math.abs(pz - cz) < ez) {
        out.push(i);
        if (firstOnly) break;
      }
    }
    return out;
  }

  private membersInEllipse(cx: number, cz: number, rx: number, rz: number): number[] {
    const s = this.s;
    const m = this.members;
    const sp = this.spacing;
    const out: number[] = [];
    for (let i = 0; i < m; i++) {
      if (s.dead[i]) continue;
      const dx = (s.x + UNIT_X[i] * sp - cx) / rx;
      const dz = (s.z + UNIT_Z[i] * sp - cz) / rz;
      if (dx * dx + dz * dz < 1) out.push(i);
    }
    return out;
  }

  private membersInRotatedBar(cx: number, cz: number, hl: number, ht: number, angle: number): number[] {
    const s = this.s;
    const m = this.members;
    const sp = this.spacing;
    const c = Math.cos(angle);
    const sn = Math.sin(angle);
    const out: number[] = [];
    for (let i = 0; i < m; i++) {
      if (s.dead[i]) continue;
      const rx = s.x + UNIT_X[i] * sp - cx;
      const rz = s.z + UNIT_Z[i] * sp - cz;
      const lx = rx * c + rz * sn;
      const lz = -rx * sn + rz * c;
      if (Math.abs(lx) < hl + R && Math.abs(lz) < ht + R) out.push(i);
    }
    return out;
  }

  private checkPickups() {
    const s = this.s;
    const rad = this.radius;
    for (const p of this.level.pickups) {
      if (s.takenPickups[p.id]) continue;
      if (p.z > s.z + rad + 1) break; // sorted by z
      if (p.z < s.z - rad - 1) continue;
      const reach = p.kind === 'stragglers' ? 1.0 : 0.55;
      const dx = p.x - s.x;
      const dz = p.z - s.z;
      if (dx * dx + dz * dz > (rad + reach) * (rad + reach)) continue;
      s.takenPickups[p.id] = true;
      if (p.kind === 'stragglers') {
        const before = s.count;
        this.setCount(before + p.amount);
        s.stats.gained += s.count - before;
        s.stats.stragglers += s.count - before;
        this.emit({ type: 'gain', amount: s.count - before, x: p.x, z: p.z });
      } else if (p.kind === 'coin') {
        s.stats.coins += p.amount;
        this.emit({ type: 'coin', id: p.id, amount: p.amount, x: p.x, z: p.z });
      } else {
        s.stats.keys += 1;
        this.emit({ type: 'key', id: p.id, x: p.x, z: p.z });
      }
    }
  }

  private checkRivals(dt: number) {
    const s = this.s;
    const rad = this.radius;
    for (let i = 0; i < s.rivals.length; i++) {
      const r = s.rivals[i];
      if (r.defeated) continue;
      const dz = r.z - s.z;
      if (dz > RIVAL_TRIGGER) continue;
      if (dz < -rad - 10) {
        r.defeated = true; // safety: never leave a rival behind
        continue;
      }
      r.charging = true;
      // Rivals run at the player: unavoidable but readable.
      r.x += clamp(s.x - r.x, -5 * dt, 5 * dt);
      r.z -= 3.5 * dt;
      const rr = rivalRadius(r.count);
      const ddx = r.x - s.x;
      const ddz = r.z - s.z;
      if (Math.sqrt(ddx * ddx + ddz * ddz) < rad + rr) {
        s.activeRival = i;
        s.phase = 'battle';
        this.emit({ type: 'battleStart', rivalId: r.id, rivalCount: r.count });
        return;
      }
    }
  }

  private stepBattle(dt: number) {
    const s = this.s;
    const r = s.rivals[s.activeRival];
    if (!r) {
      s.phase = 'running';
      return;
    }
    // Rival slowly closes in visually.
    r.z += clamp(s.z + this.radius * 0.6 - r.z, -2 * dt, 2 * dt);
    const rate = Math.max(BATTLE.minPerSecond, BATTLE.rate * Math.min(s.count, r.count));
    r.acc += rate * dt;
    let dmg = Math.floor(r.acc);
    if (dmg <= 0) return;
    r.acc -= dmg;
    dmg = Math.min(dmg, s.count, r.count);
    r.count -= dmg;
    const front: number[] = [];
    const m = this.members;
    for (let i = m - 1; i >= 0 && front.length < Math.min(dmg, 6); i -= 3) front.push(i);
    this.removeCount(dmg, 'rival', front);
    if (s.count <= 0) {
      this.emit({ type: 'battleEnd', rivalId: r.id, won: false });
      return this.lose();
    }
    if (r.count <= 0) {
      r.defeated = true;
      s.activeRival = -1;
      s.stats.rivalsDefeated++;
      s.phase = 'running';
      this.emit({ type: 'battleEnd', rivalId: r.id, won: true });
    }
  }

  private stepFinish(dt: number) {
    const s = this.s;
    const L = this.level;
    s.x += clamp(-s.x, -6 * dt, 6 * dt);
    s.targetX = s.x;
    const prevZ = s.z;
    s.z += L.speed * 0.85 * dt;
    const mults = L.finish.multipliers;
    for (let i = s.stallIndex + 1; i < mults.length; i++) {
      const sz = stallZ(L, i);
      if (sz <= prevZ || sz > s.z) break;
      s.stallIndex = i;
      this.emit({ type: 'stall', index: i, multiplier: mults[i] });
      if (s.count <= L.finish.stepCost || i === mults.length - 1) {
        const perfect = i === mults.length - 1 && s.count > L.finish.stepCost;
        s.count = Math.max(0, s.count - L.finish.stepCost);
        s.phase = 'won';
        this.emit({ type: 'won', stallIndex: i, multiplier: mults[i], finishCount: s.finishCount, perfect });
        return;
      }
      s.count -= L.finish.stepCost;
    }
  }
}
