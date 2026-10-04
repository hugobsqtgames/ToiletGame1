import * as THREE from 'three';
import { TRACK } from '../core/config';
import { activeOp, gateLabelLines, gateTone, type GateTone } from '../core/gates';
import { formatCount } from '../core/format';
import { rivalRadius, rowOffset, sliderX, stallZ, stomperCycle, sweeperAngle, STOMP_END, STOMP_START, type Simulation } from '../core/simulation';
import type { GateRowDef, LevelDef, ObstacleDef } from '../core/types';
import { getWorld, type ThemeColors } from '../core/worlds';
import { RIVAL_LOOK } from '../meta/skins';
import { characterGeometry, STRAGGLER_LOOK } from './characters';
import { CrowdView } from './CrowdView';
import { buildEnvironment, GROUND_Y } from './environment/build';
import { toiletProp } from './environment/kits';
import { disposeObject, mergeParts, Pill, skyDome, type Part } from './geo';
import { gateLabelScale } from './labelFit';
import { bakeText, TextLabel, textMaterial } from './text3d';

const HALF = TRACK.width / 2;
export const GATE_COLORS: Record<GateTone, string> = { good: '#2FA8FF', bad: '#FF4D5E', mystery: '#A66BFF', cond: '#FFB020' };
const MUL_COLOR = '#2BD47D';
export const STALL_COLORS = ['#7FD3FF', '#5BC0FF', '#4DD0B5', '#5CD65C', '#B5E655', '#FFE14D', '#FFB84D', '#FF8A4D', '#FF5F7A', '#D65CFF'];

const B = (x: number, y: number, z: number) => new THREE.BoxGeometry(x, y, z);
const C = (rt: number, rb: number, h: number, seg = 10) => new THREE.CylinderGeometry(rt, rb, h, seg);
const S = (r: number, w = 10, h = 8) => new THREE.SphereGeometry(r, w, h);
const wz = (simZ: number) => -simZ;
const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _e = new THREE.Euler();
const _v = new THREE.Vector3();
const ONE = new THREE.Vector3(1, 1, 1);
const WHITE = new THREE.Color('#FFFFFF');
const ZERO = new THREE.Vector3(0, 0, 0);

interface GateVisual {
  row: GateRowDef;
  group: THREE.Group;
  panels: { mesh: THREE.Mesh; mat: THREE.MeshBasicMaterial; base: THREE.Color; label: TextLabel; small?: TextLabel; gateIndex: number; phase: number; /** Label scale that fits the panel. */ fit: number; fitSmall: number }[];
  taken: number; // gate index taken, -1 none, -2 missed
  anim: number;
}

interface Dyn {
  update(t: number, sim: Simulation, dt: number): void;
}

/** Builds and animates every object of one level. dispose() frees all GPU memory. */
export class LevelView extends THREE.Group {
  readonly colors: ThemeColors;
  private dyn: Dyn[] = [];
  private gates: GateVisual[] = [];
  private rivals = new Map<number, { view: CrowdView; label: TextLabel; pill: Pill; lastCount: number }>();
  private pickups = new Map<number, THREE.Object3D>();
  private coinMesh: THREE.InstancedMesh | null = null;
  private coinIds: number[] = [];
  private coinHidden = new Set<number>();
  private breakables = new Map<number, THREE.Object3D>();
  private turnstiles: { o: ObstacleDef; label: THREE.Object3D; mat: THREE.MeshBasicMaterial; arms: THREE.Object3D }[] = [];
  private labelMat: THREE.MeshBasicMaterial;
  private darkLabelMat: THREE.MeshBasicMaterial;
  private lambert: THREE.MeshLambertMaterial;
  readonly sky: THREE.Mesh;
  private skyExtras: THREE.Group | null = null;

  constructor(readonly def: LevelDef) {
    super();
    const world = getWorld(def.world);
    this.colors = world.colors;
    this.lambert = new THREE.MeshLambertMaterial({ vertexColors: true });
    this.labelMat = textMaterial('#FFFFFF');
    this.darkLabelMat = textMaterial('#2B3566');
    this.sky = skyDome(this.colors.skyTop, this.colors.skyBottom);
    this.add(this.sky);

    const statics: Part[] = [];
    this.buildTrack(statics);
    this.buildFinish(statics);
    for (const o of def.obstacles) this.buildObstacle(o, statics);
    const staticMesh = new THREE.Mesh(mergeParts(statics), this.lambert);
    staticMesh.matrixAutoUpdate = false;
    this.add(staticMesh);
    for (const s of statics) s.geo.dispose();

    const lastStall = stallZ(def, def.finish.multipliers.length - 1);
    const env = buildEnvironment({
      kind: world.theme.id,
      colors: this.colors,
      seed: def.seed,
      zStart: -70,
      zEnd: lastStall + 90,
      finishZ: def.finish.z,
      lastStallZ: lastStall,
    });
    this.add(env.group);
    this.skyExtras = env.sky;
    this.add(env.sky);

    for (const row of def.gateRows) this.buildGateRow(row);
    this.buildPickups();
    this.buildRivals();
  }

  /* ---------------- track ---------------- */

  private buildTrack(out: Part[]) {
    const start = -30;
    const end = this.def.finish.z + TRACK.finishLength + 12;
    const tile = 2;
    const nx = Math.round(TRACK.width / tile);
    const nz = Math.ceil((end - start) / tile);
    const pos: number[] = [];
    const col: number[] = [];
    const nor: number[] = [];
    const a = new THREE.Color(this.colors.tileA);
    // Softer checker: the track is a stage, not the star.
    const b = new THREE.Color(this.colors.tileB).lerp(a, 0.35);
    for (let iz = 0; iz < nz; iz++) {
      for (let ix = 0; ix < nx; ix++) {
        const x0 = -HALF + ix * tile;
        const x1 = x0 + tile;
        const z0 = wz(start + iz * tile);
        const z1 = wz(start + (iz + 1) * tile);
        const c = (ix + iz) % 2 === 0 ? a : b;
        pos.push(x0, 0, z0, x1, 0, z0, x1, 0, z1, x0, 0, z0, x1, 0, z1, x0, 0, z1);
        for (let k = 0; k < 6; k++) {
          col.push(c.r, c.g, c.b);
          nor.push(0, 1, 0);
        }
      }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    out.push({ geo: g, color: null });
    const len = end - start;
    const mid = wz((start + end) / 2);
    // Track dressing: colored edge bands + painted forward chevrons (speed cue).
    for (const side of [-1, 1]) {
      out.push({ geo: B(0.55, 0.02, len), color: this.colors.accent, pos: [side * (HALF - 0.3), 0.012, mid] });
      out.push({ geo: B(0.12, 0.022, len), color: '#FFFFFF', pos: [side * (HALF - 0.68), 0.013, mid] });
    }
    const chevron = new THREE.Color(this.colors.tileA).lerp(new THREE.Color(this.colors.accent), 0.35).getStyle();
    for (let z = 12; z < this.def.finish.z - 4; z += 18) {
      if (this.def.gateRows.some((r) => Math.abs(r.z - z) < 4)) continue;
      for (const k of [0, 1]) {
        for (const side of [-1, 1]) {
          out.push({ geo: B(1.7, 0.02, 0.45), color: chevron, pos: [side * 0.62, 0.014, wz(z + k * 1.2)], rot: [0, side * 0.55, 0] });
        }
      }
    }
    // Platform body + rails
    out.push({ geo: B(TRACK.width + 0.6, -GROUND_Y, len), color: this.colors.wall, pos: [0, GROUND_Y / 2 - 0.005, mid] });
    out.push({ geo: B(0.3, 0.32, len), color: this.colors.rail, pos: [-HALF - 0.15, 0.16, mid] });
    out.push({ geo: B(0.3, 0.32, len), color: this.colors.rail, pos: [HALF + 0.15, 0.16, mid] });
    // Start arch
    for (const sx of [-1, 1]) out.push({ geo: B(0.5, 3.6, 0.5), color: this.colors.accent, pos: [sx * (HALF + 0.3), 1.8, wz(2)] });
    out.push({ geo: B(TRACK.width + 1.1, 0.7, 0.5), color: this.colors.accent, pos: [0, 3.6, wz(2)] });
    const startLabel = bakeText('START', this.labelMat, 0.62);
    startLabel.position.set(0, 3.6, wz(2) + 0.3);
    this.add(startLabel);
  }

  /* ---------------- finish: the stalls corridor ---------------- */

  private buildFinish(out: Part[]) {
    const f = this.def.finish;
    const zLine = wz(f.z);
    // Checkered finish line
    for (let i = 0; i < 10; i++) {
      for (let r = 0; r < 2; r++) {
        out.push({ geo: B(1, 0.03, 0.5), color: (i + r) % 2 === 0 ? '#111111' : '#FFFFFF', pos: [-HALF + 0.5 + i, 0.015, zLine - r * 0.5] });
      }
    }
    for (const sx of [-1, 1]) out.push({ geo: B(0.5, 4.2, 0.5), color: '#FFD54F', pos: [sx * (HALF + 0.3), 2.1, zLine] });
    out.push({ geo: B(TRACK.width + 1.1, 0.9, 0.5), color: '#FFD54F', pos: [0, 4.2, zLine] });
    const fl = bakeText('FINISH', this.darkLabelMat, 0.66);
    fl.position.set(0, 4.2, zLine + 0.3);
    this.add(fl);

    // Stall pairs with multiplier signs.
    f.multipliers.forEach((m, i) => {
      const z = wz(stallZ(this.def, i));
      const color = STALL_COLORS[i % STALL_COLORS.length];
      for (const side of [-1, 1]) {
        const x = side * (HALF - 1.1);
        out.push({ geo: B(2.2, 2.4, 0.12), color, pos: [x, 1.2, z - 1.6] });
        out.push({ geo: B(0.12, 2.4, 3.2), color, pos: [side * HALF, 1.2, z] });
        out.push({ geo: B(2.2, 0.1, 3.2), color: '#FFFFFF', pos: [x, 2.45, z] });
        for (const p of toiletProp()) {
          out.push({ ...p, geo: p.geo, pos: [x + side * 0.4 + (p.pos?.[0] ?? 0), p.pos?.[1] ?? 0, z - 1.0 - (p.pos?.[2] ?? 0)], rot: [0, Math.PI, 0] });
        }
      }
      // Multiplier signs sit on the roof edge of each cubicle, facing the camera.
      const text = 'x' + (Number.isInteger(m) ? m : m.toFixed(1));
      for (const side of [-1, 1]) {
        const lab = bakeText(text, this.labelMat, 0.5);
        lab.position.set(side * (HALF - 1.1), 2.95, z + 1.68);
        this.add(lab);
        out.push({ geo: B(2.1, 0.75, 0.12), color: '#1D2340', pos: [side * (HALF - 1.1), 2.95, z + 1.55] });
      }
    });
    // The Royal Throne at the very end.
    const tz = wz(stallZ(this.def, f.multipliers.length - 1) + 9);
    out.push({ geo: B(4.4, 0.6, 4.4), color: '#C2185B', pos: [0, 0.3, tz] });
    for (const p of toiletProp('#FFD54F', '#FFC107', 4.2)) out.push({ ...p, pos: [p.pos?.[0] ?? 0, (p.pos?.[1] ?? 0) + 0.6, tz - (p.pos?.[2] ?? 0)], rot: [0, Math.PI, 0] });
    for (let i = 0; i < 5; i++) {
      const a = (i / 5) * Math.PI * 2;
      out.push({ geo: new THREE.ConeGeometry(0.25, 0.6, 5), color: '#FFD54F', pos: [Math.cos(a) * 0.7, 3.9, tz + 1.0 + Math.sin(a) * 0.7] });
    }
    out.push({ geo: C(0.85, 0.85, 0.3, 14), color: '#FFC107', pos: [0, 3.55, tz + 1.0] });
  }

  /* ---------------- gates ---------------- */

  private buildGateRow(row: GateRowDef) {
    const group = new THREE.Group();
    group.position.z = wz(row.z);
    const vis: GateVisual = { row, group, panels: [], taken: -1, anim: 0 };
    const pillarParts: Part[] = [];
    row.gates.forEach((g, gi) => {
      const w = g.x1 - g.x0;
      const cx = (g.x0 + g.x1) / 2;
      const mat = new THREE.MeshBasicMaterial({ color: '#FFFFFF', transparent: true, opacity: 0.68, depthWrite: false });
      const mesh = new THREE.Mesh(B(w - 0.18, 2.3, 0.12), mat);
      mesh.position.set(cx, 1.25, 0);
      group.add(mesh);
      const label = new TextLabel(this.labelMat, 1.0, 5);
      label.position.set(cx, 1.45, 0.12);
      group.add(label);
      let small: TextLabel | undefined;
      if (g.op.kind === 'cond') {
        small = new TextLabel(this.labelMat, 0.36, 10);
        small.position.set(cx, 0.55, 0.12);
        group.add(small);
      }
      vis.panels.push({ mesh, mat, base: new THREE.Color(), label, small, gateIndex: gi, phase: -1, fit: 1, fitSmall: 1 });
      this.applyGateLook(vis.panels[vis.panels.length - 1], row, 0);
      pillarParts.push({ geo: B(0.22, 2.6, 0.32), color: '#FFFFFF', pos: [g.x0 + 0.05, 1.3, 0] });
      pillarParts.push({ geo: B(0.22, 2.6, 0.32), color: '#FFFFFF', pos: [g.x1 - 0.05, 1.3, 0] });
      pillarParts.push({ geo: B(w, 0.2, 0.32), color: '#FFFFFF', pos: [cx, 2.5, 0] });
    });
    const pillars = new THREE.Mesh(mergeParts(pillarParts), this.lambert);
    for (const p of pillarParts) p.geo.dispose();
    group.add(pillars);
    this.add(group);
    this.gates.push(vis);
  }

  private applyGateLook(p: GateVisual['panels'][number], row: GateRowDef, t: number) {
    const gate = row.gates[p.gateIndex];
    const op = activeOp(gate, t);
    const phase = gate.timed ? Math.floor(t / gate.timed.period) % 2 : 0;
    if (phase === p.phase) return;
    p.phase = phase;
    const tone = gateTone(op);
    p.base.set(op.kind === 'mul' ? MUL_COLOR : GATE_COLORS[tone]);
    p.mat.color.copy(p.base);
    const lines = gateLabelLines(op);
    const panel = gate.x1 - gate.x0 - 0.18;
    p.label.setText(lines.big);
    p.fit = gateLabelScale(lines.big, panel, 1.0);
    p.label.scale.setScalar(p.fit);
    if (p.small) {
      const small = `${lines.small ?? ''} ${lines.small2 ?? ''}`.trim().replace('ELSE ', '/');
      p.small.setText(small);
      p.fitSmall = gateLabelScale(small, panel, 0.36);
      p.small.scale.setScalar(p.fitSmall);
    }
    if (gate.timed) p.mat.opacity = phase === 0 ? 0.78 : 0.6;
  }

  /** Called by the controller when the crowd passes a gate row. */
  onGateTaken(rowId: number, gateIndex: number) {
    const v = this.gates.find((g) => g.row.id === rowId);
    if (!v) return;
    v.taken = gateIndex;
    v.anim = 0;
  }

  /* ---------------- obstacles ---------------- */

  private buildObstacle(o: ObstacleDef, out: Part[]) {
    const z = wz(o.z);
    switch (o.kind) {
      case 'wall': {
        out.push({ geo: B(o.w * 2, 1.2, o.d * 2), color: this.colors.wall, pos: [o.x, 0.6, z] });
        const n = Math.max(2, Math.round(o.w * 2 / 0.5));
        for (let i = 0; i < n; i++) {
          out.push({ geo: B((o.w * 2) / n, 0.22, o.d * 2 + 0.04), color: i % 2 ? '#222222' : '#FFD600', pos: [o.x - o.w + (i + 0.5) * ((o.w * 2) / n), 1.1, z] });
        }
        out.push({ geo: C(0.22, 0.22, 0.04, 14), color: '#E53935', pos: [o.x, 0.6, z + o.d + 0.03], rot: [Math.PI / 2, 0, 0] });
        out.push({ geo: B(0.3, 0.07, 0.02), color: '#FFFFFF', pos: [o.x, 0.6, z + o.d + 0.06] });
        break;
      }
      case 'puddle': {
        out.push({ geo: C(1, 1, 0.03, 24), color: '#6EC6FF', pos: [o.x, 0.02, z], scale: [o.w, 1, o.d] });
        out.push({ geo: C(0.6, 0.6, 0.035, 18), color: '#A7DEFF', pos: [o.x - o.w * 0.25, 0.025, z + o.d * 0.2], scale: [o.w * 0.6, 1, o.d * 0.5] });
        // Wet floor sign
        const sx = o.x + (o.x > 0 ? -o.w - 0.4 : o.w + 0.4);
        out.push({ geo: B(0.45, 0.8, 0.04), color: '#FFD600', pos: [sx, 0.4, z + 0.12], rot: [-0.25, 0, 0] });
        out.push({ geo: B(0.45, 0.8, 0.04), color: '#FFD600', pos: [sx, 0.4, z - 0.12], rot: [0.25, 0, 0] });
        out.push({ geo: B(0.12, 0.3, 0.02), color: '#222222', pos: [sx, 0.45, z + 0.22], rot: [-0.25, 0, 0] });
        break;
      }
      case 'sweeper': {
        out.push({ geo: C(0.22, 0.3, 1.0, 10), color: '#78909C', pos: [o.x, 0.5, z] });
        const arm = new THREE.Group();
        arm.position.set(o.x, 0.55, z);
        const parts: Part[] = [{ geo: C(0.06, 0.06, o.w * 2, 8), color: '#8D6E63', rot: [0, 0, Math.PI / 2] }];
        for (const s of [-1, 1]) {
          for (let k = 0; k < 5; k++) parts.push({ geo: S(0.2, 6, 5), color: '#ECEFF1', pos: [s * (o.w - 0.2), -0.2 + (k % 2) * 0.1, (k - 2) * 0.12] });
          parts.push({ geo: C(0.09, 0.09, 0.3, 8), color: '#29B6F6', pos: [s * (o.w - 0.2), 0.12, 0] });
        }
        const mesh = new THREE.Mesh(mergeParts(parts), this.lambert);
        for (const p of parts) p.geo.dispose();
        arm.add(mesh);
        this.add(arm);
        this.dyn.push({ update: (t) => (arm.rotation.y = sweeperAngle(o, t)) });
        break;
      }
      case 'slider': {
        const cart = new THREE.Group();
        cart.position.set(o.x, 0, z);
        const parts: Part[] = [
          { geo: B(o.w * 2, 0.7, o.d * 2), color: '#5C6BC0', pos: [0, 0.5, 0] },
          { geo: B(o.w * 2 + 0.05, 0.12, o.d * 2 + 0.05), color: '#FFD600', pos: [0, 0.82, 0] },
          { geo: C(0.25, 0.2, 0.4, 10), color: '#FFC107', pos: [o.w * 0.4, 1.05, 0] },
          { geo: C(0.03, 0.03, 1.4, 6), color: '#8D6E63', pos: [-o.w * 0.4, 1.4, 0], rot: [0, 0, 0.2] },
        ];
        for (const sx of [-1, 1]) for (const sz of [-1, 1]) parts.push({ geo: C(0.1, 0.1, 0.08, 8), color: '#222222', pos: [sx * (o.w - 0.15), 0.1, sz * (o.d - 0.1)], rot: [0, 0, Math.PI / 2] });
        const mesh = new THREE.Mesh(mergeParts(parts), this.lambert);
        for (const p of parts) p.geo.dispose();
        cart.add(mesh);
        this.add(cart);
        this.dyn.push({ update: (t) => (cart.position.x = sliderX(o, t)) });
        break;
      }
      case 'roller': {
        const roll = new THREE.Group();
        roll.position.set(o.x, o.d, z);
        const parts: Part[] = [
          { geo: C(o.d, o.d, o.w * 2, 16), color: '#FAFAFA', rot: [0, 0, Math.PI / 2] },
          { geo: C(o.d * 0.38, o.d * 0.38, o.w * 2 + 0.02, 10), color: '#B08D57', rot: [0, 0, Math.PI / 2] },
          { geo: B(o.w * 2 + 0.01, 0.04, 0.3), color: '#E0E0E0', pos: [0, -o.d + 0.02, -0.3] },
        ];
        const mesh = new THREE.Mesh(mergeParts(parts), this.lambert);
        for (const p of parts) p.geo.dispose();
        roll.add(mesh);
        this.add(roll);
        this.dyn.push({
          update: (t, sim) => {
            const st = sim.s.rollerStart[o.id];
            if (st === undefined) return;
            const dist = (o.speed ?? 6) * (t - st);
            roll.position.z = wz(o.z - dist);
            mesh.rotation.x = -dist / o.d;
          },
        });
        break;
      }
      case 'stomper': {
        const ringMat = new THREE.MeshBasicMaterial({ color: '#FF3B30', transparent: true, opacity: 0, depthWrite: false });
        const ring = new THREE.Mesh(new THREE.RingGeometry(o.w * 0.75, o.w, 28), ringMat);
        ring.rotation.x = -Math.PI / 2;
        ring.position.set(o.x, 0.03, z);
        this.add(ring);
        const plunger = new THREE.Group();
        plunger.position.set(o.x, 3, z);
        const parts: Part[] = [
          { geo: C(0.07, 0.07, 2.4, 8), color: '#A1662F', pos: [0, 1.5, 0] },
          { geo: S(o.w * 0.75, 16, 8), color: '#D32F2F', pos: [0, 0.35, 0], scale: [1, 0.55, 1] },
        ];
        const mesh = new THREE.Mesh(mergeParts(parts), this.lambert);
        for (const p of parts) p.geo.dispose();
        plunger.add(mesh);
        this.add(plunger);
        this.dyn.push({
          update: (t) => {
            const c = stomperCycle(o, t);
            let y: number;
            if (c < 0.45) y = 3.2;
            else if (c < STOMP_START) y = 3.2 + Math.sin(c * 120) * 0.08 + (c - 0.45) * 2;
            else if (c < STOMP_START + 0.03) y = 3.5 * (1 - (c - STOMP_START) / 0.03);
            else if (c < STOMP_END) y = 0;
            else y = 3.2 * Math.min(1, (c - STOMP_END) / 0.2);
            plunger.position.y = Math.max(0, y) - 0.05;
            ringMat.opacity = c > 0.4 && c < STOMP_END ? 0.35 + 0.5 * Math.min(1, (c - 0.4) / 0.2) : 0.12;
          },
        });
        break;
      }
      case 'blower': {
        const dir = Math.sign(o.push ?? 1);
        const upX = -dir * (HALF + 0.35);
        for (const dz of [-o.d * 0.6, 0, o.d * 0.6]) {
          out.push({ geo: B(0.5, 0.9, 0.9), color: '#ECEFF1', pos: [upX, 1.0, z + dz] });
          out.push({ geo: B(0.08, 0.15, 0.6), color: '#37474F', pos: [upX + dir * 0.26, 0.65, z + dz] });
        }
        const mat = new THREE.MeshBasicMaterial({ color: '#FFFFFF', transparent: true, opacity: 0.55, depthWrite: false });
        const chevGeo = mergeParts([
          { geo: B(0.9, 0.02, 0.16), color: '#FFFFFF', pos: [0, 0, 0.3], rot: [0, dir * 0.7, 0] },
          { geo: B(0.9, 0.02, 0.16), color: '#FFFFFF', pos: [0, 0, -0.3], rot: [0, -dir * 0.7, 0] },
        ]);
        const chevs: THREE.Mesh[] = [];
        for (let i = 0; i < 8; i++) {
          const m = new THREE.Mesh(chevGeo, mat);
          m.position.set(0, 0.04, z + ((i % 4) - 1.5) * (o.d * 0.5));
          this.add(m);
          chevs.push(m);
        }
        this.dyn.push({
          update: (t) => {
            chevs.forEach((m, i) => {
              const u = ((t * 1.2 + i * 0.25) % 1 + 1) % 1;
              m.position.x = dir * (-HALF + 0.6 + u * (TRACK.width - 1.2));
            });
          },
        });
        break;
      }
      case 'boxes': {
        const g = new THREE.Group();
        g.position.set(o.x, 0, z);
        const parts: Part[] = [];
        const nx = Math.max(2, Math.round(o.w * 2 / 0.8));
        for (let i = 0; i < nx; i++) {
          for (let l = 0; l < 2; l++) {
            const bx = -o.w + (i + 0.5) * ((o.w * 2) / nx);
            parts.push({ geo: B((o.w * 2) / nx - 0.04, 0.6, o.d * 2), color: l === 0 ? '#C68B59' : '#D9A066', pos: [bx, 0.3 + l * 0.6, 0], rot: [0, (i + l) % 2 ? 0.05 : -0.04, 0] });
            parts.push({ geo: B(0.08, 0.61, o.d * 2 + 0.02), color: '#E8D3A9', pos: [bx, 0.3 + l * 0.6, 0] });
          }
        }
        const mesh = new THREE.Mesh(mergeParts(parts), this.lambert);
        for (const p of parts) p.geo.dispose();
        g.add(mesh);
        const lab = bakeText('-' + formatCount(o.hp ?? 0), textMaterial('#FF4D5E'), 0.6);
        lab.position.set(0, 1.75, 0);
        g.add(lab);
        this.add(g);
        this.breakables.set(o.id, g);
        break;
      }
      case 'turnstile': {
        for (const sx of [-1, 1]) out.push({ geo: B(0.3, 1.4, 0.3), color: '#FFC107', pos: [o.x + sx * (o.w - 0.15), 0.7, z] });
        const arms = new THREE.Group();
        arms.position.set(o.x, 0.85, z);
        const parts: Part[] = [{ geo: B(o.w * 2 - 0.3, 0.12, 0.12), color: '#ECEFF1' }, { geo: B(o.w * 2 - 0.3, 0.12, 0.12), color: '#ECEFF1', pos: [0, -0.35, 0] }];
        const mesh = new THREE.Mesh(mergeParts(parts), this.lambert);
        for (const p of parts) p.geo.dispose();
        arms.add(mesh);
        this.add(arms);
        const mat = textMaterial('#FF4D5E');
        const label = bakeText(formatCount(o.hp ?? 0) + '+', mat, 0.7);
        label.position.set(o.x, 2.0, z);
        this.add(label);
        out.push({ geo: B(o.w * 2, 0.85, 0.12), color: '#263238', pos: [o.x, 2.0, z - 0.1] });
        this.turnstiles.push({ o, label, mat, arms });
        break;
      }
    }
  }

  /* ---------------- pickups & rivals ---------------- */

  private buildPickups() {
    const coins = this.def.pickups.filter((p) => p.kind === 'coin');
    if (coins.length) {
      const geo = mergeParts([
        { geo: C(0.28, 0.28, 0.07, 16), color: '#FFC83D', rot: [Math.PI / 2, 0, 0] },
        { geo: C(0.18, 0.18, 0.08, 12), color: '#FFE48A', rot: [Math.PI / 2, 0, 0] },
      ]);
      this.coinMesh = new THREE.InstancedMesh(geo, new THREE.MeshLambertMaterial({ vertexColors: true, emissive: new THREE.Color('#5a3d00') }), coins.length);
      this.coinMesh.frustumCulled = false;
      this.coinIds = coins.map((c) => c.id);
      this.add(this.coinMesh);
    }
    const sg = characterGeometry('straggler', STRAGGLER_LOOK);
    for (const p of this.def.pickups) {
      if (p.kind === 'stragglers') {
        const g = new THREE.Group();
        g.position.set(p.x, 0, wz(p.z));
        const n = Math.min(9, Math.max(3, Math.round(Math.sqrt(p.amount) * 1.6)));
        const parts: Part[] = [];
        for (let i = 0; i < n; i++) {
          const a = i * 2.4;
          const r = 0.25 * Math.sqrt(i);
          parts.push({ geo: sg.upper, color: null, pos: [Math.cos(a) * r, 0.12, Math.sin(a) * r], rot: [0, Math.PI + (i % 3) * 0.4, 0] });
          parts.push({ geo: sg.leg, color: null, pos: [Math.cos(a) * r - 0.055, 0.17 + 0.12, Math.sin(a) * r] });
          parts.push({ geo: sg.leg, color: null, pos: [Math.cos(a) * r + 0.055, 0.17 + 0.12, Math.sin(a) * r] });
        }
        parts.push({ geo: C(0.95, 0.95, 0.06, 20), color: '#FFFFFF', pos: [0, 0.03, 0] });
        const mesh = new THREE.Mesh(mergeParts(parts), this.lambert);
        g.add(mesh);
        const lab = bakeText('+' + formatCount(p.amount), textMaterial('#2BD47D'), 0.6);
        lab.position.set(0, 1.35, 0);
        g.add(lab);
        this.add(g);
        this.pickups.set(p.id, g);
      } else if (p.kind === 'key') {
        const g = new THREE.Group();
        g.position.set(p.x, 0.9, wz(p.z));
        const parts: Part[] = [
          { geo: new THREE.TorusGeometry(0.22, 0.07, 8, 16), color: '#FFC107', pos: [0, 0.35, 0] },
          { geo: B(0.1, 0.6, 0.1), color: '#FFC107', pos: [0, -0.1, 0] },
          { geo: B(0.22, 0.08, 0.1), color: '#FFC107', pos: [0.1, -0.3, 0] },
          { geo: B(0.16, 0.08, 0.1), color: '#FFC107', pos: [0.08, -0.15, 0] },
        ];
        const mesh = new THREE.Mesh(mergeParts(parts), new THREE.MeshLambertMaterial({ vertexColors: true, emissive: new THREE.Color('#6b4b00') }));
        for (const q of parts) q.geo.dispose();
        g.add(mesh);
        this.add(g);
        this.pickups.set(p.id, g);
        this.dyn.push({ update: (t) => { g.rotation.y = t * 2.5; g.position.y = 0.9 + Math.sin(t * 3) * 0.12; } });
      }
    }
  }

  private buildRivals() {
    for (const r of this.def.rivals) {
      const view = new CrowdView(RIVAL_LOOK, r.boss ? 'rival-boss' : 'rival', r.boss ? 1.15 : 1);
      view.setFacing(Math.PI, true);
      view.position.set(r.x, 0, wz(r.z));
      const m = Math.min(220, r.count);
      view.snap(m);
      view.mode = 'idle';
      this.add(view);
      const pill = new Pill(new THREE.MeshBasicMaterial({ color: '#E5383B' }), 0.6, new THREE.MeshBasicMaterial({ color: '#FFFFFF' }));
      const label = new TextLabel(this.labelMat, 0.38, 6);
      label.setText(formatCount(r.count));
      pill.setWidth(Math.max(0.8, label.width + 0.4));
      this.add(pill, label);
      this.rivals.set(r.id, { view, label, pill, lastCount: r.count });
    }
  }

  /* ---------------- per-frame ---------------- */

  update(sim: Simulation, dt: number, camera: THREE.Camera) {
    const t = sim.s.t;
    // Sky follows the camera so long levels never leave the dome.
    this.sky.position.set(camera.position.x, 0, camera.position.z);
    this.skyExtras?.position.set(camera.position.x, 0, camera.position.z);
    for (const d of this.dyn) d.update(t, sim, dt);

    // Gates: timed swaps, moving rows, taken animation.
    for (const g of this.gates) {
      if (g.row.moving) g.group.position.x = rowOffset(g.row.moving, t);
      if (g.taken === -1) {
        for (const p of g.panels) this.applyGateLook(p, g.row, t);
        // Mark rows the crowd went past without entering (moving rows).
        if (sim.s.takenRows[g.row.id]) g.taken = -2;
      } else if (g.anim < 1) {
        g.anim = Math.min(1, g.anim + dt * 2.5);
        for (const p of g.panels) {
          if (p.gateIndex === g.taken) {
            p.mat.color.copy(p.base).lerp(WHITE, 0.8 * (1 - g.anim));
            p.mat.opacity = 0.68 * (1 - g.anim * 0.7);
            // Pop then vanish: the passed gate must not loom in front of the camera.
            const k = g.anim < 0.3 ? 1 + g.anim : Math.max(0.001, 1.3 * (1 - (g.anim - 0.3) / 0.7));
            p.label.scale.setScalar(k * p.fit);
            if (p.small) p.small.scale.setScalar(k * p.fitSmall);
          } else {
            const s = Math.max(0.001, 1 - g.anim);
            p.mesh.scale.set(1, s, 1);
            p.label.scale.setScalar(s * p.fit);
            if (p.small) p.small.scale.setScalar(s * p.fitSmall);
          }
        }
      }
    }

    // Coins spin; hidden when collected.
    if (this.coinMesh) {
      const m = _m, q = _q, e = _e, pz = _v;
      let i = 0;
      for (const p of this.def.pickups) {
        if (p.kind !== 'coin') continue;
        const hidden = this.coinHidden.has(p.id);
        e.set(0, t * 3 + p.z, 0);
        q.setFromEuler(e);
        pz.set(p.x, 0.55 + Math.sin(t * 4 + p.z) * 0.08, wz(p.z));
        this.coinMesh.setMatrixAt(i++, m.compose(pz, q, hidden ? ZERO : ONE));
      }
      this.coinMesh.instanceMatrix.needsUpdate = true;
    }

    // Rivals mirror simulation state.
    for (const rs of sim.s.rivals) {
      const v = this.rivals.get(rs.id);
      if (!v) continue;
      const alive = rs.count > 0 && !rs.defeated;
      v.view.visible = alive || v.view.visibleCount > 0;
      // Far away (in the fog) or gone: skip the per-member animation work.
      const far = rs.z - sim.s.z > 70;
      if (!v.view.visible || (far && v.view.visibleCount > 0)) {
        v.pill.visible = v.label.visible = alive && !far;
        continue;
      }
      v.view.position.set(rs.x, 0, wz(rs.z));
      v.view.mode = sim.s.phase === 'battle' && sim.s.rivals[sim.s.activeRival] === rs ? 'fight' : rs.charging ? 'run' : 'idle';
      const m = alive ? Math.min(220, rs.count) : 0;
      v.view.update(m, null, dt, t);
      if (rs.count !== v.lastCount) {
        v.lastCount = rs.count;
        v.label.setText(formatCount(rs.count));
        v.pill.setWidth(Math.max(0.8, v.label.width + 0.4));
      }
      const top = rivalRadius(Math.max(1, rs.count)) * 0.15 + 1.25;
      v.pill.visible = v.label.visible = alive;
      v.pill.position.set(rs.x, top, wz(rs.z));
      v.label.position.set(rs.x, top, wz(rs.z) + 0.05);
      v.pill.quaternion.copy(camera.quaternion);
      v.label.quaternion.copy(camera.quaternion);
    }

    for (const ts of this.turnstiles) {
      const open = !!sim.s.opened[ts.o.id];
      const ok = sim.s.count >= (ts.o.hp ?? 0);
      ts.mat.color.set(open || ok ? '#2BD47D' : '#FF4D5E');
      ts.arms.rotation.x += ((open ? -Math.PI / 2 : 0) - ts.arms.rotation.x) * Math.min(1, dt * 8);
    }
  }

  hidePickup(id: number) {
    const o = this.pickups.get(id);
    if (o) o.visible = false;
    if (this.coinIds.includes(id)) this.coinHidden.add(id);
  }

  breakObstacle(id: number) {
    const o = this.breakables.get(id);
    if (o) o.visible = false;
  }

  rivalPosition(id: number): THREE.Vector3 | null {
    const v = this.rivals.get(id);
    return v ? v.view.position : null;
  }

  dispose() {
    for (const r of this.rivals.values()) r.view.dispose();
    disposeObject(this);
  }
}
