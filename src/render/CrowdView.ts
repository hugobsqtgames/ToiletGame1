import * as THREE from 'three';
import { LOGIC_MEMBER_CAP } from '../core/config';
import { spacingFor, UNIT_X, UNIT_Z } from '../core/formation';
import { damp } from '../core/math';
import { blobShadowGeometry } from './geo';
import { characterGeometry, HIP_X, HIP_Y, type Look } from './characters';

/**
 * Instanced crowd: 3 draw calls for the bodies (+1 for shadows) regardless of
 * the number of members. Visual slot i mirrors logic slot i of the simulation
 * so what you see is exactly what collides.
 */
export type CrowdMode = 'idle' | 'run' | 'fight' | 'cheer';

const MAX = LOGIC_MEMBER_CAP;
const _m = new THREE.Matrix4();
const _leg = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _e = new THREE.Euler();
const _p = new THREE.Vector3();
const _s = new THREE.Vector3();
const _hip = new THREE.Matrix4();

let sharedShadowGeo: THREE.BufferGeometry | null = null;

export class CrowdView extends THREE.Group {
  private upper: THREE.InstancedMesh;
  private legL: THREE.InstancedMesh;
  private legR: THREE.InstancedMesh;
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
    this.legL = new THREE.InstancedMesh(geo.leg, this.material, MAX);
    this.legR = new THREE.InstancedMesh(geo.leg, this.material, MAX);
    sharedShadowGeo ??= Object.assign(blobShadowGeometry(), {});
    sharedShadowGeo.userData.shared = true;
    this.shadowMat = new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, depthWrite: false });
    this.shadows = new THREE.InstancedMesh(sharedShadowGeo, this.shadowMat, MAX);
    this.shadows.renderOrder = 1;
    for (const m of [this.upper, this.legL, this.legR, this.shadows]) {
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
    this.legL.geometry = geo.leg;
    this.legR.geometry = geo.leg;
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
      _p.set(this.px[i], bob, -this.pz[i]);
      _e.set(lean, yaw, sw * (running ? 0.06 : 0.02));
      _q.setFromEuler(_e);
      _s.set(s, s * (1 + 0.04 * Math.cos(ph * 2)), s); // tiny squash & stretch
      _m.compose(_p, _q, _s);
      this.upper.setMatrixAt(n, _m);
      // Legs swing around the hip.
      _hip.makeTranslation(-HIP_X, HIP_Y, 0);
      _leg.makeRotationX(sw * legAmp);
      _hip.multiply(_leg);
      this.legL.setMatrixAt(n, _leg.multiplyMatrices(_m, _hip));
      _hip.makeTranslation(HIP_X, HIP_Y, 0);
      _leg.makeRotationX(-sw * legAmp);
      _hip.multiply(_leg);
      this.legR.setMatrixAt(n, _leg.multiplyMatrices(_m, _hip));
      // Blob shadow stays on the ground.
      const ss = 0.16 * s * (1 - bob * 1.5);
      _p.set(this.px[i], 0.012, -this.pz[i]);
      _q.identity();
      _s.set(ss, 1, ss);
      _m.compose(_p, _q, _s);
      this.shadows.setMatrixAt(n, _m);
      n++;
    }
    this.shown = n;
    for (const m of [this.upper, this.legL, this.legR, this.shadows]) {
      m.count = n;
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
    this.legL.dispose();
    this.legR.dispose();
    this.shadows.dispose();
  }
}
