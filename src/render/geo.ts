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

/**
 * Merges parts into one INDEXED geometry with a `color` attribute.
 * Keeping index buffers means shared vertices are processed once by the GPU
 * (3-4x fewer vertex shader invocations than non-indexed triangles).
 */
export function mergeParts(parts: Part[]): THREE.BufferGeometry {
  let vCount = 0;
  let iCount = 0;
  const prepared = parts.map((p) => {
    const g = p.geo.clone();
    if (!g.getAttribute('normal')) g.computeVertexNormals();
    const n = g.getAttribute('position').count;
    vCount += n;
    iCount += g.index ? g.index.count : n;
    return { p, g };
  });
  const pos = new Float32Array(vCount * 3);
  const nor = new Float32Array(vCount * 3);
  const col = new Float32Array(vCount * 3);
  const idx = vCount > 65535 ? new Uint32Array(iCount) : new Uint16Array(iCount);
  let o = 0;
  let io = 0;
  for (const { p, g } of prepared) {
    tmpE.set(...(p.rot ?? [0, 0, 0]));
    tmpQ.setFromEuler(tmpE);
    tmpP.set(...(p.pos ?? [0, 0, 0]));
    tmpS.set(...(p.scale ?? [1, 1, 1]));
    tmpM.compose(tmpP, tmpQ, tmpS);
    g.applyMatrix4(tmpM);
    if (p.color !== null) tmpC.set(p.color);
    const gc = p.color === null ? g.getAttribute('color') : null;
    const gp = g.getAttribute('position');
    const gn = g.getAttribute('normal');
    const base = o;
    if (g.index) {
      const gi = g.index;
      for (let k = 0; k < gi.count; k++) idx[io++] = gi.getX(k) + base;
    } else {
      for (let k = 0; k < gp.count; k++) idx[io++] = base + k;
    }
    for (let i = 0; i < gp.count; i++, o++) {
      pos[o * 3] = gp.getX(i);
      pos[o * 3 + 1] = gp.getY(i);
      pos[o * 3 + 2] = gp.getZ(i);
      nor[o * 3] = gn.getX(i);
      nor[o * 3 + 1] = gn.getY(i);
      nor[o * 3 + 2] = gn.getZ(i);
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
    g.dispose();
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

/**
 * Rounded "pill" badge (flat), resizable without distorting its round ends:
 * two half-discs + a middle quad, repositioned by setWidth().
 */
export class Pill extends THREE.Group {
  private left: THREE.Mesh;
  private right: THREE.Mesh;
  private mid: THREE.Mesh;
  private border: THREE.Mesh[] = [];
  constructor(material: THREE.Material, readonly h = 0.62, borderMat?: THREE.Material) {
    super();
    const r = h / 2;
    const cap = new THREE.CircleGeometry(r, 18);
    const quad = new THREE.PlaneGeometry(1, h);
    this.left = new THREE.Mesh(cap, material);
    this.right = new THREE.Mesh(cap, material);
    this.mid = new THREE.Mesh(quad, material);
    if (borderMat) {
      const bcap = new THREE.CircleGeometry(r + 0.06, 18);
      const bquad = new THREE.PlaneGeometry(1, h + 0.12);
      this.border = [new THREE.Mesh(bcap, borderMat), new THREE.Mesh(bcap, borderMat), new THREE.Mesh(bquad, borderMat)];
      for (const b of this.border) {
        b.position.z = -0.01;
        b.renderOrder = 9;
        this.add(b);
      }
    }
    for (const m of [this.left, this.right, this.mid]) m.renderOrder = 10;
    this.add(this.left, this.right, this.mid);
    this.setWidth(1);
  }
  setWidth(w: number) {
    const inner = Math.max(0.01, w - this.h);
    this.mid.scale.x = inner;
    this.left.position.x = -inner / 2;
    this.right.position.x = inner / 2;
    if (this.border.length) {
      this.border[0].position.x = -inner / 2;
      this.border[1].position.x = inner / 2;
      this.border[2].scale.x = inner;
    }
  }
}
