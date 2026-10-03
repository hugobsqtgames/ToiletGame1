import * as THREE from 'three';
import type { DecorKind, ThemeColors } from '../../core/worlds';
import type { Part } from '../geo';

/**
 * Environment kits: the scenery of each world, built from low-poly primitives
 * with baked vertex colors. Conventions for every prop:
 *  - origin on the ground (y = 0),
 *  - its "front" faces +X (toward the track when placed on the LEFT side;
 *    the builder mirrors it for the right side),
 *  - long props extend along Z.
 * `glow` parts are rendered unlit (screens, windows, lamps) so they read as
 * light sources in dark worlds.
 */
export interface PropDef {
  parts: Part[];
  glow?: Part[];
  /** Relative frequency inside its row. */
  weight?: number;
  /** Random uniform scale range. */
  scale?: [number, number];
  /** 'face' = front toward the track, 'random' = any yaw. */
  yaw?: 'face' | 'random';
}

export type GroundStyle = 'tiles' | 'grass' | 'tarmac' | 'water' | 'marble' | 'metal' | 'garden' | 'graveyard';

export interface EnvKit {
  ground: GroundStyle;
  groundA: string;
  groundB: string;
  /** Dense props right next to the track. */
  near: PropDef[];
  /** Medium-distance props. */
  mid: PropDef[];
  /** Big background landmarks. */
  far: PropDef[];
  sky: 'clouds' | 'stars' | 'night';
  /** Track edge decoration. */
  edge: 'rail' | 'hedge' | 'boards' | 'fence' | 'lights' | 'bollards';
}

/* ---------- primitive shortcuts (low tessellation on purpose) ---------- */
const B = (x: number, y: number, z: number) => new THREE.BoxGeometry(x, y, z);
const C = (rt: number, rb: number, h: number, seg = 8) => new THREE.CylinderGeometry(rt, rb, h, seg);
const S = (r: number, w = 8, h = 6) => new THREE.SphereGeometry(r, w, h);
const CONE = (r: number, h: number, seg = 7) => new THREE.ConeGeometry(r, h, seg);
const TOR = (r: number, t: number, rs = 6, ts = 12, arc = Math.PI * 2) => new THREE.TorusGeometry(r, t, rs, ts, arc);
type V3 = [number, number, number];
const p = (geo: THREE.BufferGeometry, color: string, pos: V3 = [0, 0, 0], rot?: V3, scale?: V3): Part => ({ geo, color, pos, rot, scale });

/* ---------- shared props ---------- */

/** A cartoon toilet (used in stalls, decor and the finish throne). Faces -Z. */
export function toiletProp(color = '#FFFFFF', seat = '#E8E8E8', scale = 1): Part[] {
  const s = scale;
  return [
    p(C(0.22 * s, 0.16 * s, 0.32 * s, 14), color, [0, 0.16 * s, 0]),
    p(TOR(0.2 * s, 0.045 * s, 6, 14), seat, [0, 0.33 * s, 0], [Math.PI / 2, 0, 0]),
    p(B(0.42 * s, 0.42 * s, 0.16 * s), color, [0, 0.48 * s, 0.24 * s]),
    p(B(0.08 * s, 0.03 * s, 0.03 * s), '#B0B0B0', [0.12 * s, 0.66 * s, 0.18 * s]),
  ];
}

const plant = (pot: string, leaf: string, h = 1): PropDef => ({
  parts: [
    p(C(0.32, 0.24, 0.5), pot, [0, 0.25, 0]),
    p(S(0.45 * h), leaf, [0, 0.75 * h + 0.2, 0]),
    p(S(0.32 * h), leaf, [0.18, 1.15 * h + 0.1, 0.1]),
    p(S(0.28 * h), leaf, [-0.15, 1.05 * h + 0.1, -0.15]),
  ],
  scale: [0.85, 1.25],
  yaw: 'random',
});

const palm = (trunk = '#A1662F', leaf = '#2E9E44'): PropDef => ({
  parts: [
    p(C(0.13, 0.2, 3.2, 6), trunk, [0, 1.6, 0], [0, 0, 0.12]),
    ...[0, 1, 2, 3, 4].map((i) => p(B(1.7, 0.08, 0.5), i % 2 ? leaf : '#3DBB55', [Math.cos((i / 5) * Math.PI * 2) * 0.75 + 0.2, 3.15 - 0.2, Math.sin((i / 5) * Math.PI * 2) * 0.75], [0, -(i / 5) * Math.PI * 2, -0.35])),
    p(S(0.25), '#7A4E2A', [0.2, 3.2, 0]),
  ],
  scale: [0.8, 1.3],
  yaw: 'random',
});

const lamp = (pole: string, light: string, h = 3.4): PropDef => ({
  parts: [p(C(0.06, 0.09, h, 6), pole, [0, h / 2, 0]), p(B(0.5, 0.08, 0.5), pole, [0, h, 0])],
  glow: [p(S(0.22, 8, 6), light, [0, h + 0.15, 0])],
  yaw: 'random',
});

const wcSign = (bg: string): PropDef => ({
  parts: [p(C(0.06, 0.06, 2.6, 6), '#5B6375', [0, 1.3, 0]), p(B(0.12, 0.9, 1.4), bg, [0, 2.7, 0])],
  glow: [
    // stylized man & woman pictograms facing +X
    p(S(0.09, 6, 4), '#FFFFFF', [0.07, 2.95, -0.3]),
    p(B(0.02, 0.36, 0.18), '#FFFFFF', [0.07, 2.65, -0.3]),
    p(S(0.09, 6, 4), '#FFFFFF', [0.07, 2.95, 0.3]),
    p(CONE(0.15, 0.4, 6), '#FFFFFF', [0.07, 2.65, 0.3]),
    p(B(0.02, 0.6, 0.03), '#FFFFFF', [0.07, 2.7, 0]),
  ],
  weight: 0.6,
  yaw: 'face',
});

const balloons = (cols: string[]): PropDef => ({
  parts: [
    p(B(0.3, 0.3, 0.3), '#8D6E63', [0, 0.15, 0]),
    ...cols.map((c, i) => p(S(0.32, 8, 6), c, [Math.cos(i * 2.1) * 0.35, 2.4 + (i % 2) * 0.5, Math.sin(i * 2.1) * 0.35], undefined, [1, 1.2, 1])),
    p(C(0.01, 0.01, 2.2, 3), '#FFFFFF', [0, 1.25, 0]),
  ],
  yaw: 'random',
});

const bench = (wood: string, metal = '#4A5060'): PropDef => ({
  parts: [p(B(0.5, 0.08, 1.8), wood, [0, 0.45, 0]), p(B(0.08, 0.5, 1.8), wood, [-0.25, 0.75, 0]), p(B(0.45, 0.45, 0.08), metal, [0, 0.22, -0.8]), p(B(0.45, 0.45, 0.08), metal, [0, 0.22, 0.8])],
  yaw: 'face',
});

const cone = (c = '#FF7A1A'): PropDef => ({
  parts: [p(B(0.45, 0.06, 0.45), c, [0, 0.03, 0]), p(CONE(0.18, 0.6, 7), c, [0, 0.33, 0]), p(C(0.11, 0.135, 0.1, 7), '#FFFFFF', [0, 0.32, 0])],
  scale: [0.9, 1.2],
  yaw: 'random',
});

const crate = (c: string, band: string): PropDef => ({
  parts: [p(B(0.9, 0.9, 0.9), c, [0, 0.45, 0]), p(B(0.94, 0.12, 0.94), band, [0, 0.45, 0]), p(B(0.7, 0.7, 0.7), c, [0.05, 1.25, 0.05], [0, 0.4, 0])],
  yaw: 'random',
});

const cloudTree = (trunk: string, leaf: string, leaf2: string): PropDef => ({
  parts: [p(C(0.18, 0.28, 2.2, 6), trunk, [0, 1.1, 0]), p(S(1.1), leaf, [0, 2.6, 0]), p(S(0.8), leaf2, [0.6, 3.1, 0.3]), p(S(0.75), leaf, [-0.5, 3.0, -0.4])],
  scale: [0.9, 1.5],
  yaw: 'random',
});

/* ---------- big buildings ---------- */

function building(w: number, h: number, d: number, wall: string, win: string, floors: number, roof: string): PropDef {
  const parts: Part[] = [p(B(w, h, d), wall, [0, h / 2, 0]), p(B(w + 0.4, 0.5, d + 0.4), roof, [0, h + 0.25, 0])];
  const glow: Part[] = [];
  for (let f = 0; f < floors; f++) {
    const y = ((f + 0.6) / floors) * h;
    glow.push(p(B(0.1, h / floors * 0.45, d * 0.8), win, [w / 2 + 0.02, y, 0]));
  }
  return { parts, glow, yaw: 'face', scale: [0.8, 1.3] };
}

function planeProp(body: string, stripe: string, tail: string): PropDef {
  return {
    parts: [
      p(C(1.4, 1.4, 16, 10), body, [0, 2.6, 0], [Math.PI / 2, 0, 0]),
      p(S(1.4, 10, 6), body, [0, 2.6, 8], undefined, [1, 1, 1.6]),
      p(CONE(1.4, 4, 10), body, [0, 2.6, -10], [-Math.PI / 2, 0, 0]),
      p(B(15, 0.3, 3.2), body, [0, 2.2, 1]),
      p(B(0.3, 3.6, 2.8), tail, [0, 5, -9.5]),
      p(B(5, 0.25, 1.8), body, [0, 3, -9.6]),
      p(C(0.55, 0.55, 2.2, 8), '#9AA4B2', [4, 1.6, 1.5], [Math.PI / 2, 0, 0]),
      p(C(0.55, 0.55, 2.2, 8), '#9AA4B2', [-4, 1.6, 1.5], [Math.PI / 2, 0, 0]),
      p(B(2.9, 0.4, 13), stripe, [0, 2.6, 0]),
      p(C(0.12, 0.12, 1.4, 5), '#333333', [0, 0.7, 6]),
      p(C(0.12, 0.12, 1.4, 5), '#333333', [1.5, 0.7, -1]),
      p(C(0.12, 0.12, 1.4, 5), '#333333', [-1.5, 0.7, -1]),
    ],
    glow: [p(B(2.81, 0.25, 11), '#BFE9FF', [0, 3.25, 0.5])],
    yaw: 'random',
    scale: [0.9, 1.1],
  };
}

function castleTower(stone: string, roof: string, flag: string): PropDef {
  return {
    parts: [
      p(C(2.2, 2.6, 14, 10), stone, [0, 7, 0]),
      p(C(2.6, 2.6, 1.2, 10), stone, [0, 14.4, 0]),
      p(CONE(3, 5, 10), roof, [0, 17.5, 0]),
      p(C(0.06, 0.06, 2.4, 4), '#555555', [0, 21, 0]),
      p(B(0.06, 0.8, 1.4), flag, [0, 21.6, 0.7]),
    ],
    glow: [p(B(0.1, 1.2, 0.7), '#FFE48A', [2.25, 9, 0]), p(B(0.1, 1.2, 0.7), '#FFE48A', [2.3, 5, 0])],
    scale: [0.9, 1.4],
    yaw: 'face',
  };
}

/* ---------- kits ---------- */

export function kitFor(kind: DecorKind, c: ThemeColors): EnvKit {
  switch (kind) {
    case 'mall':
      return {
        ground: 'tiles', groundA: '#EDE7DA', groundB: '#DCD3C2', sky: 'clouds', edge: 'rail',
        near: [
          plant('#C97B4A', '#4CAF50'), plant('#F2F2F2', '#66BB6A', 1.2), bench('#C9874A'), wcSign('#2F80ED'),
          balloons(['#FF5FA2', '#FFD23F', '#2FA8FF', '#2BD47D']),
          { parts: [p(B(0.7, 1.9, 0.9), '#E53935', [0, 0.95, 0]), p(B(0.72, 0.4, 0.92), '#B71C1C', [0, 1.75, 0])], glow: [p(B(0.05, 1.0, 0.6), '#9BE7FF', [0.37, 1.05, 0])], yaw: 'face', weight: 0.7 }, // vending machine
          { parts: [p(B(1.2, 0.9, 1.6), '#FFB84D', [0, 0.45, 0]), p(C(0.05, 0.05, 1.6, 5), '#666', [0, 1.6, 0]), p(CONE(1.3, 0.6, 8), '#FF5FA2', [0, 2.5, 0]), p(S(0.25), '#FFF3C4', [0.4, 1.05, 0.3])], yaw: 'face', weight: 0.7 }, // kiosk
        ],
        mid: [
          // Store fronts with awnings
          ...(['#FF5FA2', '#2FA8FF', '#2BD47D', '#FFB020', '#8B5CFF'] as const).map((col) => ({
            parts: [
              p(B(2.2, 4.2, 5.5), '#F7F3EA', [0, 2.1, 0]),
              p(B(0.3, 0.7, 5.6), col, [1.2, 3.6, 0]),
              p(B(1.0, 0.12, 5.6), col, [1.55, 2.95, 0], [0, 0, -0.35]),
              p(B(0.4, 0.3, 1.0), '#FFFFFF', [1.3, 4.4, 0]),
            ],
            glow: [p(B(0.08, 2.0, 4.2), '#CFF2FF', [1.12, 1.4, 0])],
            yaw: 'face' as const,
          })),
          { parts: [p(C(1.6, 1.8, 0.6, 12), '#DCD3C2', [0, 0.3, 0]), p(C(1.4, 1.4, 0.62, 12), '#6EC6FF', [0, 0.32, 0]), p(C(0.25, 0.4, 1.6, 8), '#FFFFFF', [0, 1.1, 0]), p(S(0.5), '#A7DEFF', [0, 2.1, 0])], weight: 0.6, yaw: 'random' }, // fountain
        ],
        far: [
          { parts: [p(B(6, 16, 40), '#F2EAD8', [0, 8, 0]), p(B(0.6, 0.5, 40), c.wall, [3.2, 5.5, 0]), p(B(0.6, 0.5, 40), c.wall, [3.2, 10.5, 0]), p(B(7, 0.8, 41), c.accent, [0, 16.3, 0])], glow: [p(B(0.1, 2.6, 36), '#FFF6D6', [3.06, 3, 0]), p(B(0.1, 2.6, 36), '#FFF6D6', [3.06, 8, 0]), p(B(0.1, 2.6, 36), '#FFF6D6', [3.06, 13, 0])], yaw: 'face' },
          { parts: [p(C(0.25, 0.25, 12, 6), '#9AA4B2', [0, 6, 0]), p(B(0.2, 5, 3), c.accent, [0.3, 9, 0])], glow: [p(B(0.05, 2, 2.4), '#FFFFFF', [0.42, 9, 0])], yaw: 'face', weight: 0.6 }, // SALE banners
          building(8, 26, 10, '#B9D7F2', '#FFF6D6', 7, '#7FA7D6'),
          building(7, 18, 9, '#F6C7D8', '#FFF6D6', 5, '#E17FA3'),
        ],
      };
    case 'stadium':
      return {
        ground: 'grass', groundA: '#4CC46A', groundB: '#41B35D', sky: 'clouds', edge: 'boards',
        near: [
          cone('#FF7A1A'),
          { parts: [p(S(0.35, 10, 8), '#FFFFFF', [0, 0.35, 0]), p(S(0.36, 5, 4), '#222222', [0, 0.35, 0], undefined, [0.5, 1, 1])], yaw: 'random' }, // football
          { parts: [p(C(0.35, 0.3, 0.9, 10), '#2F80ED', [0, 0.45, 0]), p(C(0.37, 0.37, 0.12, 10), '#FFFFFF', [0, 0.92, 0])], yaw: 'random' }, // cooler
          { parts: [p(C(0.04, 0.04, 3.2, 5), '#DDDDDD', [0, 1.6, 0]), p(B(0.03, 0.9, 1.4), c.wall, [0, 2.7, 0.7])], yaw: 'face' }, // flag
          bench('#2F80ED', '#DDDDDD'),
          { parts: [p(B(0.7, 0.6, 0.5), '#7A4E2A', [0, 0.3, 0]), ...[0, 1, 2].map((i) => p(S(0.2, 8, 6), '#FFFFFF', [0, 0.75, -0.3 + i * 0.3]))], yaw: 'random' }, // ball rack
        ],
        mid: [
          { parts: [p(C(0.08, 0.08, 2.4, 6), '#FFFFFF', [0, 1.2, -2.4]), p(C(0.08, 0.08, 2.4, 6), '#FFFFFF', [0, 1.2, 2.4]), p(C(0.08, 0.08, 4.8, 6), '#FFFFFF', [0, 2.4, 0], [Math.PI / 2, 0, 0]), p(B(1.4, 2.3, 4.8), '#E8F5E9', [-0.7, 1.15, 0])], yaw: 'face', weight: 0.6 }, // goal
          { parts: [p(B(0.3, 1.0, 6), c.wall, [0, 0.5, 0]), p(B(0.32, 0.3, 6), '#FFFFFF', [0, 0.85, 0])], glow: [p(B(0.05, 0.4, 5), c.accent, [0.17, 0.45, 0])], yaw: 'face' }, // ad board
          cloudTree('#7A4E2A', '#3BAA4F', '#56C46A'),
          { parts: [p(C(0.04, 0.06, 1.6, 4), '#333', [0, 0.8, 0], [0, 0, 0.3]), p(C(0.04, 0.06, 1.6, 4), '#333', [0, 0.8, 0], [0, 0, -0.3]), p(B(0.5, 0.4, 0.8), '#222', [0, 1.75, 0]), p(C(0.15, 0.2, 0.5, 8), '#111', [0.45, 1.75, 0], [0, 0, Math.PI / 2])], yaw: 'face', weight: 0.5 }, // tv camera
        ],
        far: [
          {
            // tiered stands full of fans (colored rows)
            parts: [
              ...[0, 1, 2, 3, 4, 5].map((i) => p(B(3, 1.6, 34), i % 2 ? '#8A93A8' : '#9AA4B8', [-i * 2.6, 0.8 + i * 1.6, 0], undefined, [1, 1 + i * 0.001, 1])),
              ...[0, 1, 2, 3, 4, 5].map((i) => p(B(1.2, 0.5, 33), ['#FF4D5E', '#FFD23F', '#2FA8FF', '#FFFFFF', '#2BD47D', '#FF8A3D'][i], [-i * 2.6 + 0.6, 1.85 + i * 1.6, 0])),
              p(B(18, 1.2, 36), c.wall, [-7, 10.5, 0]),
            ],
            yaw: 'face',
          },
          { parts: [p(C(0.35, 0.5, 24, 6), '#9AA4B2', [0, 12, 0]), p(B(1.2, 3.4, 5), '#2B2F3A', [0.3, 24, 0])], glow: [p(B(0.1, 3, 4.6), '#FFF8C2', [0.92, 24, 0])], yaw: 'face', weight: 0.5 }, // floodlights
          { parts: [p(B(1.5, 7, 12), '#1D2340', [0, 11, 0]), p(C(0.4, 0.4, 8, 6), '#555', [0, 4, -4]), p(C(0.4, 0.4, 8, 6), '#555', [0, 4, 4])], glow: [p(B(0.1, 5.5, 10.5), c.accent, [0.78, 11, 0])], yaw: 'face', weight: 0.3 }, // scoreboard
        ],
      };
    case 'airport':
      return {
        ground: 'tarmac', groundA: '#5E6672', groundB: '#57606B', sky: 'clouds', edge: 'bollards',
        near: [
          { parts: [p(B(0.7, 0.5, 0.45), '#E53935', [0, 0.25, 0]), p(B(0.6, 0.45, 0.4), '#1E88E5', [0.05, 0.72, 0], [0, 0.3, 0]), p(B(0.5, 0.35, 0.35), '#FDD835', [0, 1.12, 0], [0, -0.2, 0])], yaw: 'random' }, // suitcases
          cone('#FF7A1A'),
          { parts: [p(B(0.6, 0.45, 3.2), '#455A64', [0, 0.45, 0]), ...[0, 1, 2, 3].map((i) => p(B(0.55, 0.12, 0.65), '#2F80ED', [0, 0.72, -1.15 + i * 0.77])), ...[0, 1, 2, 3].map((i) => p(B(0.12, 0.5, 0.65), '#2F80ED', [-0.25, 1.0, -1.15 + i * 0.77]))], yaw: 'face' }, // seat row
          { parts: [p(C(0.07, 0.07, 2.6, 6), '#455A64', [0, 1.3, 0]), p(B(0.12, 0.9, 1.8), '#263238', [0, 2.6, 0])], glow: [p(B(0.03, 0.12, 1.5), '#FFC107', [0.07, 2.8, 0]), p(B(0.03, 0.12, 1.5), '#FFC107', [0.07, 2.55, 0]), p(B(0.03, 0.12, 1.0), '#FFC107', [0.07, 2.3, -0.2])], yaw: 'face' }, // departures board
          plant('#B0BEC5', '#43A047', 1.1),
        ],
        mid: [
          { parts: [p(B(1.6, 0.9, 2.6), '#FDD835', [0, 0.9, 0]), p(B(1.5, 0.9, 1.0), '#FDD835', [0, 1.6, -0.8]), ...[[-0.7, -0.9], [0.7, -0.9], [-0.7, 0.9], [0.7, 0.9]].map(([x, z]) => p(C(0.3, 0.3, 0.25, 8), '#222', [x, 0.3, z], [0, 0, Math.PI / 2]))], glow: [p(B(0.9, 0.5, 0.05), '#BFE9FF', [0, 1.7, -1.31])], yaw: 'random' }, // tug
          { parts: [...[0, 1, 2].map((i) => p(B(1.2, 0.8, 1.8), '#90A4AE', [0, 0.7, i * 2.2 - 2.2])), ...[0, 1, 2].map((i) => p(B(1.0, 0.6, 1.4), ['#E53935', '#1E88E5', '#43A047'][i], [0, 1.4, i * 2.2 - 2.2]))], yaw: 'face' }, // luggage train
          { parts: [p(B(2, 1.6, 4.2), '#ECEFF1', [0, 1.1, 0]), p(C(0.9, 0.9, 3.4, 10), '#B0BEC5', [0, 1.6, -0.4], [Math.PI / 2, 0, 0])], yaw: 'random', weight: 0.6 }, // fuel truck
        ],
        far: [
          planeProp('#FFFFFF', c.wall, c.accent),
          planeProp('#F5F5F5', '#E53935', '#1E88E5'),
          { parts: [p(C(1.4, 2, 18, 10), '#ECEFF1', [0, 9, 0]), p(C(3.2, 2.6, 3, 10), '#455A64', [0, 19.5, 0]), p(C(3.4, 3.4, 0.6, 10), '#ECEFF1', [0, 21.3, 0])], glow: [p(C(3.25, 3.25, 1.6, 10), '#8FD8FF', [0, 19.6, 0])], weight: 0.35, yaw: 'random' }, // control tower
          { parts: [p(C(9, 9, 30, 12, ), '#B0BEC5', [0, 0, 0], [Math.PI / 2, 0, 0], [1, 1, 0.75])], weight: 0.5, yaw: 'face' }, // hangar
          building(10, 14, 22, '#DCE3EA', '#9BE7FF', 3, '#2E8BFF'), // terminal
        ],
      };
    case 'waterpark':
      return {
        ground: 'water', groundA: '#38C6E8', groundB: '#5ED4F0', sky: 'clouds', edge: 'fence',
        near: [
          { parts: [p(C(0.04, 0.04, 2.4, 5), '#FFFFFF', [0, 1.2, 0]), p(CONE(1.3, 0.6, 8), '#FF5F7A', [0, 2.5, 0]), p(CONE(1.31, 0.6, 8), '#FFFFFF', [0, 2.5, 0], [0, 0.39, 0], [1, 1, 0.5])], yaw: 'random' }, // umbrella
          { parts: [p(B(0.7, 0.15, 1.8), '#FFFFFF', [0, 0.35, 0]), p(B(0.7, 0.12, 0.7), '#FFFFFF', [0, 0.6, -0.8], [0.6, 0, 0]), p(B(0.62, 0.05, 1.6), '#2FA8FF', [0, 0.44, 0])], yaw: 'face' }, // lounger
          { parts: [p(TOR(0.42, 0.17, 6, 12), '#FF8A3D', [0, 0.17, 0], [Math.PI / 2, 0, 0])], yaw: 'random' }, // ring
          { parts: [p(S(0.4, 10, 8), '#FFD23F', [0, 0.4, 0]), p(S(0.41, 4, 4), '#E53935', [0, 0.4, 0], undefined, [0.3, 1, 1])], yaw: 'random' }, // beach ball
          palm(),
          { parts: [p(C(0.05, 0.05, 2.4, 4), '#FFFFFF', [0, 1.2, -0.4]), p(C(0.05, 0.05, 2.4, 4), '#FFFFFF', [0, 1.2, 0.4]), p(B(0.8, 0.1, 1.0), '#FFFFFF', [0, 2.4, 0]), p(B(0.1, 0.8, 1.0), '#E53935', [-0.4, 2.8, 0])], weight: 0.4, yaw: 'face' }, // lifeguard
        ],
        mid: [
          { parts: [p(C(3, 3.2, 0.5, 14), '#FFFFFF', [0, 0.25, 0]), p(C(2.7, 2.7, 0.52, 14), '#7FE3FF', [0, 0.27, 0])], yaw: 'random' }, // pool
          { parts: [p(C(2.4, 2.8, 0.6, 10), '#FFE7A8', [0, 0.3, 0]), ...[0, 1].map((i) => palm().parts.map((q) => ({ ...q, pos: [(q.pos?.[0] ?? 0) + (i ? 1 : -1), (q.pos?.[1] ?? 0) + 0.5, (q.pos?.[2] ?? 0) + (i ? 0.6 : -0.6)] as V3 }))).flat()], yaw: 'random', weight: 0.8 }, // sand island
          { parts: [p(S(1.2, 7, 5), '#8D99AE', [0, 0.5, 0], undefined, [1.4, 0.8, 1]), p(S(0.8, 7, 5), '#A0AABF', [0.9, 0.4, 0.8])], yaw: 'random', weight: 0.6 }, // rocks
        ],
        far: [
          {
            // giant spiral slide tower
            parts: [
              p(C(1.6, 2, 16, 8), '#FFD23F', [0, 8, 0]),
              p(B(4, 0.5, 4), '#FF5F7A', [0, 16.2, 0]),
              p(CONE(3.2, 2.4, 8), '#2FA8FF', [0, 18, 0]),
              ...[0, 1, 2, 3, 4, 5, 6].map((i) => p(TOR(3.2, 0.55, 5, 10, Math.PI * 0.9), i % 2 ? '#2FA8FF' : '#FF5F7A', [0, 14 - i * 2, 0], [Math.PI / 2, 0, i * 1.6])),
            ],
            scale: [0.9, 1.2],
            yaw: 'random',
          },
          { parts: [p(CONE(16, 22, 8), '#3E9E6F', [0, 11, 0]), p(CONE(10, 14, 8), '#4FBF84', [8, 7, 6])], yaw: 'random', weight: 0.6 }, // jungle hills
        ],
      };
    case 'museum':
      return {
        ground: 'marble', groundA: '#F4F1EA', groundB: '#D9D3C7', sky: 'clouds', edge: 'rail',
        near: [
          { parts: [p(C(0.25, 0.3, 0.1, 8), '#C9A34E', [0, 0.05, 0]), p(C(0.05, 0.05, 1.0, 6), '#C9A34E', [0, 0.5, 0]), p(S(0.08, 6, 4), '#C9A34E', [0, 1.02, 0]), p(C(0.04, 0.04, 2.2, 5), '#B71C1C', [0, 0.9, 1.1], [Math.PI / 2, 0, 0])], yaw: 'face' }, // velvet rope
          { parts: [p(B(0.9, 1.1, 0.9), '#ECE7DF', [0, 0.55, 0]), p(S(0.35, 10, 8), '#B0BEC5', [0, 1.6, 0]), p(B(0.38, 0.38, 0.32), '#B0BEC5', [0, 1.3, 0])], yaw: 'face' }, // bust
          { parts: [p(B(0.8, 0.9, 0.8), '#ECE7DF', [0, 0.45, 0]), p(C(0.15, 0.3, 0.6, 8), '#E8463A', [0, 1.2, 0]), p(S(0.3, 8, 6), '#E8463A', [0, 1.55, 0]), p(C(0.1, 0.18, 0.3, 8), '#E8463A', [0, 1.9, 0])], yaw: 'random' }, // vase
          bench('#8C5A3C', '#C9A34E'),
          { parts: [p(B(0.8, 0.8, 0.8), '#ECE7DF', [0, 0.4, 0]), p(TOR(0.4, 0.12, 6, 12), c.accent, [0, 1.3, 0]), p(S(0.25), '#2FA8FF', [0, 1.3, 0])], yaw: 'random' }, // modern art
        ],
        mid: [
          { parts: [p(B(0.4, 4.5, 6), '#F2E9DC', [0, 2.25, 0]), p(B(0.12, 2.0, 2.4), '#C9A34E', [0.25, 2.6, -1.4]), p(B(0.12, 1.4, 1.6), '#C9A34E', [0.25, 2.4, 1.6])], glow: [p(B(0.05, 1.7, 2.1), c.accent, [0.32, 2.6, -1.4]), p(B(0.05, 1.1, 1.3), '#2FA8FF', [0.32, 2.4, 1.6])], yaw: 'face' }, // paintings wall
          { parts: [p(B(1.2, 0.3, 1.2), '#E8E1D5', [0, 0.15, 0]), p(C(0.4, 0.45, 5, 10), '#F2EDE4', [0, 2.8, 0]), p(B(1.2, 0.4, 1.2), '#E8E1D5', [0, 5.4, 0])], yaw: 'random' }, // column
          {
            // dinosaur skeleton
            parts: [
              ...Array.from({ length: 9 }, (_, i) => p(S(0.22, 6, 4), '#F2EDE4', [0, 2.2 + Math.sin(i / 2.5) * 0.4, -2 + i * 0.5])),
              p(S(0.45, 7, 5), '#F2EDE4', [0, 2.9, 2.6], undefined, [0.8, 0.8, 1.4]),
              ...[-1.2, 0.8].map((z) => p(C(0.08, 0.1, 2.0, 5), '#F2EDE4', [0, 1.0, z])),
              p(B(1.6, 0.2, 5), '#C9A34E', [0, 0.1, 0]),
            ],
            yaw: 'face',
            weight: 0.5,
          },
        ],
        far: [
          {
            // classical facade
            parts: [
              p(B(4, 2, 30), '#E8E1D5', [0, 1, 0]),
              ...Array.from({ length: 8 }, (_, i) => p(C(0.7, 0.8, 10, 8), '#F2EDE4', [1.4, 7, -12.6 + i * 3.6])),
              p(B(4, 1.2, 30), '#E8E1D5', [0, 12.6, 0]),
              p(new THREE.CylinderGeometry(0, 6, 30, 3, 1), '#E8E1D5', [0, 15.4, 0], [Math.PI / 2, 0, Math.PI / 2], [1, 1, 0.55]),
            ],
            yaw: 'face',
          },
        ],
      };
    case 'space':
      return {
        ground: 'metal', groundA: '#3A4466', groundB: '#323B5A', sky: 'stars', edge: 'lights',
        near: [
          { parts: [p(B(0.8, 1.0, 1.4), '#7B8AB8', [0, 0.5, 0]), p(B(0.6, 0.5, 1.4), '#5C6A99', [0.1, 1.15, 0], [0, 0, -0.5])], glow: [p(B(0.05, 0.35, 1.1), '#3DF5FF', [0.36, 1.2, 0], [0, 0, -0.5])], yaw: 'face' }, // console
          crate('#8A9CC4', '#FF4DD8'),
          { parts: [p(C(0.05, 0.05, 2.6, 5), '#AAB6CF', [0, 1.3, 0]), p(C(0.6, 0.05, 0.3, 10), '#C9D3E6', [0, 2.7, 0], [0, 0, 0.6])], glow: [p(S(0.1, 6, 4), '#FF4DD8', [0, 2.9, 0])], yaw: 'random' }, // dish
          { parts: [p(C(0.22, 0.28, 0.7, 8), '#C9D3E6', [0, 0.35, 0]), p(S(0.26, 8, 6), '#C9D3E6', [0, 0.85, 0])], glow: [p(B(0.05, 0.08, 0.3), '#3DF5FF', [0.25, 0.9, 0])], yaw: 'face' }, // little robot
          lamp('#AAB6CF', '#3DF5FF', 2.6),
        ],
        mid: [
          { parts: [p(S(2.2, 12, 6, ), '#C9D3E6', [0, 0, 0], undefined, [1, 0.9, 1]), p(C(2.3, 2.3, 0.4, 12), '#7B6CFF', [0, 0.2, 0])], glow: [p(B(0.1, 0.5, 1.2), '#3DF5FF', [2.0, 1.0, 0])], yaw: 'face' }, // habitat dome
          { parts: [p(C(0.45, 0.45, 5, 10), '#FFFFFF', [0, 3, 0]), p(CONE(0.45, 1.4, 10), '#FF4D5E', [0, 6.2, 0]), ...[0, 1, 2].map((i) => p(B(0.1, 1.2, 0.8), '#FF4D5E', [Math.cos(i * 2.1) * 0.45, 1.0, Math.sin(i * 2.1) * 0.45], [0, -i * 2.1, 0]))], glow: [p(S(0.2, 6, 4), '#3DF5FF', [0.4, 4.2, 0])], yaw: 'random', weight: 0.6 }, // rocket
          { parts: [p(C(0.15, 0.2, 3, 6), '#AAB6CF', [0, 1.5, 0]), p(C(2.2, 0.3, 0.8, 12), '#E4EAF5', [0, 3.4, 0], [0, 0, 0.7])], yaw: 'face', weight: 0.6 }, // big dish
        ],
        far: [
          { parts: [p(S(9, 16, 10), '#FF4DD8', [0, 26, 0]), p(TOR(14, 0.8, 4, 24), '#3DF5FF', [0, 26, 0], [1.2, 0.3, 0])], yaw: 'random', weight: 0.35 }, // ringed planet
          { parts: [p(S(5, 12, 8), '#7B6CFF', [0, 18, 0]), p(S(1.3, 8, 6), '#C9D3E6', [7, 24, 3])], yaw: 'random', weight: 0.35 }, // planet + moon
          { parts: [p(TOR(10, 1.2, 6, 20), '#C9D3E6', [0, 14, 0], [0, Math.PI / 2, 0]), p(C(0.8, 0.8, 20, 8), '#AAB6CF', [0, 14, 0], [0, 0, Math.PI / 2])], glow: [p(TOR(10, 0.5, 4, 20), '#3DF5FF', [0.8, 14, 0], [0, Math.PI / 2, 0])], yaw: 'random', weight: 0.3 }, // station ring
          { parts: [p(S(2.5, 6, 4), '#6B6F82', [0, 6, 0], [0.5, 0.3, 0], [1.3, 0.8, 1]), p(S(1.4, 6, 4), '#5A5E70', [3, 9, 2], [0.2, 0.8, 0])], yaw: 'random', weight: 0.6 }, // asteroids
        ],
      };
    case 'palace':
      return {
        ground: 'garden', groundA: '#5CBF5F', groundB: '#52B356', sky: 'clouds', edge: 'hedge',
        near: [
          { parts: [p(C(0.35, 0.3, 0.4, 8), '#D9C9B4', [0, 0.2, 0]), p(CONE(0.55, 1.6, 8), '#2E7D32', [0, 1.2, 0])], scale: [0.9, 1.3], yaw: 'random' }, // cone topiary
          { parts: [p(C(0.35, 0.3, 0.4, 8), '#D9C9B4', [0, 0.2, 0]), p(S(0.55, 8, 6), '#388E3C', [0, 0.9, 0]), p(S(0.35, 8, 6), '#388E3C', [0, 1.6, 0])], yaw: 'random' }, // ball topiary
          { parts: [p(B(0.5, 0.4, 0.5), '#D4A017', [0, 0.2, 0]), p(C(0.16, 0.16, 1.1, 8), '#C2185B', [0, 0.95, 0]), p(S(0.2, 8, 6), '#FFE0B2', [0, 1.65, 0]), p(C(0.18, 0.18, 0.7, 8), '#111111', [0, 2.05, 0]), p(C(0.02, 0.02, 1.8, 4), '#9E9E9E', [0.25, 1.2, 0])], yaw: 'face' }, // royal guard
          { parts: [p(C(0.4, 0.3, 0.4, 8), '#FFFFFF', [0, 0.2, 0]), ...[0, 1, 2, 3, 4].map((i) => p(S(0.16, 6, 4), ['#E91E63', '#FFEB3B', '#FF5722', '#9C27B0', '#FFFFFF'][i], [Math.cos(i * 1.3) * 0.22, 0.5, Math.sin(i * 1.3) * 0.22]))], yaw: 'random' }, // flowers
          lamp('#D4A017', '#FFE48A', 3),
        ],
        mid: [
          { parts: [p(C(2, 2.2, 0.6, 12), '#F5F0E6', [0, 0.3, 0]), p(C(1.8, 1.8, 0.62, 12), '#6EC6FF', [0, 0.32, 0]), p(C(0.25, 0.3, 1.6, 8), '#F5F0E6', [0, 1.4, 0]), p(C(1, 0.6, 0.3, 10), '#F5F0E6', [0, 2.2, 0]), p(S(0.35, 8, 6), '#D4A017', [0, 2.6, 0])], yaw: 'random' }, // fountain
          { parts: [p(B(1.6, 1.2, 6), '#2E7D32', [0, 0.6, 0]), p(B(1.65, 0.2, 6.05), '#388E3C', [0, 1.25, 0])], yaw: 'face' }, // hedge wall
          cloudTree('#6D4C41', '#43A047', '#66BB6A'),
          { parts: [...[0, 1, 2, 3, 4, 5].map((i) => p(C(0.08, 0.08, 2.4, 5), '#FFFFFF', [Math.cos(i * 1.05) * 1.3, 1.2, Math.sin(i * 1.05) * 1.3])), p(CONE(1.9, 1.2, 6), c.wall, [0, 3, 0]), p(C(1.5, 1.5, 0.2, 6), '#FFFFFF', [0, 0.1, 0])], yaw: 'random', weight: 0.6 }, // gazebo
        ],
        far: [
          castleTower('#F3E5D0', c.wall, c.accent),
          { parts: [p(B(4, 12, 34), '#F3E5D0', [0, 6, 0]), ...Array.from({ length: 9 }, (_, i) => p(B(4.2, 1.2, 1.8), '#F3E5D0', [0, 12.6, -16 + i * 4]))], glow: [...Array.from({ length: 6 }, (_, i) => p(B(0.1, 2, 1.4), '#FFE48A', [2.05, 7, -13 + i * 5.2]))], yaw: 'face' }, // castle wall
          { parts: [p(S(14, 10, 6), '#66BB6A', [0, -4, 0], undefined, [1.6, 0.7, 1.2])], yaw: 'random', weight: 0.5 }, // hills
        ],
      };
    case 'manor':
      return {
        ground: 'graveyard', groundA: '#3E4A3A', groundB: '#36412F', sky: 'night', edge: 'fence',
        near: [
          { parts: [p(B(0.25, 1.0, 0.7), '#8C8C99', [0, 0.5, 0]), p(C(0.35, 0.35, 0.25, 8, ), '#8C8C99', [0, 1.0, 0], [Math.PI / 2, 0, 0], [1, 1, 1])], yaw: 'face', scale: [0.8, 1.2] }, // gravestone
          { parts: [p(B(0.2, 1.4, 0.2), '#7D7D8A', [0, 0.7, 0]), p(B(0.2, 0.2, 0.8), '#7D7D8A', [0, 1.1, 0])], yaw: 'face', weight: 0.6 }, // cross
          { parts: [p(S(0.4, 10, 6), '#FF8F00', [0, 0.32, 0], undefined, [1.1, 0.8, 1]), p(C(0.05, 0.05, 0.2, 5), '#33691E', [0, 0.72, 0])], glow: [p(B(0.04, 0.08, 0.1), '#FFE14D', [0.42, 0.38, -0.12]), p(B(0.04, 0.08, 0.1), '#FFE14D', [0.42, 0.38, 0.12]), p(B(0.04, 0.06, 0.26), '#FFE14D', [0.42, 0.2, 0])], yaw: 'face' }, // jack-o-lantern
          { parts: [p(C(0.05, 0.06, 0.5, 6), '#FFF8E1', [0, 0.25, 0]), p(C(0.05, 0.06, 0.35, 6), '#FFF8E1', [0.2, 0.18, 0.15])], glow: [p(S(0.06, 5, 4), '#FFEB3B', [0, 0.56, 0]), p(S(0.06, 5, 4), '#FFEB3B', [0.2, 0.41, 0.15])], yaw: 'random' }, // candles
          { parts: [p(C(0.5, 0.4, 0.7, 8), '#212121', [0, 0.45, 0]), p(TOR(0.48, 0.06, 4, 10), '#424242', [0, 0.8, 0], [Math.PI / 2, 0, 0])], glow: [p(C(0.42, 0.42, 0.05, 8), '#9CFF5A', [0, 0.78, 0])], yaw: 'random', weight: 0.5 }, // cauldron
        ],
        mid: [
          { parts: [p(C(0.15, 0.3, 3.2, 6), '#3E2723', [0, 1.6, 0]), p(C(0.06, 0.1, 1.6, 5), '#3E2723', [0.5, 2.9, 0], [0, 0, -0.9]), p(C(0.05, 0.09, 1.4, 5), '#3E2723', [-0.45, 2.6, 0.2], [0.2, 0, 0.9]), p(C(0.04, 0.06, 1.0, 5), '#3E2723', [0.1, 3.4, -0.4], [-0.7, 0, 0.2])], yaw: 'random', scale: [1, 1.6] }, // dead tree
          { parts: [p(B(2.4, 2.2, 2.6), '#6E6A80', [0, 1.1, 0]), p(new THREE.CylinderGeometry(0, 1.9, 2.6, 4, 1), '#4E4A60', [0, 2.9, 0], [0, Math.PI / 4, 0], [1, 0.5, 1]), p(B(0.1, 1.4, 0.9), '#2B2838', [1.22, 0.7, 0])], yaw: 'face', weight: 0.6 }, // crypt
          { parts: [p(C(0.05, 0.05, 2.6, 5), '#212121', [0, 1.3, 0]), p(B(0.35, 0.45, 0.35), '#212121', [0, 2.7, 0])], glow: [p(B(0.25, 0.32, 0.25), '#FFB74D', [0, 2.7, 0])], yaw: 'random' }, // lantern
        ],
        far: [
          {
            // the haunted manor
            parts: [
              p(B(10, 12, 22), '#4E3A75', [0, 6, 0]),
              p(new THREE.CylinderGeometry(0, 9, 7, 4, 1), '#2E2148', [0, 15.5, 0], [0, Math.PI / 4, 0], [0.8, 1, 1.7]),
              p(C(2, 2, 18, 8), '#4E3A75', [2, 9, -12]),
              p(CONE(2.8, 6, 8), '#2E2148', [2, 21, -12]),
              p(C(1.6, 1.6, 15, 8), '#4E3A75', [2, 7.5, 12]),
              p(CONE(2.3, 5, 8), '#2E2148', [2, 17.5, 12]),
            ],
            glow: [...Array.from({ length: 6 }, (_, i) => p(B(0.1, 1.6, 1.2), '#FFD54F', [5.06, 4 + (i % 2) * 5, -7 + Math.floor(i / 2) * 7])), p(B(0.1, 1.4, 0.8), '#FFD54F', [4.05, 14, -12])],
            yaw: 'face',
          },
          { parts: [p(C(0.4, 0.8, 9, 6), '#2B1E1A', [0, 4.5, 0]), p(C(0.2, 0.4, 5, 5), '#2B1E1A', [1.8, 8, 0], [0, 0, -0.8]), p(C(0.2, 0.4, 4, 5), '#2B1E1A', [-1.6, 7.5, 0.5], [0, 0, 0.9])], yaw: 'random', scale: [1, 1.8] }, // giant dead tree
        ],
      };
  }
}
