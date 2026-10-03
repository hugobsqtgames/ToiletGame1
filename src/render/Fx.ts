import * as THREE from 'three';
import { TextLabel, textMaterial } from './text3d';

/**
 * Pooled visual effects. No allocation after construction:
 *  - particles (confetti, poofs, sparkles): one InstancedMesh,
 *  - flyers (members knocked out, tumbling away): one InstancedMesh per look,
 *  - floating texts (+15, x3...): small TextLabel pool.
 */
const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _e = new THREE.Euler();
const _p = new THREE.Vector3();
const _s = new THREE.Vector3();
const _c = new THREE.Color();

class Pool {
  x: Float32Array; y: Float32Array; z: Float32Array;
  vx: Float32Array; vy: Float32Array; vz: Float32Array;
  rx: Float32Array; ry: Float32Array; vr: Float32Array;
  life: Float32Array; max: Float32Array; size: Float32Array; grav: Float32Array;
  next = 0;
  constructor(readonly n: number) {
    this.x = new Float32Array(n); this.y = new Float32Array(n); this.z = new Float32Array(n);
    this.vx = new Float32Array(n); this.vy = new Float32Array(n); this.vz = new Float32Array(n);
    this.rx = new Float32Array(n); this.ry = new Float32Array(n); this.vr = new Float32Array(n);
    this.life = new Float32Array(n); this.max = new Float32Array(n); this.size = new Float32Array(n); this.grav = new Float32Array(n);
  }
  alloc() {
    const i = this.next;
    this.next = (this.next + 1) % this.n;
    return i;
  }
}

export class Fx extends THREE.Group {
  private parts: THREE.InstancedMesh;
  private pp: Pool;
  private flyers: THREE.InstancedMesh;
  private fp: Pool;
  private labels: { label: TextLabel; mat: THREE.MeshBasicMaterial; life: number; vy: number; vz: number }[] = [];
  private nextLabel = 0;
  private partMat: THREE.MeshLambertMaterial;
  private flyMat: THREE.MeshLambertMaterial;
  private budget = 1;

  constructor(maxParticles = 360, maxFlyers = 70) {
    super();
    this.partMat = new THREE.MeshLambertMaterial({ color: 0xffffff });
    const pg = new THREE.BoxGeometry(1, 1, 0.25);
    this.parts = new THREE.InstancedMesh(pg, this.partMat, maxParticles);
    this.parts.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(maxParticles * 3), 3);
    this.parts.frustumCulled = false;
    this.parts.count = maxParticles;
    this.pp = new Pool(maxParticles);
    this.flyMat = new THREE.MeshLambertMaterial({ vertexColors: true });
    this.flyers = new THREE.InstancedMesh(new THREE.BoxGeometry(0.1, 0.1, 0.1), this.flyMat, maxFlyers);
    this.flyers.frustumCulled = false;
    this.flyers.count = maxFlyers;
    this.fp = new Pool(maxFlyers);
    for (let i = 0; i < maxParticles; i++) this.parts.setMatrixAt(i, _m.makeScale(0, 0, 0));
    for (let i = 0; i < maxFlyers; i++) this.flyers.setMatrixAt(i, _m.makeScale(0, 0, 0));
    this.add(this.parts, this.flyers);
    for (let i = 0; i < 6; i++) {
      const mat = textMaterial('#FFFFFF', { transparent: true, depthTest: false });
      const label = new TextLabel(mat, 0.7, 6);
      label.visible = false;
      label.renderOrder = 20;
      this.labels.push({ label, mat, life: 0, vy: 0, vz: 0 });
      this.add(label);
    }
  }

  /** 0..1 particle budget (quality tier). */
  setBudget(b: number) {
    this.budget = b;
  }

  /** Geometry of knocked-out members (the current skin). */
  setFlyerGeometry(g: THREE.BufferGeometry) {
    this.flyers.geometry = g;
  }

  burst(x: number, y: number, z: number, count: number, colors: THREE.ColorRepresentation[], o: { speed?: number; up?: number; size?: number; life?: number; gravity?: number } = {}) {
    const n = Math.max(1, Math.round(count * this.budget));
    const p = this.pp;
    for (let k = 0; k < n; k++) {
      const i = p.alloc();
      const a = Math.random() * Math.PI * 2;
      const sp = (o.speed ?? 4) * (0.4 + Math.random() * 0.8);
      p.x[i] = x; p.y[i] = y; p.z[i] = z;
      p.vx[i] = Math.cos(a) * sp;
      p.vz[i] = Math.sin(a) * sp;
      p.vy[i] = (o.up ?? 5) * (0.6 + Math.random() * 0.7);
      p.rx[i] = Math.random() * 6; p.ry[i] = Math.random() * 6; p.vr[i] = (Math.random() - 0.5) * 16;
      p.max[i] = p.life[i] = (o.life ?? 1.1) * (0.7 + Math.random() * 0.6);
      p.size[i] = (o.size ?? 0.12) * (0.7 + Math.random() * 0.6);
      p.grav[i] = o.gravity ?? 14;
      _c.set(colors[k % colors.length]);
      this.parts.setColorAt(i, _c);
    }
    if (this.parts.instanceColor) this.parts.instanceColor.needsUpdate = true;
  }

  /** Members knocked out of the crowd fly away tumbling. */
  knockout(x: number, z: number, dirX = 0, strength = 1) {
    const p = this.fp;
    const i = p.alloc();
    p.x[i] = x; p.y[i] = 0.1; p.z[i] = z;
    p.vx[i] = dirX * 2 + (Math.random() - 0.5) * 4 * strength;
    p.vy[i] = (4 + Math.random() * 3) * strength;
    p.vz[i] = (Math.random() - 0.2) * 3;
    p.rx[i] = 0; p.ry[i] = Math.random() * 6; p.vr[i] = (Math.random() - 0.5) * 18;
    p.max[i] = p.life[i] = 1.2;
    p.size[i] = 1;
    p.grav[i] = 16;
  }

  /** Rising text; `vz` lets it travel with the running crowd (world units/s). */
  floatText(text: string, x: number, y: number, z: number, color: THREE.ColorRepresentation, scale = 1, vz = 0) {
    const l = this.labels[this.nextLabel];
    this.nextLabel = (this.nextLabel + 1) % this.labels.length;
    l.label.setText(text);
    l.label.position.set(x, y, z);
    l.label.scale.setScalar(scale);
    l.mat.color.set(color);
    l.mat.opacity = 1;
    l.life = 1.1;
    l.vy = 2.2;
    l.vz = vz;
    l.label.visible = true;
  }

  update(dt: number, camera: THREE.Camera) {
    const p = this.pp;
    for (let i = 0; i < p.n; i++) {
      if (p.life[i] <= 0) continue;
      p.life[i] -= dt;
      if (p.life[i] <= 0) {
        this.parts.setMatrixAt(i, _m.makeScale(0, 0, 0));
        continue;
      }
      p.vy[i] -= p.grav[i] * dt;
      p.x[i] += p.vx[i] * dt; p.y[i] += p.vy[i] * dt; p.z[i] += p.vz[i] * dt;
      if (p.y[i] < 0.02) { p.y[i] = 0.02; p.vy[i] *= -0.3; p.vx[i] *= 0.6; p.vz[i] *= 0.6; }
      p.rx[i] += p.vr[i] * dt;
      const s = p.size[i] * Math.min(1, p.life[i] / (p.max[i] * 0.35));
      _e.set(p.rx[i], p.ry[i] + p.rx[i] * 0.5, 0);
      _q.setFromEuler(_e);
      _p.set(p.x[i], p.y[i], p.z[i]);
      _s.set(s, s, s);
      this.parts.setMatrixAt(i, _m.compose(_p, _q, _s));
    }
    this.parts.instanceMatrix.needsUpdate = true;

    const f = this.fp;
    for (let i = 0; i < f.n; i++) {
      if (f.life[i] <= 0) continue;
      f.life[i] -= dt;
      if (f.life[i] <= 0) {
        this.flyers.setMatrixAt(i, _m.makeScale(0, 0, 0));
        continue;
      }
      f.vy[i] -= f.grav[i] * dt;
      f.x[i] += f.vx[i] * dt; f.y[i] += f.vy[i] * dt; f.z[i] += f.vz[i] * dt;
      f.rx[i] += f.vr[i] * dt;
      const s = Math.min(1, f.life[i] / 0.3);
      _e.set(f.rx[i], f.ry[i], f.rx[i] * 0.7);
      _q.setFromEuler(_e);
      _p.set(f.x[i], f.y[i], f.z[i]);
      _s.set(s, s, s);
      this.flyers.setMatrixAt(i, _m.compose(_p, _q, _s));
    }
    this.flyers.instanceMatrix.needsUpdate = true;

    for (const l of this.labels) {
      if (l.life <= 0) continue;
      l.life -= dt;
      l.label.position.y += l.vy * dt;
      l.label.position.z += l.vz * dt;
      l.vy *= 0.96;
      l.mat.opacity = Math.min(1, l.life / 0.4);
      l.label.quaternion.copy(camera.quaternion);
      if (l.life <= 0) l.label.visible = false;
    }
  }

  reset() {
    this.pp.life.fill(0);
    this.fp.life.fill(0);
    for (let i = 0; i < this.pp.n; i++) this.parts.setMatrixAt(i, _m.makeScale(0, 0, 0));
    for (let i = 0; i < this.fp.n; i++) this.flyers.setMatrixAt(i, _m.makeScale(0, 0, 0));
    this.parts.instanceMatrix.needsUpdate = true;
    this.flyers.instanceMatrix.needsUpdate = true;
    for (const l of this.labels) {
      l.life = 0;
      l.label.visible = false;
    }
  }
}
