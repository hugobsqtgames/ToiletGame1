import * as THREE from 'three';
import type { DecorKind, ThemeColors } from '../core/worlds';
import type { Part } from './geo';

/**
 * Themed scenery placed along both sides of the track. Each theme returns a
 * list of "props" (parts relative to the prop origin); the level builder
 * merges them all into the static mesh. Pure geometry, no textures.
 */
const S = (r: number, w = 8, h = 6) => new THREE.SphereGeometry(r, w, h);
const C = (rt: number, rb: number, h: number, seg = 10) => new THREE.CylinderGeometry(rt, rb, h, seg);
const B = (x: number, y: number, z: number) => new THREE.BoxGeometry(x, y, z);
const CONE = (r: number, h: number, seg = 8) => new THREE.ConeGeometry(r, h, seg);
const TOR = (r: number, t: number) => new THREE.TorusGeometry(r, t, 8, 16);

export type Prop = Part[];

/** A cartoon toilet (used in stalls, decor and the finish throne). */
export function toiletProp(color = '#FFFFFF', seat = '#E8E8E8', scale = 1): Prop {
  const s = scale;
  return [
    { geo: C(0.22 * s, 0.16 * s, 0.32 * s, 14), color, pos: [0, 0.16 * s, 0] },
    { geo: TOR(0.2 * s, 0.045 * s), color: seat, pos: [0, 0.33 * s, 0], rot: [Math.PI / 2, 0, 0] },
    { geo: B(0.42 * s, 0.42 * s, 0.16 * s), color, pos: [0, 0.48 * s, 0.24 * s] },
    { geo: B(0.08 * s, 0.03 * s, 0.03 * s), color: '#B0B0B0', pos: [0.12 * s, 0.66 * s, 0.18 * s] },
  ];
}

export function themeProps(kind: DecorKind, c: ThemeColors): Prop[] {
  switch (kind) {
    case 'mall':
      return [
        [
          { geo: C(0.35, 0.28, 0.6, 10), color: '#C97B4A', pos: [0, 0.3, 0] },
          { geo: S(0.55, 10, 8), color: '#4CAF50', pos: [0, 1.0, 0] },
          { geo: S(0.35, 8, 6), color: '#66BB6A', pos: [0.2, 1.45, 0.1] },
        ],
        [
          { geo: B(1.2, 3.2, 0.8), color: c.wall, pos: [0, 1.6, 0] },
          { geo: B(1.25, 0.35, 0.85), color: c.accent, pos: [0, 2.7, 0] },
          { geo: B(0.9, 1.2, 0.05), color: '#BDE7FF', pos: [0, 1.0, -0.43] },
        ],
        [
          { geo: C(0.08, 0.08, 2.4, 6), color: '#555B66', pos: [0, 1.2, 0] },
          { geo: B(0.7, 0.7, 0.1), color: '#2F80ED', pos: [0, 2.4, 0] },
          { geo: B(0.12, 0.38, 0.12), color: '#FFFFFF', pos: [-0.12, 2.4, -0.06] },
          { geo: S(0.07, 6, 4), color: '#FFFFFF', pos: [-0.12, 2.65, -0.06] },
          { geo: CONE(0.15, 0.36, 6), color: '#FFFFFF', pos: [0.14, 2.38, -0.06] },
          { geo: S(0.07, 6, 4), color: '#FFFFFF', pos: [0.14, 2.65, -0.06] },
        ],
      ];
    case 'stadium':
      return [
        [
          { geo: B(1.4, 0.6, 3), color: c.wall, pos: [0, 0.3, 0] },
          { geo: B(1.4, 0.6, 3), color: c.accent, pos: [0.9, 0.9, 0] },
          { geo: B(1.4, 0.6, 3), color: c.wall, pos: [1.8, 1.5, 0] },
          { geo: B(0.25, 0.3, 2.6), color: '#FFFFFF', pos: [0.9, 1.35, 0] },
        ],
        [
          { geo: C(0.1, 0.12, 6, 6), color: '#9AA4B2', pos: [0, 3, 0] },
          { geo: B(1.2, 0.6, 0.3), color: '#2B2F3A', pos: [0, 6, 0] },
          { geo: B(1.0, 0.4, 0.05), color: '#FFF8C2', pos: [0, 6, -0.18] },
        ],
      ];
    case 'airport':
      return [
        [
          { geo: B(0.7, 0.5, 0.4), color: '#E53935', pos: [0, 0.25, 0] },
          { geo: B(0.6, 0.45, 0.35), color: '#1E88E5', pos: [0.05, 0.72, 0] },
          { geo: B(0.5, 0.35, 0.3), color: '#FDD835', pos: [0, 1.12, 0] },
        ],
        [
          { geo: C(0.07, 0.07, 2.2, 6), color: '#455A64', pos: [0, 1.1, 0] },
          { geo: B(1.6, 0.9, 0.12), color: '#263238', pos: [0, 2.4, 0] },
          { geo: B(1.4, 0.12, 0.02), color: '#FFC107', pos: [0, 2.6, -0.07] },
          { geo: B(1.4, 0.12, 0.02), color: '#FFC107', pos: [0, 2.35, -0.07] },
          { geo: B(1.0, 0.12, 0.02), color: '#FFC107', pos: [-0.2, 2.1, -0.07] },
        ],
      ];
    case 'waterpark':
      return [
        [
          { geo: C(0.12, 0.18, 2.6, 6), color: '#A1662F', pos: [0, 1.3, 0], rot: [0, 0, 0.12] },
          { geo: CONE(0.9, 0.3, 6), color: '#2E7D32', pos: [0.15, 2.65, 0], rot: [0, 0, 0] },
          { geo: CONE(0.7, 0.4, 6), color: '#43A047', pos: [0.15, 2.85, 0], rot: [0, 0.5, 0] },
        ],
        [
          { geo: TOR(0.45, 0.18), color: c.accent, pos: [0, 0.2, 0], rot: [Math.PI / 2, 0, 0] },
          { geo: TOR(0.45, 0.18), color: '#FFFFFF', pos: [0.4, 0.55, 0.3], rot: [1.2, 0.3, 0] },
        ],
      ];
    case 'museum':
      return [
        [
          { geo: B(0.9, 0.2, 0.9), color: '#E8E1D5', pos: [0, 0.1, 0] },
          { geo: C(0.3, 0.33, 3.2, 12), color: '#F2EDE4', pos: [0, 1.8, 0] },
          { geo: B(0.9, 0.25, 0.9), color: '#E8E1D5', pos: [0, 3.5, 0] },
        ],
        [
          { geo: B(0.7, 1.1, 0.7), color: '#D7CCC8', pos: [0, 0.55, 0] },
          { geo: S(0.3, 10, 8), color: '#B0BEC5', pos: [0, 1.4, 0] },
          { geo: B(0.35, 0.35, 0.3), color: '#B0BEC5', pos: [0, 1.15, 0] },
          { geo: B(1.4, 1.0, 0.08), color: c.wall, pos: [1.2, 1.8, 0.4] },
          { geo: B(1.1, 0.75, 0.02), color: c.accent, pos: [1.2, 1.8, 0.35] },
        ],
      ];
    case 'space':
      return [
        [
          { geo: C(0.35, 0.45, 1.6, 10), color: '#CFD8DC', pos: [0, 0.8, 0] },
          { geo: S(0.36, 10, 8), color: c.rail, pos: [0, 1.7, 0] },
          { geo: C(0.03, 0.03, 0.8, 5), color: '#90A4AE', pos: [0, 2.3, 0] },
          { geo: S(0.08, 6, 4), color: c.accent, pos: [0, 2.7, 0] },
        ],
        [
          { geo: S(1.6, 14, 10), color: c.accent, pos: [6, 7, 0] },
          { geo: TOR(2.4, 0.15), color: c.rail, pos: [6, 7, 0], rot: [1.2, 0.3, 0] },
        ],
      ];
    case 'palace':
      return [
        [
          { geo: C(0.32, 0.36, 3.6, 12), color: '#FFF3D6', pos: [0, 1.8, 0] },
          { geo: B(0.9, 0.3, 0.9), color: c.rail, pos: [0, 3.7, 0] },
          { geo: B(0.7, 1.6, 0.06), color: c.wall, pos: [0, 2.4, -0.38] },
          { geo: CONE(0.12, 0.25, 4), color: c.rail, pos: [0, 1.5, -0.4], rot: [Math.PI, 0, 0] },
        ],
        [
          { geo: B(1.2, 0.9, 2.2), color: '#2E7D32', pos: [0, 0.45, 0] },
          { geo: S(0.25, 8, 6), color: '#E91E63', pos: [0.3, 0.95, 0.5] },
          { geo: S(0.2, 8, 6), color: '#FFEB3B', pos: [-0.3, 0.92, -0.6] },
        ],
      ];
    case 'manor':
      return [
        [
          { geo: C(0.1, 0.18, 2.4, 6), color: '#3E2723', pos: [0, 1.2, 0] },
          { geo: C(0.05, 0.08, 1.2, 5), color: '#3E2723', pos: [0.35, 2.2, 0], rot: [0, 0, -0.8] },
          { geo: C(0.04, 0.07, 1.0, 5), color: '#3E2723', pos: [-0.3, 2.0, 0], rot: [0, 0, 0.9] },
        ],
        [
          { geo: S(0.4, 10, 8), color: '#FF8F00', pos: [0, 0.35, 0], scale: [1, 0.8, 1] },
          { geo: C(0.05, 0.05, 0.2, 5), color: '#33691E', pos: [0, 0.75, 0] },
          { geo: C(0.05, 0.06, 0.6, 6), color: '#FFF8E1', pos: [0.8, 0.3, 0.3] },
          { geo: S(0.06, 6, 4), color: '#FFEB3B', pos: [0.8, 0.68, 0.3] },
        ],
      ];
  }
}
