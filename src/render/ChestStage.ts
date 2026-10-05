import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { mergeParts, type Part } from './geo';

/**
 * 3D chest opening stage ("Clash-style" reveal), rendered by the persistent
 * game canvas far away from the level and enclosed in its own backdrop.
 *
 *   drop (lands with a squash) → idle (waits for a tap, light leaks from the seam)
 *   → charge (three knocks, shaking harder) → burst (lid flies open, rays, coins,
 *   gems, flash) → open (glowing, rays turning).
 *
 * Three procedural models matching the game's chunky low-poly style:
 *   basic = "Plunger Chest" (wood + iron, a plunger stuck on the lid),
 *   epic  = "Golden Chest"  (gold + purple trim, gems, a crown),
 *   keys  = "Key Chest"     (steel + dark iron, a big key on the lid).
 */
export type ChestKind = 'basic' | 'epic' | 'keys';
export type ChestPhase = 'hidden' | 'drop' | 'idle' | 'charge' | 'open';

/** Where the stage lives in world space (behind the start line, out of every level). */
export const CHEST_STAGE = new THREE.Vector3(0, 0, 420);

const W = 2.0; // body width
const H = 1.05; // body height
const D = 1.3; // body depth
const LID_R = D / 2;
const LID_SY = 0.62; // lid arch squash

const DROP_T = 0.5;
const LAND_T = 0.45;
const CHARGE_T = 1.15;
const KNOCKS = [0, 0.38, 0.76];
const OPEN_T = 0.55;

interface Theme {
  body: string;
  bodyDark: string;
  trim: string;
  trimDark: string;
  glow: string;
  skyTop: string;
  skyMid: string;
  ray: string;
  sparks: string[];
}

const THEMES: Record<ChestKind, Theme> = {
  basic: {
    body: '#B9773D', bodyDark: '#8A5428', trim: '#7C8A99', trimDark: '#4E5A68', glow: '#FFD36B',
    skyTop: '#2A1C5E', skyMid: '#3B6BE0', ray: '#FFC66B', sparks: ['#FFE14D', '#FFFFFF', '#FFB347'],
  },
  epic: {
    body: '#FFC83D', bodyDark: '#E39B12', trim: '#7B3FD6', trimDark: '#4E2399', glow: '#FFF1A8',
    skyTop: '#2B0F4F', skyMid: '#B04DFF', ray: '#FFD24A', sparks: ['#FFE14D', '#FFFFFF', '#E58BFF', '#7FD3FF'],
  },
  keys: {
    body: '#6E8FB3', bodyDark: '#4C6A8C', trim: '#2E3A48', trimDark: '#1D2530', glow: '#BFF3FF',
    skyTop: '#0F2A4A', skyMid: '#2BA8D9', ray: '#9FEFFF', sparks: ['#BFF3FF', '#FFFFFF', '#FFE14D'],
  },
};

/* ---------------- geometry ---------------- */

const B = (x: number, y: number, z: number) => new THREE.BoxGeometry(x, y, z);
const RB = (x: number, y: number, z: number, r = 0.06) => new RoundedBoxGeometry(x, y, z, 2, r);
const C = (rt: number, rb: number, h: number, seg = 16) => new THREE.CylinderGeometry(rt, rb, h, seg);
const S = (r: number, w = 12, h = 8) => new THREE.SphereGeometry(r, w, h);

function bodyParts(k: ChestKind, th: Theme): Part[] {
  const p: Part[] = [];
  p.push({ geo: RB(W, H, D), color: th.body, pos: [0, H / 2, 0] });
  if (k === 'basic') {
    // Planks
    for (const y of [0.36, 0.7]) p.push({ geo: B(W + 0.012, 0.03, D + 0.012), color: th.bodyDark, pos: [0, y, 0] });
  } else {
    // Panels
    for (const sx of [-1, 1]) p.push({ geo: B(0.5, H * 0.56, 0.03), color: th.bodyDark, pos: [sx * 0.33, H * 0.45, D / 2 + 0.006] });
  }
  // Iron bands, corners, feet
  p.push({ geo: RB(W + 0.08, 0.16, D + 0.08, 0.04), color: th.trim, pos: [0, 0.08, 0] });
  p.push({ geo: RB(W + 0.08, 0.12, D + 0.08, 0.04), color: th.trim, pos: [0, H - 0.06, 0] });
  for (const sx of [-1, 1]) p.push({ geo: RB(0.17, H + 0.02, D + 0.08, 0.03), color: th.trim, pos: [sx * 0.66, H / 2, 0] });
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    p.push({ geo: RB(0.16, H + 0.04, 0.16, 0.03), color: th.trimDark, pos: [sx * (W / 2 + 0.02), H / 2, sz * (D / 2 + 0.02)] });
    p.push({ geo: RB(0.26, 0.1, 0.26, 0.03), color: th.trimDark, pos: [sx * (W / 2 - 0.08), -0.03, sz * (D / 2 - 0.08)] });
  }
  // Rivets on the bands
  for (const sx of [-1, 1]) for (const y of [0.25, 0.55, 0.85]) p.push({ geo: S(0.035, 6, 4), color: th.trimDark, pos: [sx * 0.66, y, D / 2 + 0.045] });
  // Lock plate + keyhole
  p.push({ geo: RB(0.42, 0.46, 0.1, 0.04), color: k === 'epic' ? '#FFE9A0' : th.trim, pos: [0, H - 0.26, D / 2 + 0.04] });
  p.push({ geo: C(0.055, 0.055, 0.04, 10), color: '#151826', pos: [0, H - 0.22, D / 2 + 0.1], rot: [Math.PI / 2, 0, 0] });
  p.push({ geo: B(0.05, 0.12, 0.04), color: '#151826', pos: [0, H - 0.31, D / 2 + 0.1] });
  if (k === 'epic') {
    // Gems studded on the front
    const gems: [number, string][] = [[-0.33, '#FF4D7A'], [0.33, '#3FD0FF']];
    for (const [x, c] of gems) {
      p.push({ geo: new THREE.OctahedronGeometry(0.11), color: c, pos: [x, H * 0.45, D / 2 + 0.06], scale: [1, 1.25, 0.6] });
      p.push({ geo: RB(0.3, 0.3, 0.04, 0.03), color: th.trim, pos: [x, H * 0.45, D / 2 + 0.015] });
    }
  }
  return p;
}

/** Lid parts relative to its hinge (back top edge of the body). */
function lidParts(k: ChestKind, th: Theme): Part[] {
  const p: Part[] = [];
  const arch = new THREE.CylinderGeometry(LID_R, LID_R, W, 28, 1, false, 0, Math.PI);
  p.push({ geo: arch, color: th.body, pos: [0, 0.05, LID_R], rot: [0, 0, Math.PI / 2], scale: [LID_SY, 1, 1] });
  // Caps closing both ends of the arch
  for (const sx of [-1, 1]) {
    const cap = new THREE.CircleGeometry(LID_R, 28, 0, Math.PI);
    p.push({ geo: cap, color: th.bodyDark, pos: [sx * (W / 2), 0.05, LID_R], rot: [0, sx * Math.PI / 2, 0], scale: [1, LID_SY, 1] });
  }
  p.push({ geo: RB(W + 0.08, 0.1, D + 0.08, 0.04), color: th.trim, pos: [0, 0.05, LID_R] });
  // Inner lining (what you see when the lid is thrown open)
  p.push({ geo: B(W - 0.06, 0.03, D - 0.06), color: '#3B2357', pos: [0, -0.005, LID_R] });
  p.push({ geo: B(W - 0.5, 0.032, D - 0.5), color: th.bodyDark, pos: [0, -0.008, LID_R] });
  // Arched bands
  for (const sx of [-1, 0.0001, 1]) {
    if (k !== 'epic' && Math.abs(sx) < 0.5) continue;
    const band = new THREE.TorusGeometry(LID_R + 0.02, 0.07, 6, 24, Math.PI);
    p.push({ geo: band, color: th.trim, pos: [sx * 0.66, 0.05, LID_R], rot: [0, Math.PI / 2, 0], scale: [1, LID_SY, 1] });
  }
  // Latch over the lock
  p.push({ geo: RB(0.3, 0.28, 0.08, 0.03), color: k === 'epic' ? '#FFE9A0' : th.trim, pos: [0, -0.04, D + 0.06] });
  const top = 0.05 + LID_R * LID_SY;
  if (k === 'basic') {
    // A plunger stuck on the lid (it's a toilet game).
    p.push({ geo: C(0.16, 0.3, 0.2, 18), color: '#E5383B', pos: [0.32, top + 0.06, LID_R + 0.05], rot: [0.12, 0, -0.18] });
    p.push({ geo: C(0.2, 0.2, 0.04, 18), color: '#B71C1C', pos: [0.31, top - 0.02, LID_R + 0.05], rot: [0.12, 0, -0.18] });
    p.push({ geo: C(0.045, 0.045, 0.85, 10), color: '#D9A066', pos: [0.4, top + 0.55, LID_R + 0.1], rot: [0.12, 0, -0.18] });
    p.push({ geo: S(0.06, 8, 6), color: '#A86A32', pos: [0.48, top + 0.97, LID_R + 0.15] });
  } else if (k === 'epic') {
    // Crown
    p.push({ geo: C(0.3, 0.27, 0.2, 20), color: '#FFE14D', pos: [0, top + 0.12, LID_R] });
    for (let i = 0; i < 5; i++) {
      const a = (i / 5) * Math.PI * 2;
      p.push({ geo: new THREE.ConeGeometry(0.07, 0.24, 6), color: '#FFE14D', pos: [Math.cos(a) * 0.26, top + 0.32, LID_R + Math.sin(a) * 0.26] });
      p.push({ geo: S(0.04, 6, 4), color: '#FFFFFF', pos: [Math.cos(a) * 0.26, top + 0.45, LID_R + Math.sin(a) * 0.26] });
    }
    p.push({ geo: new THREE.OctahedronGeometry(0.09), color: '#FF4D7A', pos: [0, top + 0.13, LID_R + 0.29] });
  } else {
    // A big key lying on the lid
    const ring = new THREE.TorusGeometry(0.17, 0.06, 8, 20);
    p.push({ geo: ring, color: '#FFD23F', pos: [-0.42, top + 0.04, LID_R], rot: [Math.PI / 2 - 0.25, 0, 0] });
    p.push({ geo: RB(0.62, 0.08, 0.08, 0.02), color: '#FFD23F', pos: [0.02, top + 0.02, LID_R] });
    p.push({ geo: RB(0.08, 0.08, 0.16, 0.02), color: '#FFD23F', pos: [0.22, top + 0.02, LID_R + 0.1] });
    p.push({ geo: RB(0.08, 0.08, 0.12, 0.02), color: '#FFD23F', pos: [0.32, top + 0.02, LID_R + 0.08] });
  }
  return p;
}

function interiorParts(k: ChestKind): Part[] {
  const p: Part[] = [];
  p.push({ geo: B(W - 0.16, 0.02, D - 0.16), color: '#2A1838', pos: [0, H - 0.02, 0] });
  // A heap of treasure peeking out
  const gold = '#FFD23F';
  for (let i = 0; i < 14; i++) {
    const a = i * 2.39996;
    const r = 0.18 + (i % 5) * 0.12;
    p.push({ geo: C(0.11, 0.11, 0.03, 12), color: i % 4 === 0 ? '#FFB300' : gold, pos: [Math.cos(a) * r * 1.4, H + 0.01 + (i % 3) * 0.03, Math.sin(a) * r * 0.75], rot: [0.3 * Math.sin(i), 0, 0.3 * Math.cos(i)] });
  }
  const gemColor = k === 'keys' ? '#7FE8FF' : k === 'epic' ? '#E58BFF' : '#FF6F91';
  for (const [x, z] of [[-0.5, 0.1], [0.45, -0.15], [0.1, 0.28]]) p.push({ geo: new THREE.OctahedronGeometry(0.1), color: gemColor, pos: [x, H + 0.08, z] });
  return p;
}

/** Vertical gradient backdrop sphere (vertex colors), never fogged. */
function backdrop(th: Theme): THREE.Mesh {
  const g = new THREE.SphereGeometry(40, 32, 18);
  const pos = g.getAttribute('position');
  const col = new Float32Array(pos.count * 3);
  const top = new THREE.Color(th.skyTop), mid = new THREE.Color(th.skyMid), bottom = new THREE.Color(th.skyTop).lerp(new THREE.Color(th.skyMid), 0.25);
  const c = new THREE.Color();
  for (let i = 0; i < pos.count; i++) {
    const y = pos.getY(i) / 40;
    if (y > 0.05) c.copy(mid).lerp(top, Math.min(1, (y - 0.05) / 0.6));
    else c.copy(mid).lerp(bottom, Math.min(1, (0.05 - y) / 0.5));
    col.set([c.r, c.g, c.b], i * 3);
  }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  return new THREE.Mesh(g, new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.BackSide, fog: false, depthWrite: false }));
}

/** Additive radial glow disc (bright center → black edge). */
function glowDisc(radius: number, color: string): THREE.Mesh {
  const g = new THREE.CircleGeometry(radius, 40);
  const pos = g.getAttribute('position');
  const col = new Float32Array(pos.count * 3);
  const c = new THREE.Color(color);
  for (let i = 0; i < pos.count; i++) {
    const d = Math.hypot(pos.getX(i), pos.getY(i)) / radius;
    const k = Math.pow(Math.max(0, 1 - d), 2.2);
    col.set([c.r * k, c.g * k, c.b * k], i * 3);
  }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  return new THREE.Mesh(g, new THREE.MeshBasicMaterial({ vertexColors: true, blending: THREE.AdditiveBlending, transparent: true, depthWrite: false, fog: false }));
}

/** God rays: long cones fading to black (additive), fanning out of the chest. */
function rays(color: string): THREE.Group {
  const grp = new THREE.Group();
  const c = new THREE.Color(color);
  for (let i = 0; i < 10; i++) {
    const g = new THREE.ConeGeometry(0.26 + (i % 3) * 0.1, 9, 4, 1, true);
    g.translate(0, -4.5, 0); // apex at the origin, opening upwards after the flip
    g.rotateX(Math.PI);
    const pos = g.getAttribute('position');
    const col = new Float32Array(pos.count * 3);
    for (let v = 0; v < pos.count; v++) {
      const k = Math.pow(1 - Math.min(1, pos.getY(v) / 9), 2) * 0.22;
      col.set([c.r * k, c.g * k, c.b * k], v * 3);
    }
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    const m = new THREE.Mesh(g, new THREE.MeshBasicMaterial({ vertexColors: true, blending: THREE.AdditiveBlending, transparent: true, depthWrite: false, side: THREE.DoubleSide, fog: false }));
    const a = (i / 10) * Math.PI * 2;
    m.rotation.set(0.32 + (i % 3) * 0.16, a, 0, 'YXZ'); // fan out around the vertical
    grp.add(m);
  }
  return grp;
}

/* ---------------- particles ---------------- */

class Burst {
  readonly mesh: THREE.InstancedMesh;
  private n: number;
  private p: Float32Array; // x y z vx vy vz rx ry vr life max size
  private next = 0;
  private static m = new THREE.Matrix4();
  private static q = new THREE.Quaternion();
  private static e = new THREE.Euler();
  private static v = new THREE.Vector3();
  private static s = new THREE.Vector3();
  private static c = new THREE.Color();

  constructor(geo: THREE.BufferGeometry, mat: THREE.Material, n: number) {
    this.n = n;
    this.mesh = new THREE.InstancedMesh(geo, mat, n);
    this.mesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(n * 3), 3);
    this.mesh.frustumCulled = false;
    this.p = new Float32Array(n * 12);
    this.clear();
  }

  clear() {
    this.p.fill(0);
    for (let i = 0; i < this.n; i++) this.write(i, 0);
    this.mesh.instanceMatrix.needsUpdate = true;
  }

  spawn(x: number, y: number, z: number, vx: number, vy: number, vz: number, life: number, size: number, color: THREE.ColorRepresentation) {
    const i = this.next;
    this.next = (this.next + 1) % this.n;
    const o = i * 12;
    this.p.set([x, y, z, vx, vy, vz, Math.random() * 6, Math.random() * 6, (Math.random() - 0.5) * 16, life, life, size], o);
    this.mesh.setColorAt(i, Burst.c.set(color));
    if (this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true;
  }

  update(dt: number, gravity: number) {
    for (let i = 0; i < this.n; i++) {
      const o = i * 12;
      const p = this.p;
      if (p[o + 9] <= 0) continue;
      p[o + 9] -= dt;
      p[o + 4] -= gravity * dt;
      p[o] += p[o + 3] * dt;
      p[o + 1] += p[o + 4] * dt;
      p[o + 2] += p[o + 5] * dt;
      if (p[o + 1] < 0.02 && p[o + 4] < 0) {
        // Bounce on the pedestal floor
        p[o + 1] = 0.02;
        p[o + 4] *= -0.35;
        p[o + 3] *= 0.6;
        p[o + 5] *= 0.6;
      }
      p[o + 6] += p[o + 8] * dt;
      p[o + 7] += p[o + 8] * dt * 0.7;
      this.write(i, Math.min(1, p[o + 9] / Math.min(0.35, p[o + 10])) * p[o + 11]);
    }
    this.mesh.instanceMatrix.needsUpdate = true;
  }

  private write(i: number, scale: number) {
    const o = i * 12;
    const p = this.p;
    Burst.e.set(p[o + 6], p[o + 7], 0);
    Burst.q.setFromEuler(Burst.e);
    Burst.v.set(p[o], p[o + 1], p[o + 2]);
    Burst.s.setScalar(Math.max(0.0001, scale));
    this.mesh.setMatrixAt(i, Burst.m.compose(Burst.v, Burst.q, Burst.s));
  }

  dispose() {
    this.mesh.geometry.dispose();
    this.mesh.dispose();
  }
}

/* ---------------- stage ---------------- */

interface Model {
  root: THREE.Group;
  body: THREE.Group;
  lidPivot: THREE.Group;
  interior: THREE.Mesh;
  backdrop: THREE.Mesh;
}

export class ChestStage extends THREE.Group {
  phase: ChestPhase = 'hidden';
  kind: ChestKind = 'basic';
  /** Notified on phase changes and on the burst (UI reveal, sounds, haptics, flash). */
  onPhase: ((p: ChestPhase) => void) | null = null;
  onBurst: (() => void) | null = null;
  onKnock: ((i: number) => void) | null = null;
  onLand: (() => void) | null = null;

  private t = 0;
  private models = new Map<ChestKind, Model>();
  private model: Model | null = null;
  private lit = new THREE.MeshPhongMaterial({ vertexColors: true, shininess: 70, specular: new THREE.Color('#5a5a5a'), fog: false });
  private seamMat = new THREE.MeshBasicMaterial({ color: '#FFE08A', blending: THREE.AdditiveBlending, transparent: true, depthWrite: false, opacity: 0, fog: false });
  private seam: THREE.Mesh;
  private innerGlow: THREE.Mesh;
  private halo: THREE.Mesh;
  private rays: THREE.Group;
  private pedestal: THREE.Mesh;
  private ring: THREE.Mesh;
  readonly light = new THREE.PointLight('#FFD36B', 0, 9, 1.6);
  private coins: Burst;
  private gems: Burst;
  private sparks: Burst;
  private sparkTimer = 0;
  private knocked = 0;
  private theme: Theme = THEMES.basic;

  constructor() {
    super();
    this.position.copy(CHEST_STAGE);
    this.visible = false;
    // Pedestal
    const pedGeo = mergeParts([
      { geo: C(2.3, 2.5, 0.34, 40), color: '#2B2F55', pos: [0, -0.2, 0] },
      { geo: C(2.0, 2.1, 0.06, 40), color: '#3C4278', pos: [0, -0.01, 0] },
    ]);
    this.pedestal = new THREE.Mesh(pedGeo, new THREE.MeshLambertMaterial({ vertexColors: true, fog: false }));
    this.ring = glowDisc(3.4, '#FFFFFF');
    this.ring.rotation.x = -Math.PI / 2;
    this.ring.position.y = 0.01;
    this.seam = new THREE.Mesh(B(W + 0.03, 0.035, D + 0.03), this.seamMat);
    this.seam.position.y = H + 0.02;
    this.innerGlow = glowDisc(1.2, '#FFE9A0');
    this.innerGlow.rotation.x = -Math.PI / 2;
    this.innerGlow.position.y = H + 0.06;
    this.innerGlow.scale.set(1, 0.7, 1);
    this.halo = glowDisc(4.2, '#FFFFFF');
    this.halo.position.set(0, 1.4, -1.6);
    this.rays = rays('#FFE08A');
    this.rays.position.set(0, H, 0);
    this.light.position.set(0, H + 0.9, 0.6);
    this.coins = new Burst(C(0.11, 0.11, 0.035, 14), new THREE.MeshPhongMaterial({ shininess: 90, specular: new THREE.Color('#888'), fog: false }), 70);
    this.gems = new Burst(new THREE.OctahedronGeometry(0.1), new THREE.MeshPhongMaterial({ shininess: 100, specular: new THREE.Color('#aaa'), fog: false, flatShading: true }), 40);
    this.sparks = new Burst(B(0.07, 0.07, 0.07), new THREE.MeshBasicMaterial({ fog: false }), 120);
    this.add(this.pedestal, this.ring, this.halo, this.rays, this.light, this.coins.mesh, this.gems.mesh, this.sparks.mesh);
  }

  private build(kind: ChestKind): Model {
    const th = THEMES[kind];
    const root = new THREE.Group();
    const body = new THREE.Group();
    const bodyMesh = new THREE.Mesh(mergeParts(bodyParts(kind, th)), this.lit);
    const interior = new THREE.Mesh(mergeParts(interiorParts(kind)), this.lit);
    body.add(bodyMesh, interior);
    const lidPivot = new THREE.Group();
    lidPivot.position.set(0, H, -D / 2);
    lidPivot.add(new THREE.Mesh(mergeParts(lidParts(kind, th)), this.lit));
    body.add(lidPivot);
    root.add(body);
    const bd = backdrop(th);
    return { root, body, lidPivot, interior, backdrop: bd };
  }

  /** Starts the reveal for a chest kind (drop phase). */
  show(kind: ChestKind) {
    this.kind = kind;
    this.theme = THEMES[kind];
    let m = this.models.get(kind);
    if (!m) {
      m = this.build(kind);
      this.models.set(kind, m);
    }
    if (this.model) {
      this.remove(this.model.root, this.model.backdrop);
    }
    this.model = m;
    this.add(m.root, m.backdrop);
    m.root.add(this.seam, this.innerGlow);
    this.seamMat.color.set(this.theme.glow);
    (this.innerGlow.material as THREE.MeshBasicMaterial).color.set(this.theme.glow);
    this.rays.children.forEach((r) => ((r as THREE.Mesh).material as THREE.MeshBasicMaterial).color.set(this.theme.ray));
    (this.halo.material as THREE.MeshBasicMaterial).color.set(this.theme.skyMid);
    (this.ring.material as THREE.MeshBasicMaterial).color.set(this.theme.skyMid);
    this.light.color.set(this.theme.glow);
    this.coins.clear();
    this.gems.clear();
    this.sparks.clear();
    this.knocked = 0;
    this.visible = true;
    this.setPhase('drop');
  }

  hide() {
    this.visible = false;
    this.light.intensity = 0;
    this.setPhase('hidden');
  }

  /** Player tap: starts the charge when the chest is waiting. Returns true if handled. */
  tap(): boolean {
    if (this.phase !== 'idle') return false;
    this.setPhase('charge');
    return true;
  }

  private setPhase(p: ChestPhase) {
    this.phase = p;
    this.t = 0;
    this.onPhase?.(p);
  }

  /** Camera framing for the stage (world space). */
  cameraPose(outPos: THREE.Vector3, outLook: THREE.Vector3, aspect: number) {
    const dist = aspect < 0.55 ? 5.9 : 5.2;
    outPos.copy(this.position).add(_tmp.set(0, 2.3, dist));
    outLook.copy(this.position).add(_tmp.set(0, 0.42, 0));
  }

  update(dt: number, camera: THREE.Camera) {
    if (!this.visible || !this.model) return;
    const m = this.model;
    this.t += dt;
    const t = this.t;
    const th = this.theme;
    m.backdrop.position.copy(camera.position).sub(this.position);
    this.halo.quaternion.copy(camera.quaternion);
    const body = m.body;
    let lid = 0; // lid angle (radians, negative = open)
    let seam = 0;
    let glow = 0;
    let rayK = 0;
    let light = 0;
    body.rotation.set(0, 0, 0);
    body.position.set(0, 0, 0);
    body.scale.set(1, 1, 1);

    switch (this.phase) {
      case 'drop': {
        const f = Math.min(1, t / DROP_T);
        body.position.y = 6 * (1 - f * f);
        body.rotation.y = (1 - f) * 0.9;
        if (t >= DROP_T) {
          // Squash & stretch on landing
          const l = Math.min(1, (t - DROP_T) / LAND_T);
          const sq = Math.sin(l * Math.PI * 2.2) * Math.exp(-l * 4) * 0.22;
          body.scale.set(1 + sq * 0.6, 1 - sq, 1 + sq * 0.6);
          if (!this.knocked) {
            this.knocked = -1;
            this.dust();
            this.onLand?.();
          }
        }
        if (t >= DROP_T + LAND_T) {
          this.knocked = 0;
          this.setPhase('idle');
        }
        break;
      }
      case 'idle': {
        body.position.y = Math.abs(Math.sin(t * 2.4)) * 0.06;
        body.rotation.y = Math.sin(t * 1.1) * 0.12;
        const breathe = 0.5 + 0.5 * Math.sin(t * 3);
        seam = 0.12 + breathe * 0.18;
        lid = -0.04 - breathe * 0.03;
        light = 0.6 + breathe * 0.6;
        this.ambientSparks(dt, 0.18);
        break;
      }
      case 'charge': {
        const k = Math.min(1, t / CHARGE_T);
        // Three knocks, each stronger.
        for (let i = 0; i < KNOCKS.length; i++) if (this.knocked <= i && t >= KNOCKS[i]) {
          this.knocked = i + 1;
          this.onKnock?.(i);
          this.sparkRing(10 + i * 8, 2 + i);
        }
        const since = t - KNOCKS[Math.max(0, this.knocked - 1)];
        const punch = Math.exp(-since * 9) * (0.1 + this.knocked * 0.05);
        body.scale.set(1 + punch, 1 - punch * 0.7, 1 + punch);
        body.rotation.z = Math.sin(t * 46) * (0.02 + k * 0.06);
        body.rotation.y = Math.sin(t * 31) * k * 0.08;
        body.position.y = punch * 0.8;
        seam = 0.3 + k * 0.55;
        lid = -0.06 - k * 0.18 - Math.abs(Math.sin(t * 40)) * k * 0.08;
        light = 1.2 + k * 3;
        this.ambientSparks(dt, 0.05);
        if (t >= CHARGE_T) {
          this.setPhase('open');
          this.explode();
          this.onBurst?.();
        }
        break;
      }
      case 'open': {
        const o = Math.min(1, t / OPEN_T);
        // Lid flies back with a springy overshoot
        const spring = 1 - Math.exp(-o * 6) * Math.cos(o * 11);
        lid = -2.05 * spring;
        const pop = Math.exp(-t * 6) * 0.16;
        body.scale.set(1 + pop, 1 - pop * 0.5, 1 + pop);
        body.position.y = Math.abs(Math.sin(t * 2)) * 0.03;
        glow = 0.7 + 0.3 * Math.sin(t * 4);
        rayK = Math.min(1, t / 0.35);
        light = 2.4 + Math.sin(t * 4) * 0.5 + Math.exp(-t * 3) * 4;
        this.rays.rotation.y += dt * 0.35;
        this.ambientSparks(dt, 0.07, true);
        break;
      }
    }

    m.lidPivot.rotation.x = lid;
    this.seamMat.opacity = seam * (this.phase === 'open' ? 0 : 1);
    this.seam.scale.setScalar(1 + seam * 0.04);
    (this.innerGlow.material as THREE.MeshBasicMaterial).opacity = glow;
    this.innerGlow.visible = glow > 0.01;
    this.rays.visible = rayK > 0;
    this.rays.scale.set(rayK * 1.1, rayK, rayK * 1.1);
    // Bright on the burst, then settles to a soft glow.
    const rayOp = this.phase === 'open' ? 0.45 + 0.55 * Math.exp(-this.t * 1.6) : 0;
    for (const r of this.rays.children) ((r as THREE.Mesh).material as THREE.MeshBasicMaterial).opacity = rayOp;
    const flash = this.phase === 'open' ? Math.exp(-t * 2.5) : 0;
    this.halo.scale.setScalar(0.75 + flash * 0.9 + (this.phase === 'open' ? 0.15 : 0));
    (this.halo.material as THREE.MeshBasicMaterial).opacity = 0.45 + flash * 0.55;
    (this.ring.material as THREE.MeshBasicMaterial).opacity = 0.55 + flash * 0.45;
    this.light.intensity = light;
    this.coins.update(dt, 11);
    this.gems.update(dt, 11);
    this.sparks.update(dt, 1.2);
    void th;
  }

  private dust() {
    for (let i = 0; i < 26; i++) {
      const a = (i / 26) * Math.PI * 2;
      this.sparks.spawn(Math.cos(a) * 1.1, 0.08, Math.sin(a) * 0.8, Math.cos(a) * 3.2, 0.6 + Math.random(), Math.sin(a) * 2.4, 0.6, 1.4, '#C9D3F2');
    }
  }

  private sparkRing(n: number, speed: number) {
    const c = this.theme.sparks;
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2;
      this.sparks.spawn(Math.cos(a) * 0.9, H + 0.05, Math.sin(a) * 0.6, Math.cos(a) * speed, 1 + Math.random() * speed, Math.sin(a) * speed * 0.7, 0.55, 1.1, c[i % c.length]);
    }
  }

  private ambientSparks(dt: number, every: number, fromInside = false) {
    this.sparkTimer -= dt;
    if (this.sparkTimer > 0) return;
    this.sparkTimer = every;
    const c = this.theme.sparks;
    const a = Math.random() * Math.PI * 2;
    if (fromInside) this.sparks.spawn((Math.random() - 0.5) * 1.4, H + 0.1, (Math.random() - 0.5) * 0.8, (Math.random() - 0.5) * 0.6, 1.4 + Math.random() * 1.4, (Math.random() - 0.5) * 0.6, 1.6, 1.2, c[(Math.random() * c.length) | 0]);
    else this.sparks.spawn(Math.cos(a) * 1.6, 0.2 + Math.random() * 1.6, Math.sin(a) * 1.0, 0, 0.5 + Math.random() * 0.5, 0, 1.3, 0.9, c[(Math.random() * c.length) | 0]);
  }

  private explode() {
    const c = this.theme.sparks;
    for (let i = 0; i < 46; i++) {
      const a = Math.random() * Math.PI * 2;
      const s = 1.2 + Math.random() * 2.8;
      this.coins.spawn((Math.random() - 0.5) * 1.2, H + 0.15, (Math.random() - 0.5) * 0.6, Math.cos(a) * s, 6 + Math.random() * 4.5, Math.sin(a) * s * 0.8 + 0.8, 2.2 + Math.random() * 0.8, 1.25, i % 5 === 0 ? '#FFB300' : '#FFD23F');
    }
    const gemColors = this.kind === 'epic' ? ['#E58BFF', '#FF4D7A', '#3FD0FF'] : this.kind === 'keys' ? ['#7FE8FF', '#BFF3FF', '#FFE14D'] : ['#FF6F91', '#7FD3FF', '#C14BFF'];
    for (let i = 0; i < (this.kind === 'epic' ? 26 : 14); i++) {
      const a = Math.random() * Math.PI * 2;
      const s = 1 + Math.random() * 2.4;
      this.gems.spawn((Math.random() - 0.5), H + 0.2, (Math.random() - 0.5) * 0.5, Math.cos(a) * s, 7 + Math.random() * 4, Math.sin(a) * s * 0.8 + 0.6, 2.4 + Math.random() * 0.6, 1.4, gemColors[i % gemColors.length]);
    }
    for (let i = 0; i < 70; i++) {
      const a = Math.random() * Math.PI * 2;
      const s = 2 + Math.random() * 5;
      this.sparks.spawn(0, H + 0.3, 0, Math.cos(a) * s, 2 + Math.random() * 6, Math.sin(a) * s * 0.7, 0.9 + Math.random() * 0.6, 1.3, c[i % c.length]);
    }
  }

  dispose() {
    for (const m of this.models.values()) {
      m.root.traverse((o) => { if ((o as THREE.Mesh).isMesh && o !== this.seam && o !== this.innerGlow) (o as THREE.Mesh).geometry.dispose(); });
      m.backdrop.geometry.dispose();
    }
    this.coins.dispose();
    this.gems.dispose();
    this.sparks.dispose();
  }
}

const _tmp = new THREE.Vector3();
