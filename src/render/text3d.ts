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
 * Dynamic text label: one mesh per character, glyph geometries are shared, so
 * setText() never allocates or builds geometry after the first use of a glyph.
 */
export class TextLabel extends THREE.Group {
  private meshes: THREE.Mesh[] = [];
  private text = '';
  readonly material: THREE.Material;

  /** @param height cap height in meters */
  constructor(material: THREE.Material, private readonly height = 0.7, maxChars = 6, private readonly align: 'center' | 'left' = 'center') {
    super();
    this.material = material;
    for (let i = 0; i < maxChars; i++) this.addSlot();
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
    const chars = [...text];
    while (this.meshes.length < chars.length) this.addSlot();
    const total = textWidth(text);
    let x = this.align === 'center' ? -total / 2 : 0;
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
}

/** Static text merged into ONE mesh (one draw call). */
export function bakeText(text: string, material: THREE.Material, height = 0.7): THREE.Mesh {
  const total = textWidth(text);
  let x = -total / 2;
  const parts = [];
  for (const ch of text) {
    if (ch !== ' ') parts.push({ geo: glyph(ch), color: null, pos: [x * height, -0.5 * height, 0] as [number, number, number], scale: [height, height, height] as [number, number, number] });
    x += advance(ch);
  }
  const geo = parts.length ? mergeParts(parts) : new THREE.BufferGeometry();
  return new THREE.Mesh(geo, material);
}
