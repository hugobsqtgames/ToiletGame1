import * as THREE from 'three';
import { TRACK } from '../../core/config';
import { Rng } from '../../core/rng';
import type { DecorKind, ThemeColors } from '../../core/worlds';
import { mergeParts, type Part } from '../geo';
import { bakeText, textMaterial } from '../text3d';
import { kitFor, type EnvKit, type PropDef } from './kits';

/**
 * Builds the scenery around a level: themed ground, three rows of props on
 * both sides (near / mid / far), track edges, distance signs, the giant
 * restroom landmark at the end, and sky extras. Every prop type becomes ONE
 * InstancedMesh (plus one for its glowing parts), so a richly decorated level
 * costs only ~20-30 draw calls.
 */
export const GROUND_Y = -0.6;
const HALF = TRACK.width / 2;
const wz = (simZ: number) => -simZ;

export interface EnvOptions {
  kind: DecorKind;
  colors: ThemeColors;
  seed: number;
  /** Sim z range to decorate. */
  zStart: number;
  zEnd: number;
  finishZ: number;
  /** Sim z of the last finish stall (landmark goes after it). */
  lastStallZ: number;
}

export interface Environment {
  group: THREE.Group;
  /** Follows the camera (sky dome extras). */
  sky: THREE.Group;
}

interface Placement {
  x: number;
  z: number;
  yaw: number;
  s: number;
}

const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _e = new THREE.Euler();
const _p = new THREE.Vector3();
const _s = new THREE.Vector3();

export function buildEnvironment(o: EnvOptions): Environment {
  const kit = kitFor(o.kind, o.colors);
  const rng = new Rng(o.seed ^ 0x5eed);
  const group = new THREE.Group();
  const sky = new THREE.Group();
  const lit = new THREE.MeshLambertMaterial({ vertexColors: true });
  const glow = new THREE.MeshBasicMaterial({ vertexColors: true });

  group.add(buildGround(kit, o, rng));

  // Rows of props. Near = dense, right next to the track.
  const rows: { defs: PropDef[]; step: [number, number]; x: [number, number]; skip: number; scale: number }[] = [
    { defs: kit.near, step: [2.4, 3.6], x: [HALF + 1.2, HALF + 3.0], skip: 0.04, scale: 1.5 },
    { defs: kit.near, step: [3.5, 5.5], x: [HALF + 4.2, HALF + 7.0], skip: 0.2, scale: 1.7 },
    { defs: kit.mid, step: [6, 9], x: [12, 18], skip: 0.06, scale: 1.8 },
    { defs: kit.far, step: [18, 28], x: [27, 46], skip: 0.03, scale: 2.2 },
  ];
  const placements = new Map<PropDef, Placement[]>();
  // Merged geometry per prop (built once) — also gives its footprint so that
  // no prop, however big, can ever intrude on the track.
  const geos = new Map<PropDef, { lit: THREE.BufferGeometry; glow: THREE.BufferGeometry | null; reachFace: number; reachAny: number }>();
  const geoOf = (def: PropDef) => {
    let g = geos.get(def);
    if (!g) {
      const lit = mergeParts(def.parts);
      const glowG = def.glow?.length ? mergeParts(def.glow) : null;
      lit.computeBoundingBox();
      const bb = lit.boundingBox!;
      g = { lit, glow: glowG, reachFace: Math.max(0, bb.max.x), reachAny: Math.max(-bb.min.x, bb.max.x, -bb.min.z, bb.max.z) };
      geos.set(def, g);
    }
    return g;
  };
  const CLEAR = HALF + 0.9;
  for (const row of rows) {
    if (!row.defs.length) continue;
    for (const side of [-1, 1]) {
      let z = o.zStart + rng.range(0, row.step[1]);
      while (z < o.zEnd) {
        if (!rng.chance(row.skip)) {
          const def = rng.weighted(row.defs.map((d) => ({ item: d, weight: d.weight ?? 1 })));
          const base = side < 0 ? 0 : Math.PI;
          const yaw = def.yaw === 'random' ? rng.range(0, Math.PI * 2) : base + rng.range(-0.15, 0.15);
          const [s0, s1] = def.scale ?? [0.9, 1.1];
          const sc = rng.range(s0, s1) * row.scale;
          const g = geoOf(def);
          const reach = (def.yaw === 'random' ? g.reachAny : g.reachFace) * sc;
          const dist = Math.max(rng.range(row.x[0], row.x[1]), CLEAR + reach);
          const list = placements.get(def) ?? [];
          list.push({ x: side * dist, z, yaw, s: sc });
          placements.set(def, list);
        }
        z += rng.range(row.step[0], row.step[1]);
      }
    }
  }
  for (const [def, list] of placements) {
    const g = geoOf(def);
    group.add(instanced(g.lit, lit, list));
    if (g.glow) group.add(instanced(g.glow, glow, list));
  }
  for (const [def, g] of geos) if (!placements.has(def)) { g.lit.dispose(); g.glow?.dispose(); }
  for (const def of [...kit.near, ...kit.mid, ...kit.far]) for (const part of [...def.parts, ...(def.glow ?? [])]) part.geo.dispose();

  group.add(buildEdges(kit, o, lit, glow));
  buildSigns(group, o, kit);
  group.add(buildLandmark(o, lit, glow));
  buildSky(sky, kit, rng);
  return { group, sky };
}

function instanced(geo: THREE.BufferGeometry, mat: THREE.Material, list: Placement[]): THREE.InstancedMesh {
  const mesh = new THREE.InstancedMesh(geo, mat, list.length);
  list.forEach((pl, i) => {
    _e.set(0, pl.yaw, 0);
    _q.setFromEuler(_e);
    _p.set(pl.x, GROUND_Y, wz(pl.z));
    _s.setScalar(pl.s);
    mesh.setMatrixAt(i, _m.compose(_p, _q, _s));
  });
  mesh.instanceMatrix.needsUpdate = true;
  mesh.computeBoundingSphere();
  mesh.matrixAutoUpdate = false;
  return mesh;
}

/* ---------------- ground ---------------- */

function buildGround(kit: EnvKit, o: EnvOptions, rng: Rng): THREE.Mesh {
  const cell = kit.ground === 'tiles' ? 4 : kit.ground === 'marble' ? 5 : 6;
  const x0 = -114;
  const x1 = 114;
  const nz = Math.ceil((o.zEnd - o.zStart) / cell);
  const nx = Math.ceil((x1 - x0) / cell);
  const pos: number[] = [];
  const col: number[] = [];
  const idx: number[] = [];
  const a = new THREE.Color(kit.groundA);
  const b = new THREE.Color(kit.groundB);
  const c = new THREE.Color();
  const path = new THREE.Color(kit.ground === 'garden' ? '#E8DCC0' : kit.ground === 'graveyard' ? '#4A3F35' : kit.groundB);
  let v = 0;
  const y = GROUND_Y - 0.01;
  for (let iz = 0; iz < nz; iz++) {
    for (let ix = 0; ix < nx; ix++) {
      const cx = x0 + (ix + 0.5) * cell;
      switch (kit.ground) {
        case 'tiles':
        case 'marble':
        case 'metal':
          c.copy((ix + iz) % 2 ? a : b);
          break;
        case 'grass':
          c.copy(iz % 2 ? a : b);
          break;
        case 'garden':
          c.copy(Math.abs(Math.abs(cx) - 9) < 2.5 ? path : iz % 2 ? a : b);
          break;
        case 'tarmac':
          c.copy(a).lerp(b, rng.next() * 0.6);
          break;
        case 'water':
          c.copy(rng.chance(0.18) ? b : a);
          break;
        case 'graveyard':
          c.copy(rng.chance(0.15) ? path : rng.chance(0.5) ? a : b);
          break;
      }
      const xa = x0 + ix * cell;
      const za = wz(o.zStart + iz * cell);
      const zb = wz(o.zStart + (iz + 1) * cell);
      pos.push(xa, y, za, xa + cell, y, za, xa + cell, y, zb, xa, y, zb);
      for (let k = 0; k < 4; k++) col.push(c.r, c.g, c.b);
      idx.push(v, v + 2, v + 1, v, v + 3, v + 2);
      v += 4;
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  g.computeBoundingSphere();
  const mesh = new THREE.Mesh(g, new THREE.MeshLambertMaterial({ vertexColors: true }));
  mesh.matrixAutoUpdate = false;
  return mesh;
}

/* ---------------- track edges ---------------- */

function buildEdges(kit: EnvKit, o: EnvOptions, lit: THREE.Material, glow: THREE.Material): THREE.Group {
  const g = new THREE.Group();
  const parts: Part[] = [];
  const glowParts: Part[] = [];
  const len = o.zEnd - o.zStart;
  const midZ = wz((o.zStart + o.zEnd) / 2);
  const B = (x: number, y: number, z: number) => new THREE.BoxGeometry(x, y, z);
  const step = kit.edge === 'fence' ? 1.2 : kit.edge === 'bollards' ? 2.5 : 4;
  for (let z = o.zStart; z < o.zEnd; z += step) {
    for (const side of [-1, 1]) {
      const x = side * (HALF + 0.55);
      const i = Math.round(z / step);
      switch (kit.edge) {
        case 'boards':
          parts.push({ geo: B(0.15, 0.7, step - 0.1), color: [o.colors.wall, '#FFFFFF', o.colors.accent][((i % 3) + 3) % 3], pos: [x, 0.35, wz(z)] });
          break;
        case 'hedge':
          parts.push({ geo: B(0.5, 0.6, step), color: i % 2 ? '#2E7D32' : '#33873A', pos: [x, 0.3, wz(z)] });
          break;
        case 'fence':
          parts.push({ geo: B(0.1, 0.7, 0.12), color: o.kind === 'manor' ? '#3A3A44' : '#FFFFFF', pos: [x, 0.35, wz(z)] });
          break;
        case 'bollards':
          parts.push({ geo: B(0.22, 0.6, 0.22), color: i % 2 ? '#FFC107' : '#263238', pos: [x, 0.3, wz(z)] });
          break;
        case 'lights':
          glowParts.push({ geo: B(0.12, 0.12, step * 0.6), color: i % 2 ? '#3DF5FF' : '#FF4DD8', pos: [x - side * 0.3, 0.36, wz(z)] });
          break;
        case 'rail':
          parts.push({ geo: B(0.16, 0.5, 0.16), color: '#B8C0CC', pos: [x - side * 0.25, 0.4, wz(z)] });
          break;
      }
    }
  }
  if (kit.edge === 'fence') for (const side of [-1, 1]) parts.push({ geo: B(0.06, 0.08, len), color: o.kind === 'manor' ? '#3A3A44' : '#FFFFFF', pos: [side * (HALF + 0.55), 0.55, midZ] });
  const m = new THREE.Mesh(mergeParts(parts), lit);
  g.add(m);
  if (glowParts.length) g.add(new THREE.Mesh(mergeParts(glowParts), glow));
  for (const q of [...parts, ...glowParts]) q.geo.dispose();
  return g;
}

/* ---------------- distance signs: "WC 150M" ---------------- */

function buildSigns(group: THREE.Group, o: EnvOptions, kit: EnvKit) {
  const panel = new THREE.MeshBasicMaterial({ color: '#2F6BFF' });
  const pole = new THREE.MeshLambertMaterial({ color: kit.sky === 'night' ? '#555566' : '#B8C0CC' });
  const white = textMaterial('#FFFFFF');
  const yellow = textMaterial('#FFE14D');
  let side = -1;
  for (let z = 70; z < o.finishZ - 25; z += 75) {
    const remain = Math.round((o.finishZ - z) / 10) * 10;
    const x = side * (HALF + 2.6);
    const sign = new THREE.Group();
    sign.position.set(x, GROUND_Y, wz(z));
    const p1 = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.12, 5.2, 6), pole);
    p1.position.y = 2.6;
    const board = new THREE.Mesh(new THREE.BoxGeometry(3.2, 1.9, 0.18), panel);
    board.position.y = 5.6;
    const border = new THREE.Mesh(new THREE.BoxGeometry(3.45, 2.15, 0.12), new THREE.MeshBasicMaterial({ color: '#FFFFFF' }));
    border.position.set(0, 5.6, -0.06);
    const wc = bakeText('WC', white, 0.75);
    wc.position.set(0, 5.95, 0.12);
    const dist = bakeText(`${remain}M`, yellow, 0.5);
    dist.position.set(0, 5.05, 0.12);
    sign.add(p1, border, board, wc, dist);
    group.add(sign);
    side = -side;
  }
}

/* ---------------- the destination: a giant restroom building ---------------- */

function buildLandmark(o: EnvOptions, lit: THREE.Material, glow: THREE.Material): THREE.Group {
  const g = new THREE.Group();
  const z = wz(o.lastStallZ + 34);
  const B = (x: number, y: number, zz: number) => new THREE.BoxGeometry(x, y, zz);
  const parts: Part[] = [
    { geo: B(40, 16, 12), color: o.colors.wall, pos: [0, 8, 0] },
    { geo: B(42, 1.2, 13), color: o.colors.accent, pos: [0, 16.6, 0] },
    { geo: B(14, 9, 0.6), color: '#FFFFFF', pos: [-11, 4.5, 6.2] },
    { geo: B(14, 9, 0.6), color: '#FFFFFF', pos: [11, 4.5, 6.2] },
    { geo: B(5, 7, 0.8), color: '#3E4A63', pos: [-11, 3.5, 6.4] },
    { geo: B(5, 7, 0.8), color: '#3E4A63', pos: [11, 3.5, 6.4] },
    { geo: B(16, 7, 1), color: '#FFFFFF', pos: [0, 21.5, 0] },
  ];
  const glowParts: Part[] = [
    { geo: B(15, 6, 1.1), color: '#2F6BFF', pos: [0, 21.5, 0.1] },
    // man / woman pictograms over the doors
    { geo: new THREE.SphereGeometry(0.9, 10, 8), color: '#2F6BFF', pos: [-11, 7.7, 6.6] },
    { geo: B(1.6, 2.4, 0.3), color: '#2F6BFF', pos: [-11, 5.5, 6.6] },
    { geo: new THREE.SphereGeometry(0.9, 10, 8), color: '#FF5FA2', pos: [11, 7.7, 6.6] },
    { geo: new THREE.ConeGeometry(1.4, 2.8, 8), color: '#FF5FA2', pos: [11, 5.4, 6.6] },
    ...Array.from({ length: 6 }, (_, i) => ({ geo: B(2.4, 2.4, 0.2), color: '#FFF3C4', pos: [-17 + i * 6.8, 12, 6.1] as [number, number, number] })),
  ];
  g.add(new THREE.Mesh(mergeParts(parts), lit), new THREE.Mesh(mergeParts(glowParts), glow));
  for (const q of [...parts, ...glowParts]) q.geo.dispose();
  const label = bakeText('WC', textMaterial('#FFFFFF'), 4.2);
  label.position.set(0, 21.5, 1.0);
  g.add(label);
  g.position.set(0, GROUND_Y, z);
  return g;
}

/* ---------------- sky ---------------- */

function buildSky(sky: THREE.Group, kit: EnvKit, rng: Rng) {
  if (kit.sky === 'clouds') {
    const S = (r: number) => new THREE.SphereGeometry(r, 8, 6);
    const cloud = mergeParts([
      { geo: S(4), color: '#FFFFFF', pos: [0, 0, 0], scale: [1.6, 0.7, 1] },
      { geo: S(3), color: '#FFFFFF', pos: [4, 0.6, 1], scale: [1.4, 0.8, 1] },
      { geo: S(3.2), color: '#F2F6FF', pos: [-4, 0.2, -0.5], scale: [1.4, 0.7, 1] },
      { geo: S(2.6), color: '#FFFFFF', pos: [1.5, 2, 0], scale: [1.3, 0.9, 1] },
    ]);
    const n = 26;
    const mesh = new THREE.InstancedMesh(cloud, new THREE.MeshBasicMaterial({ vertexColors: true, fog: false, transparent: true, opacity: 0.92 }), n);
    for (let i = 0; i < n; i++) {
      const a = rng.range(-Math.PI * 0.85, -Math.PI * 0.15);
      const r = rng.range(120, 220);
      _p.set(Math.cos(a) * r, rng.range(35, 85), Math.sin(a) * r);
      _q.setFromEuler(_e.set(0, rng.range(0, 6), 0));
      _s.setScalar(rng.range(1.2, 2.6));
      mesh.setMatrixAt(i, _m.compose(_p, _q, _s));
    }
    mesh.frustumCulled = false;
    sky.add(mesh);
  } else {
    const n = 500;
    const pos = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      const a = rng.range(0, Math.PI * 2);
      const el = rng.range(0.05, 1.3);
      const r = 260;
      pos[i * 3] = Math.cos(a) * Math.cos(el) * r;
      pos[i * 3 + 1] = Math.sin(el) * r;
      pos[i * 3 + 2] = Math.sin(a) * Math.cos(el) * r;
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    const stars = new THREE.Points(g, new THREE.PointsMaterial({ color: '#FFFFFF', size: 2, sizeAttenuation: false, fog: false }));
    stars.frustumCulled = false;
    sky.add(stars);
    if (kit.sky === 'night') {
      const moon = new THREE.Mesh(new THREE.SphereGeometry(16, 16, 12), new THREE.MeshBasicMaterial({ color: '#FFF4C8', fog: false }));
      moon.position.set(70, 120, -200);
      const halo = new THREE.Mesh(new THREE.CircleGeometry(30, 24), new THREE.MeshBasicMaterial({ color: '#FFF4C8', transparent: true, opacity: 0.18, fog: false, depthWrite: false }));
      halo.position.set(70, 120, -215);
      sky.add(moon, halo);
    }
  }
}
