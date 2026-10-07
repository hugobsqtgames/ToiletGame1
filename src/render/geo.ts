import * as THREE from 'three';

/**
 * Geometry helpers. Everything is merged into a few vertex-colored meshes so
 * the GPU sees very few draw calls (critical on mobile).
 */
export interface Part {
  geo: THREE.BufferGeometry;
  /** null = keep the geometry's own `color` attribute. */
  color: THREE.ColorRepresentation | null;
  pos?: [number, number, number];
  rot?: [number, number, number];
  scale?: [number, number, number];
}

const tmpM = new THREE.Matrix4();
const tmpQ = new THREE.Quaternion();
const tmpE = new THREE.Euler();
const tmpP = new THREE.Vector3();
const tmpS = new THREE.Vector3();
const tmpC = new THREE.Color();
const tmpN = new THREE.Matrix3();

/**
 * Merges parts into one INDEXED geometry with a `color` attribute.
 * Keeping index buffers means shared vertices are processed once by the GPU
 * (3-4x fewer vertex shader invocations than non-indexed triangles).
 */
export function mergeParts(parts: Part[]): THREE.BufferGeometry {
  // Reads the source arrays directly and transforms while copying: no clone,
  // no temporary geometry (level builds were dominated by clone() on iOS).
  let vCount = 0;
  let iCount = 0;
  for (const p of parts) {
    if (!p.geo.getAttribute('normal')) p.geo.computeVertexNormals();
    const n = p.geo.getAttribute('position').count;
    vCount += n;
    iCount += p.geo.index ? p.geo.index.count : n;
  }
  const pos = new Float32Array(vCount * 3);
  const nor = new Float32Array(vCount * 3);
  const col = new Float32Array(vCount * 3);
  const idx = vCount > 65535 ? new Uint32Array(iCount) : new Uint16Array(iCount);
  let o = 0;
  let io = 0;
  for (const p of parts) {
    const g = p.geo;
    tmpE.set(...(p.rot ?? [0, 0, 0]));
    tmpQ.setFromEuler(tmpE);
    tmpP.set(...(p.pos ?? [0, 0, 0]));
    tmpS.set(...(p.scale ?? [1, 1, 1]));
    tmpM.compose(tmpP, tmpQ, tmpS);
    tmpN.getNormalMatrix(tmpM);
    const e = tmpM.elements;
    const ne = tmpN.elements;
    if (p.color !== null) tmpC.set(p.color);
    const gc = p.color === null ? g.getAttribute('color') : null;
    const gp = g.getAttribute('position');
    const gn = g.getAttribute('normal');
    const base = o;
    if (g.index) {
      const gi = g.index.array;
      for (let k = 0; k < gi.length; k++) idx[io++] = gi[k] + base;
    } else {
      for (let k = 0; k < gp.count; k++) idx[io++] = base + k;
    }
    for (let i = 0; i < gp.count; i++, o++) {
      const x = gp.getX(i), y = gp.getY(i), z = gp.getZ(i);
      pos[o * 3] = e[0] * x + e[4] * y + e[8] * z + e[12];
      pos[o * 3 + 1] = e[1] * x + e[5] * y + e[9] * z + e[13];
      pos[o * 3 + 2] = e[2] * x + e[6] * y + e[10] * z + e[14];
      const nx = gn.getX(i), ny = gn.getY(i), nz = gn.getZ(i);
      let tx = ne[0] * nx + ne[3] * ny + ne[6] * nz;
      let ty = ne[1] * nx + ne[4] * ny + ne[7] * nz;
      let tz = ne[2] * nx + ne[5] * ny + ne[8] * nz;
      const len = Math.sqrt(tx * tx + ty * ty + tz * tz) || 1;
      tx /= len; ty /= len; tz /= len;
      nor[o * 3] = tx;
      nor[o * 3 + 1] = ty;
      nor[o * 3 + 2] = tz;
      if (gc) {
        col[o * 3] = gc.getX(i);
        col[o * 3 + 1] = gc.getY(i);
        col[o * 3 + 2] = gc.getZ(i);
      } else {
        col[o * 3] = tmpC.r;
        col[o * 3 + 1] = tmpC.g;
        col[o * 3 + 2] = tmpC.b;
      }
    }
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  out.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  out.setAttribute('color', new THREE.BufferAttribute(col, 3));
  out.setIndex(new THREE.BufferAttribute(idx, 1));
  out.computeBoundingSphere();
  return out;
}

/** Soft round blob shadow (alpha falls off toward the edge), no texture needed. */
export function blobShadowGeometry(segments = 18): THREE.BufferGeometry {
  const pos: number[] = [];
  const col: number[] = [];
  for (let i = 0; i < segments; i++) {
    const a0 = (i / segments) * Math.PI * 2;
    const a1 = ((i + 1) / segments) * Math.PI * 2;
    pos.push(0, 0, 0, Math.cos(a1), 0, Math.sin(a1), Math.cos(a0), 0, Math.sin(a0));
    col.push(0, 0, 0, 0.32, 0, 0, 0, 0, 0, 0, 0, 0);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 4));
  return g;
}

/** Vertical sky gradient dome. */
export function skyDome(top: string, bottom: string): THREE.Mesh {
  const g = new THREE.SphereGeometry(300, 24, 12);
  const c = new THREE.Color();
  const ct = new THREE.Color(top);
  const cb = new THREE.Color(bottom);
  const p = g.getAttribute('position');
  const cols = new Float32Array(p.count * 3);
  for (let i = 0; i < p.count; i++) {
    const t = Math.max(0, Math.min(1, (p.getY(i) / 300 + 0.15) * 1.4));
    c.copy(cb).lerp(ct, t);
    cols[i * 3] = c.r;
    cols[i * 3 + 1] = c.g;
    cols[i * 3 + 2] = c.b;
  }
  g.setAttribute('color', new THREE.BufferAttribute(cols, 3));
  const m = new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.BackSide, fog: false, depthWrite: false });
  const mesh = new THREE.Mesh(g, m);
  mesh.renderOrder = -10;
  return mesh;
}

export function disposeObject(root: THREE.Object3D, keep?: Set<unknown>) {
  root.traverse((o) => {
    // Instanced meshes own GPU buffers outside their geometry (instanceMatrix/color).
    if ((o as THREE.InstancedMesh).isInstancedMesh) (o as THREE.InstancedMesh).dispose();
    const m = o as THREE.Mesh;
    if (m.geometry && !m.geometry.userData.shared && !keep?.has(m.geometry)) m.geometry.dispose();
    const mat = m.material as THREE.Material | THREE.Material[] | undefined;
    if (mat) {
      for (const x of Array.isArray(mat) ? mat : [mat]) if (!x.userData.shared && !keep?.has(x)) x.dispose();
    }
  });
}

/** Flat stadium (pill) whose straight part can be stretched without rebuilding. */
class Stadium {
  readonly geo = new THREE.BufferGeometry();
  private base: Float32Array;
  private side: Float32Array;
  constructor(r: number, seg = 14) {
    // Center + right arc (-90°..90°) + left arc (90°..270°), triangle fan.
    const n = 1 + 2 * (seg + 1);
    this.base = new Float32Array(n * 3);
    this.side = new Float32Array(n);
    let k = 1;
    for (const sd of [1, -1]) {
      for (let i = 0; i <= seg; i++) {
        const a = -Math.PI / 2 + (Math.PI * i) / seg + (sd < 0 ? Math.PI : 0);
        this.base[k * 3] = Math.cos(a) * r;
        this.base[k * 3 + 1] = Math.sin(a) * r;
        this.side[k] = sd;
        k++;
      }
    }
    const idx: number[] = [];
    for (let i = 1; i < n; i++) idx.push(0, i, i + 1 < n ? i + 1 : 1);
    this.geo.setIndex(idx);
    this.geo.setAttribute('position', new THREE.BufferAttribute(this.base.slice(), 3));
    this.geo.setAttribute('normal', new THREE.BufferAttribute(new Float32Array(n * 3).map((_, i) => (i % 3 === 2 ? 1 : 0)), 3));
  }
  setInner(inner: number) {
    const pos = this.geo.getAttribute('position') as THREE.BufferAttribute;
    const a = pos.array as Float32Array;
    for (let i = 0; i < this.side.length; i++) a[i * 3] = this.base[i * 3] + (this.side[i] * inner) / 2;
    pos.needsUpdate = true;
    this.geo.boundingBox = null;
    this.geo.computeBoundingSphere();
  }
}

/** Rounded label background (2 draw calls: fill + optional border). */
export class Pill extends THREE.Group {
  private fill: Stadium;
  private border: Stadium | null = null;
  private width = -1;
  constructor(material: THREE.Material, readonly h = 0.62, borderMat?: THREE.Material) {
    super();
    const r = h / 2;
    this.fill = new Stadium(r);
    const mid = new THREE.Mesh(this.fill.geo, material);
    mid.renderOrder = 10;
    if (borderMat) {
      this.border = new Stadium(r + 0.06);
      const b = new THREE.Mesh(this.border.geo, borderMat);
      b.position.z = -0.01;
      b.renderOrder = 9;
      this.add(b);
    }
    this.add(mid);
    this.setWidth(1);
  }
  setWidth(w: number) {
    if (w === this.width) return;
    this.width = w;
    const inner = Math.max(0.01, w - this.h);
    this.fill.setInner(inner);
    this.border?.setInner(inner);
  }
}
