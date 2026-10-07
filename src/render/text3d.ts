import * as THREE from 'three';
import { Font } from 'three/examples/jsm/loaders/FontLoader.js';
import fontData from './fonts/lilita.json';
import { mergeParts } from './geo';

/**
 * Smooth 3D text in the game's display font (Lilita One, see scripts/gen-font.js).
 * Each glyph is extruded once with a rounded bevel and cached. Faces are white
 * and the bevel/sides are dark navy via vertex colors, so ONE material (tinted by
 * `material.color`) gives a chunky candy-like label with a built-in outline.
 * Works identically on iOS and web: no textures, no canvas.
 */
const font = new Font(fontData as unknown as ConstructorParameters<typeof Font>[0]);
const cache = new Map<string, THREE.BufferGeometry>();
const advances = new Map<string, number>();
const SIDE = new THREE.Color('#1D2340');
/** Glyph em size used for the geometry (cap height ≈ 0.7). */
const EM = 1 / 0.7;
const DEPTH = 0.16;

function glyph(ch: string): THREE.BufferGeometry {
  const hit = cache.get(ch);
  if (hit) return hit;
  const shapes = font.generateShapes(ch, EM);
  const geo = new THREE.ExtrudeGeometry(shapes, {
    depth: DEPTH,
    curveSegments: 3,
    bevelEnabled: true,
    bevelThickness: 0.07,
    bevelSize: 0.055,
    bevelOffset: 0,
    bevelSegments: 1,
  });
  // Group 0 = front/back caps, group 1 = sides & bevel → bake as vertex colors.
  const count = geo.getAttribute('position').count;
  const col = new Float32Array(count * 3).fill(1);
  for (const g of geo.groups) {
    if (g.materialIndex !== 1) continue;
    for (let i = g.start; i < g.start + g.count && i < count; i++) {
      col[i * 3] = SIDE.r;
      col[i * 3 + 1] = SIDE.g;
      col[i * 3 + 2] = SIDE.b;
    }
  }
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  geo.clearGroups();
  geo.computeBoundingSphere();
  geo.userData.shared = true;
  const glyphData = (fontData as { glyphs: Record<string, { ha: number }> }).glyphs[ch];
  advances.set(ch, ((glyphData?.ha ?? 600) / 1000) * EM);
  cache.set(ch, geo);
  return geo;
}

function advance(ch: string) {
  glyph(ch);
  return advances.get(ch) ?? 0.6;
}

/** Width of a string at height 1 (cap height units). */
export function textWidth(text: string): number {
  let w = 0;
  for (const ch of text) w += advance(ch);
  return w;
}

/** Material for 3D text: tinted by `color`, vertex colors carry the dark outline. */
export function textMaterial(color: THREE.ColorRepresentation = '#FFFFFF', opts: { transparent?: boolean; depthTest?: boolean } = {}) {
  return new THREE.MeshBasicMaterial({ color, vertexColors: true, transparent: !!opts.transparent, depthTest: opts.depthTest ?? true });
}

/**
 * Dynamic text label. Two modes:
 *  - per-glyph (default): one mesh per character, glyph geometries are shared,
 *    so setText() never allocates. Best for values that change every frame
 *    (crowd counters).
 *  - merged: the text is baked into ONE mesh (one draw call) and rebuilt on
 *    change. Best for labels that rarely change (gate values): on iOS every draw
 *    call costs JS time, and gates are the bulk of the text on screen.
 */
export class TextLabel extends THREE.Group {
  private meshes: THREE.Mesh[] = [];
  private bakedMesh: THREE.Mesh | null = null;
  private text = '';
  readonly material: THREE.Material;

  /** @param height cap height in meters */
  constructor(material: THREE.Material, private readonly height = 0.7, maxChars = 6, private readonly align: 'center' | 'left' = 'center', merged = false) {
    super();
    this.material = material;
    if (merged) {
      this.bakedMesh = new THREE.Mesh(new THREE.BufferGeometry(), material);
      this.add(this.bakedMesh);
    } else for (let i = 0; i < maxChars; i++) this.addSlot();
  }

  private addSlot() {
    const m = new THREE.Mesh(glyph(' '), this.material);
    m.visible = false;
    m.scale.setScalar(this.height);
    this.meshes.push(m);
    this.add(m);
  }

  get width() {
    return textWidth(this.text) * this.height;
  }

  setText(text: string) {
    if (text === this.text) return;
    this.text = text;
    const total = textWidth(text);
    let x = this.align === 'center' ? -total / 2 : 0;
    if (this.bakedMesh) {
      this.bake(text, x);
      return;
    }
    const chars = [...text];
    while (this.meshes.length < chars.length) this.addSlot();
    for (let i = 0; i < this.meshes.length; i++) {
      const m = this.meshes[i];
      if (i < chars.length) {
        const ch = chars[i];
        m.geometry = glyph(ch);
        m.visible = ch !== ' ';
        m.position.set(x * this.height, -0.5 * this.height, 0);
        x += advance(ch);
      } else m.visible = false;
    }
  }

  /**
   * Copies the glyph triangles straight into reusable buffers (no clone, no
   * matrix math, no allocation unless the text outgrows them).
   */
  private bake(text: string, x0: number) {
    const mesh = this.bakedMesh!;
    let verts = 0;
    for (const ch of text) if (ch !== ' ') verts += glyph(ch).getAttribute('position').count;
    let geo = mesh.geometry;
    const cap = geo.getAttribute('position')?.count ?? 0;
    if (verts > cap) {
      geo.dispose();
      const n = Math.ceil(verts * 1.25);
      geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(n * 3), 3));
      geo.setAttribute('normal', new THREE.BufferAttribute(new Float32Array(n * 3), 3));
      geo.setAttribute('color', new THREE.BufferAttribute(new Float32Array(n * 3), 3));
      mesh.geometry = geo;
    }
    const P = geo.getAttribute('position') as THREE.BufferAttribute;
    const N = geo.getAttribute('normal') as THREE.BufferAttribute;
    const C = geo.getAttribute('color') as THREE.BufferAttribute;
    const pa = P.array as Float32Array, na = N.array as Float32Array, ca = C.array as Float32Array;
    const h = this.height;
    let x = x0;
    let o = 0;
    for (const ch of text) {
      if (ch !== ' ') {
        const g = glyph(ch);
        const gp = g.getAttribute('position').array as ArrayLike<number>;
        const gn = g.getAttribute('normal').array as ArrayLike<number>;
        const gc = g.getAttribute('color').array as ArrayLike<number>;
        const ox = x * h, oy = -0.5 * h;
        for (let i = 0; i < gp.length; i += 3) {
          pa[o + i] = gp[i] * h + ox;
          pa[o + i + 1] = gp[i + 1] * h + oy;
          pa[o + i + 2] = gp[i + 2] * h;
        }
        na.set(gn as Float32Array, o);
        ca.set(gc as Float32Array, o);
        o += gp.length;
      }
      x += advance(ch);
    }
    geo.setDrawRange(0, verts);
    P.needsUpdate = N.needsUpdate = C.needsUpdate = true;
    geo.boundingBox = null;
    geo.computeBoundingSphere();
    mesh.visible = verts > 0;
  }
}

/**
 * Baked label geometries, shared between levels (stall multipliers, START,
 * FINISH, "+5"… repeat every level). Bounded: past the cap, labels are built
 * unshared and freed with their level.
 */
const baked = new Map<string, THREE.BufferGeometry>();
const BAKED_CAP = 240;

/** Static text merged into ONE mesh (one draw call). */
export function bakeText(text: string, material: THREE.Material, height = 0.7): THREE.Mesh {
  const key = height + '|' + text;
  let geo = baked.get(key);
  if (!geo) {
    const total = textWidth(text);
    let x = -total / 2;
    const parts = [];
    for (const ch of text) {
      if (ch !== ' ') parts.push({ geo: glyph(ch), color: null, pos: [x * height, -0.5 * height, 0] as [number, number, number], scale: [height, height, height] as [number, number, number] });
      x += advance(ch);
    }
    geo = parts.length ? mergeParts(parts) : new THREE.BufferGeometry();
    if (baked.size < BAKED_CAP) {
      geo.userData.shared = true;
      baked.set(key, geo);
    }
  }
  return new THREE.Mesh(geo, material);
}
