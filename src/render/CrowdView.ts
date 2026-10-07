import * as THREE from 'three';
import { LOGIC_MEMBER_CAP } from '../core/config';
import { spacingFor, UNIT_X, UNIT_Z } from '../core/formation';
import { damp } from '../core/math';
import { blobShadowGeometry } from './geo';
import { characterGeometry, HIP_X, HIP_Y, type Look } from './characters';

/**
 * Instanced crowd: 2 draw calls for the bodies (+1 for shadows) regardless of
 * the number of members. Visual slot i mirrors logic slot i of the simulation
 * so what you see is exactly what collides.
 */
export type CrowdMode = 'idle' | 'run' | 'fight' | 'cheer';

const MAX = LOGIC_MEMBER_CAP;

/** Writes a column-major 4×4 affine matrix (3 columns + translation) at offset o. */
function writeMat(a: Float32Array, o: number, x0: number, x1: number, x2: number, y0: number, y1: number, y2: number, z0: number, z1: number, z2: number, tx: number, ty: number, tz: number) {
  a[o] = x0; a[o + 1] = x1; a[o + 2] = x2; a[o + 3] = 0;
  a[o + 4] = y0; a[o + 5] = y1; a[o + 6] = y2; a[o + 7] = 0;
  a[o + 8] = z0; a[o + 9] = z1; a[o + 10] = z2; a[o + 11] = 0;
  a[o + 12] = tx; a[o + 13] = ty; a[o + 14] = tz; a[o + 15] = 1;
}

let sharedShadowGeo: THREE.BufferGeometry | null = null;

export class CrowdView extends THREE.Group {
  private upper: THREE.InstancedMesh;
  /** Both legs in one mesh: instance 2k = left leg of member k, 2k+1 = right leg. */
  private legs: THREE.InstancedMesh;
  private shadows: THREE.InstancedMesh;
  private material: THREE.MeshLambertMaterial;
  private shadowMat: THREE.MeshBasicMaterial;
  /** Current visual local offsets (relative to crowd center). */
  private px = new Float32Array(MAX);
  private pz = new Float32Array(MAX);
  private sc = new Float32Array(MAX);
  private visible_ = new Uint8Array(MAX);
  private phase = new Float32Array(MAX);
  private jitter = new Float32Array(MAX);
  private shown = 0;
  mode: CrowdMode = 'idle';
  /** Facing: 0 = toward -z (running), PI = toward camera. */
  facing = 0;
  private facingTarget = 0;

  constructor(look: Look, key: string, private readonly sizeScale = 1) {
    super();
    const geo = characterGeometry(key, look);
    this.material = new THREE.MeshLambertMaterial({ vertexColors: true });
    this.upper = new THREE.InstancedMesh(geo.upper, this.material, MAX);
    this.legs = new THREE.InstancedMesh(geo.leg, this.material, MAX * 2);
    sharedShadowGeo ??= Object.assign(blobShadowGeometry(), {});
    sharedShadowGeo.userData.shared = true;
    this.shadowMat = new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, depthWrite: false });
    this.shadows = new THREE.InstancedMesh(sharedShadowGeo, this.shadowMat, MAX);
    this.shadows.renderOrder = 1;
    for (const m of [this.upper, this.legs, this.shadows]) {
      m.frustumCulled = false; // bounds change every frame; the crowd is always on screen
      m.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      m.count = 0;
      this.add(m);
    }
    for (let i = 0; i < MAX; i++) {
      this.phase[i] = Math.random() * Math.PI * 2;
      this.jitter[i] = 0.9 + Math.random() * 0.2;
    }
  }

  setLook(look: Look, key: string) {
    const geo = characterGeometry(key, look);
    this.upper.geometry = geo.upper;
    this.legs.geometry = geo.leg;
  }

  setFacing(rad: number, instant = false) {
    this.facingTarget = rad;
    if (instant) this.facing = rad;
  }

  /** Teleports all members onto their slots (no lerp), e.g. on level load. */
  snap(layoutM: number, dead?: Uint8Array) {
    const sp = spacingFor(layoutM);
    for (let i = 0; i < MAX; i++) {
      const alive = i < layoutM && !(dead && dead[i]);
      this.visible_[i] = alive ? 1 : 0;
      this.sc[i] = alive ? 1 : 0;
      this.px[i] = UNIT_X[i] * sp;
      this.pz[i] = UNIT_Z[i] * sp;
    }
  }

  /**
   * Updates instance matrices.
   * @param layoutM laid out slots; @param dead holes; @param dt frame time; @param t time
   */
  update(layoutM: number, dead: Uint8Array | null, dt: number, t: number) {
    const sp = spacingFor(Math.max(1, layoutM));
    const k = damp(9, dt);
    const ks = damp(10, dt);
    this.facing += (this.facingTarget - this.facing) * damp(8, dt);

    // Reuse members leaving the outer ring to fill re-opened inner holes.
    for (let i = 0; i < layoutM && i < MAX; i++) {
      const alive = !(dead && dead[i]);
      if (alive && !this.visible_[i]) {
        for (let j = MAX - 1; j >= layoutM; j--) {
          if (this.visible_[j]) {
            this.px[i] = this.px[j];
            this.pz[i] = this.pz[j];
            this.sc[i] = this.sc[j];
            this.visible_[j] = 0;
            this.sc[j] = 0;
            break;
          }
        }
      }
      this.visible_[i] = alive ? 1 : 0;
    }
    for (let i = layoutM; i < MAX; i++) this.visible_[i] = 0;

    const running = this.mode === 'run';
    const legAmp = running ? 0.75 : this.mode === 'fight' ? 0.5 : this.mode === 'cheer' ? 0.25 : 0.12;
    const freq = running ? 13 : this.mode === 'fight' ? 16 : this.mode === 'cheer' ? 9 : 3;
    const up = this.upper.instanceMatrix.array as Float32Array;
    const lg = this.legs.instanceMatrix.array as Float32Array;
    const sh = this.shadows.instanceMatrix.array as Float32Array;
    let n = 0;
    for (let i = 0; i < MAX; i++) {
      const target = this.visible_[i] ? 1 : 0;
      if (this.sc[i] < 0.001 && !target) continue;
      this.px[i] += (UNIT_X[i] * sp - this.px[i]) * k;
      this.pz[i] += (UNIT_Z[i] * sp - this.pz[i]) * k;
      this.sc[i] += (target - this.sc[i]) * ks;
      if (this.sc[i] < 0.001 && !target) {
        this.sc[i] = 0;
        continue;
      }
      const ph = t * freq * this.jitter[i] + this.phase[i];
      const sw = Math.sin(ph);
      let bob = Math.abs(Math.cos(ph)) * (running ? 0.05 : 0.02);
      let lean = running ? -0.18 : 0;
      let yaw = this.facing + (running ? sw * 0.08 : 0);
      if (this.mode === 'cheer') {
        bob = Math.max(0, Math.sin(ph * 0.9)) * 0.22;
        yaw = this.facing + Math.sin(t * 2 + this.phase[i]) * 0.4;
        lean = 0;
      } else if (this.mode === 'fight') {
        lean = -0.3;
        bob = Math.abs(sw) * 0.06;
      }
      const s = this.sc[i] * this.sizeScale * (0.94 + 0.12 * (this.jitter[i] - 0.9) * 5);
      const roll = sw * (running ? 0.06 : 0.02);
      // Matrices written by hand (no Euler → quaternion → compose, no generic
      // multiplies): this loop runs for up to 2 × 220 members per frame and is
      // the biggest JS cost of a frame on iOS (Hermes has no JIT).
      // Upper body = T(p) · R(lean, yaw, roll as Euler XYZ) · S(s, s·squash, s).
      const ca = Math.cos(lean), sa = Math.sin(lean);
      const cy = Math.cos(yaw), sy = Math.sin(yaw);
      const cz = Math.cos(roll), sz = Math.sin(roll);
      const sq = s * (1 + 0.04 * Math.cos(ph * 2)); // tiny squash & stretch
      const ae = ca * cz, af = ca * sz, be = sa * cz, bf = sa * sz;
      const m00 = cy * cz * s, m10 = (af + be * sy) * s, m20 = (bf - ae * sy) * s;
      const m01 = -cy * sz * sq, m11 = (ae - bf * sy) * sq, m21 = (be + af * sy) * sq;
      const m02 = sy * s, m12 = -sa * cy * s, m22 = ca * cy * s;
      const px = this.px[i], py = bob, pz = -this.pz[i];
      const o = n * 16;
      writeMat(up, o, m00, m10, m20, m01, m11, m21, m02, m12, m22, px, py, pz);
      // Legs swing around the hip: M · T(±HIP_X, HIP_Y, 0) · Rx(±swing).
      const sl = Math.sin(sw * legAmp), cl = Math.cos(sw * legAmp);
      const hx = px + HIP_Y * m01, hy = py + HIP_Y * m11, hz = pz + HIP_Y * m21;
      writeMat(
        lg, o * 2, m00, m10, m20,
        cl * m01 + sl * m02, cl * m11 + sl * m12, cl * m21 + sl * m22,
        -sl * m01 + cl * m02, -sl * m11 + cl * m12, -sl * m21 + cl * m22,
        hx - HIP_X * m00, hy - HIP_X * m10, hz - HIP_X * m20,
      );
      writeMat(
        lg, o * 2 + 16, m00, m10, m20,
        cl * m01 - sl * m02, cl * m11 - sl * m12, cl * m21 - sl * m22,
        sl * m01 + cl * m02, sl * m11 + cl * m12, sl * m21 + cl * m22,
        hx + HIP_X * m00, hy + HIP_X * m10, hz + HIP_X * m20,
      );
      // Blob shadow stays on the ground.
      const ss = 0.16 * s * (1 - bob * 1.5);
      writeMat(sh, o, ss, 0, 0, 0, 1, 0, 0, 0, ss, px, 0.012, pz);
      n++;
    }
    this.shown = n;
    for (const m of [this.upper, this.legs, this.shadows]) {
      m.count = m === this.legs ? n * 2 : n;
      m.instanceMatrix.needsUpdate = true;
    }
  }

  get visibleCount() {
    return this.shown;
  }

  /** Local offset of a visual slot (for FX spawn). */
  slotOffset(i: number, out: THREE.Vector3) {
    return out.set(this.px[i], 0, -this.pz[i]);
  }

  dispose() {
    this.material.dispose();
    this.shadowMat.dispose();
    this.upper.dispose();
    this.legs.dispose();
    this.shadows.dispose();
  }
}
