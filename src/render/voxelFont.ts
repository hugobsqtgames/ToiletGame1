import * as THREE from 'three';

/**
 * Chunky 5x7 voxel font rendered as merged boxes. Works identically on iOS
 * and web (no textures, no font loading) and matches the toy-like art style.
 * Each glyph geometry is built once and shared by every label.
 */
const G: Record<string, string> = {
  '0': '.###.#...##..###.#.###..##...#.###.',
  '1': '..#...##....#....#....#....#...###.',
  '2': '.###.#...#....#...#...#...#...#####',
  '3': '####.....#....#.###.....#....#####.',
  '4': '...#...##..#.#.#..#.#####...#....#.',
  '5': '######....####.....#....##...#.###.',
  '6': '..##..#...#....####.#...##...#.###.',
  '7': '#####....#...#...#...#....#....#...',
  '8': '.###.#...##...#.###.#...##...#.###.',
  '9': '.###.#...##...#.####....#...#..##..',
  '+': '.......#....#..#####..#....#.......',
  '-': '...............#####...............',
  x: '.....#...#.#.#...#...#.#.#...#.....',
  '÷': '.......#.......#####.......#.......',
  '%': '##...##..#...#...#...#...#..##...##',
  '?': '.###.#...#....#...#...#.........#..',
  '<': '...#...#...#...#.....#.....#.....#.',
  '>': '.#.....#.....#.....#...#...#...#...',
  '=': '..........#####.....#####..........',
  '.': '..........................##...##..',
  '!': '..#....#....#....#....#.........#..',
  ':': '.......##..##.......##..##.........',
  ' ': '...................................',
  A: '.###.#...##...#######...##...##...#',
  B: '####.#...##...#####.#...##...#####.',
  C: '.###.#...##....#....#....#...#.###.',
  D: '####.#...##...##...##...##...#####.',
  E: '######....#....####.#....#....#####',
  F: '######....#....####.#....#....#....',
  G: '.###.#...##....#.####...##...#.####',
  H: '#...##...##...#######...##...##...#',
  I: '.###...#....#....#....#....#...###.',
  J: '..###...#....#....#.#..#.#..#..##..',
  K: '#...##..#.#.#..##...#.#..#..#.#...#',
  L: '#....#....#....#....#....#....#####',
  M: '#...###.###.#.##.#.##...##...##...#',
  N: '#...##...###..##.#.##..###...##...#',
  O: '.###.#...##...##...##...##...#.###.',
  P: '####.#...##...#####.#....#....#....',
  Q: '.###.#...##...##...##.#.##..#..##.#',
  R: '####.#...##...#####.#.#..#..#.#...#',
  S: '.#####....#.....###.....#....#####.',
  T: '#####..#....#....#....#....#....#..',
  U: '#...##...##...##...##...##...#.###.',
  V: '#...##...##...##...##...#.#.#...#..',
  W: '#...##...##...##.#.##.#.###.###...#',
  X: '#...##...#.#.#...#...#.#.#...##...#',
  Y: '#...##...#.#.#...#....#....#....#..',
  Z: '#####....#...#...#...#...#....#####',
};
G['×'] = G.x;

const CELL = 1;
const DEPTH = 0.9;
const cache = new Map<string, THREE.BufferGeometry>();
const cube = new THREE.BoxGeometry(CELL, CELL, DEPTH).toNonIndexed();

/** Geometry of one glyph in a 5x7 cell grid (origin bottom-left). */
export function glyphGeometry(ch: string): THREE.BufferGeometry {
  const key = G[ch] ? ch : G[ch.toUpperCase()] ? ch.toUpperCase() : '?';
  const hit = cache.get(key);
  if (hit) return hit;
  const pattern = G[key];
  const cp = cube.getAttribute('position');
  const cn = cube.getAttribute('normal');
  const pixels: [number, number][] = [];
  for (let r = 0; r < 7; r++) for (let c = 0; c < 5; c++) if (pattern[r * 5 + c] === '#') pixels.push([c, 6 - r]);
  const n = pixels.length * cp.count;
  const pos = new Float32Array(Math.max(1, n) * 3);
  const nor = new Float32Array(Math.max(1, n) * 3);
  let o = 0;
  for (const [x, y] of pixels) {
    for (let i = 0; i < cp.count; i++, o++) {
      pos[o * 3] = cp.getX(i) + x + 0.5;
      pos[o * 3 + 1] = cp.getY(i) + y + 0.5;
      pos[o * 3 + 2] = cp.getZ(i);
      nor[o * 3] = cn.getX(i);
      nor[o * 3 + 1] = cn.getY(i);
      nor[o * 3 + 2] = cn.getZ(i);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  g.computeBoundingSphere();
  g.userData.shared = true;
  cache.set(key, g);
  return g;
}

/**
 * A text label made of glyph meshes. setText() only swaps geometry
 * references (no allocation) as long as the length fits the pool.
 */
export class VoxelLabel extends THREE.Group {
  private meshes: THREE.Mesh[] = [];
  private text = '';
  readonly material: THREE.Material;
  private pixel: number;
  private align: 'center' | 'left';

  constructor(material: THREE.Material, pixelSize = 0.12, maxChars = 8, align: 'center' | 'left' = 'center') {
    super();
    this.material = material;
    this.pixel = pixelSize;
    this.align = align;
    for (let i = 0; i < maxChars; i++) this.addSlot();
  }

  private addSlot() {
    const m = new THREE.Mesh(glyphGeometry(' '), this.material);
    m.visible = false;
    m.scale.setScalar(this.pixel);
    this.meshes.push(m);
    this.add(m);
  }

  get width() {
    return this.text.length * 6 * this.pixel - this.pixel;
  }

  setText(text: string) {
    if (text === this.text) return;
    this.text = text;
    while (this.meshes.length < text.length) this.addSlot();
    const adv = 6 * this.pixel;
    const start = this.align === 'center' ? -(text.length * adv - this.pixel) / 2 : 0;
    for (let i = 0; i < this.meshes.length; i++) {
      const m = this.meshes[i];
      if (i < text.length) {
        m.visible = text[i] !== ' ';
        m.geometry = glyphGeometry(text[i]);
        m.position.set(start + i * adv, -3.5 * this.pixel, 0);
      } else m.visible = false;
    }
  }
}

/**
 * Static text baked into ONE mesh (one draw call), centered like VoxelLabel.
 * Use for labels that never change (signs, stall multipliers, piles...).
 */
export function bakeText(text: string, material: THREE.Material, pixel = 0.1): THREE.Mesh {
  const adv = 6;
  const startX = -(text.length * adv - 1) / 2;
  let count = 0;
  const glyphs = [...text].map((ch) => glyphGeometry(ch));
  for (const g of glyphs) count += g.getAttribute('position').count;
  const pos = new Float32Array(Math.max(1, count) * 3);
  const nor = new Float32Array(Math.max(1, count) * 3);
  let o = 0;
  glyphs.forEach((g, i) => {
    const gp = g.getAttribute('position');
    const gn = g.getAttribute('normal');
    for (let k = 0; k < gp.count; k++, o++) {
      pos[o * 3] = (gp.getX(k) + startX + i * adv) * pixel;
      pos[o * 3 + 1] = (gp.getY(k) - 3.5) * pixel;
      pos[o * 3 + 2] = gp.getZ(k) * pixel;
      nor[o * 3] = gn.getX(k);
      nor[o * 3 + 1] = gn.getY(k);
      nor[o * 3 + 2] = gn.getZ(k);
    }
  });
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  geo.computeBoundingSphere();
  return new THREE.Mesh(geo, material);
}
