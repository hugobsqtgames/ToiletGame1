import * as THREE from 'three';
import type { AccessoryId } from '../meta/skins';
import { mergeParts, type Part } from './geo';

/**
 * Character model ("Loonies"): a bean body, a big head with googly eyes, arms
 * waving in panic, plus a skin accessory. Built from primitives and merged
 * into ONE vertex-colored geometry per skin (legs are separate so they can
 * swing). Faces -Z (the running direction).
 */
export interface Look {
  body: string;
  legs: string;
  skin: string;
  accessory: AccessoryId;
  accColor: string;
}

export interface CharacterGeometry {
  upper: THREE.BufferGeometry;
  leg: THREE.BufferGeometry;
}

const cache = new Map<string, CharacterGeometry>();
export const HIP_Y = 0.17;
export const HIP_X = 0.055;

const S = (r: number, w = 10, h = 8) => new THREE.SphereGeometry(r, w, h);
const C = (rt: number, rb: number, h: number, seg = 10) => new THREE.CylinderGeometry(rt, rb, h, seg);
const CAP = (r: number, l: number) => new THREE.CapsuleGeometry(r, l, 3, 8);
const B = (x: number, y: number, z: number) => new THREE.BoxGeometry(x, y, z);
const T = (r: number, t: number) => new THREE.TorusGeometry(r, t, 6, 14);

function accessoryParts(a: AccessoryId, c: string): Part[] {
  const headY = 0.5;
  switch (a) {
    case 'none':
      return [];
    case 'cap':
      return [
        { geo: S(0.125, 10, 6), color: c, pos: [0, headY + 0.03, 0], scale: [1, 0.75, 1] },
        { geo: B(0.15, 0.02, 0.12), color: c, pos: [0, headY + 0.05, -0.13] },
      ];
    case 'tophat':
      return [
        { geo: C(0.17, 0.17, 0.02, 14), color: c, pos: [0, headY + 0.1, 0] },
        { geo: C(0.1, 0.1, 0.2, 12), color: c, pos: [0, headY + 0.2, 0] },
        { geo: C(0.103, 0.103, 0.04, 12), color: '#C62828', pos: [0, headY + 0.13, 0] },
      ];
    case 'crown': {
      const parts: Part[] = [{ geo: C(0.1, 0.1, 0.06, 12), color: c, pos: [0, headY + 0.13, 0] }];
      for (let i = 0; i < 5; i++) {
        const ang = (i / 5) * Math.PI * 2;
        parts.push({ geo: new THREE.ConeGeometry(0.03, 0.07, 5), color: c, pos: [Math.cos(ang) * 0.085, headY + 0.19, Math.sin(ang) * 0.085] });
      }
      parts.push({ geo: S(0.022, 6, 4), color: '#E53935', pos: [0, headY + 0.13, -0.1] });
      return parts;
    }
    case 'helmet':
      return [
        { geo: S(0.14, 12, 8), color: c, pos: [0, headY + 0.02, 0.02], scale: [1, 0.95, 1] },
        { geo: T(0.1, 0.018), color: '#FFFFFF', pos: [0, headY, -0.1], rot: [0, 0, 0], scale: [1, 0.75, 1] },
      ];
    case 'antenna':
      return [
        { geo: C(0.01, 0.01, 0.14, 5), color: '#555555', pos: [0, headY + 0.17, 0] },
        { geo: S(0.03, 8, 6), color: c, pos: [0, headY + 0.25, 0] },
      ];
    case 'chefhat':
      return [
        { geo: C(0.1, 0.09, 0.1, 12), color: c, pos: [0, headY + 0.14, 0] },
        { geo: S(0.12, 10, 6), color: c, pos: [0, headY + 0.22, 0], scale: [1, 0.7, 1] },
      ];
    case 'beanie':
      return [
        { geo: S(0.128, 10, 6), color: c, pos: [0, headY + 0.03, 0], scale: [1, 0.85, 1] },
        { geo: S(0.04, 6, 4), color: '#FFFFFF', pos: [0, headY + 0.15, 0] },
      ];
    case 'headband':
      return [
        { geo: T(0.12, 0.018), color: c, pos: [0, headY + 0.04, 0], rot: [Math.PI / 2, 0, 0] },
        { geo: B(0.02, 0.09, 0.02), color: c, pos: [0.03, headY + 0.0, 0.13], rot: [0.5, 0, 0.3] },
      ];
    case 'duckbill':
      return [{ geo: S(0.07, 8, 6), color: c, pos: [0, headY - 0.03, -0.12], scale: [1.2, 0.35, 1] }];
    case 'mohawk':
      return [{ geo: B(0.03, 0.08, 0.2), color: c, pos: [0, headY + 0.13, 0.01] }];
    case 'beret':
      return [{ geo: C(0.12, 0.12, 0.04, 12), color: c, pos: [0.02, headY + 0.11, 0], rot: [0, 0, -0.25] }];
    case 'snorkel':
      return [
        { geo: T(0.07, 0.02), color: c, pos: [0, headY + 0.02, -0.11] },
        { geo: C(0.015, 0.015, 0.22, 6), color: '#FF7043', pos: [0.12, headY + 0.1, -0.02] },
      ];
    case 'sunhat':
      return [
        { geo: C(0.22, 0.22, 0.015, 16), color: c, pos: [0, headY + 0.09, 0] },
        { geo: S(0.11, 10, 6), color: c, pos: [0, headY + 0.08, 0], scale: [1, 0.7, 1] },
        { geo: C(0.112, 0.112, 0.03, 12), color: '#E53935', pos: [0, headY + 0.1, 0] },
      ];
    case 'bun':
      return [
        { geo: S(0.126, 10, 6), color: c, pos: [0, headY + 0.03, 0.02], scale: [1, 0.8, 1] },
        { geo: S(0.06, 8, 6), color: c, pos: [0, headY + 0.13, 0.06] },
      ];
    case 'halo':
      return [{ geo: T(0.09, 0.015), color: c, pos: [0, headY + 0.2, 0], rot: [Math.PI / 2, 0, 0] }];
  }
}

export function characterGeometry(key: string, look: Look): CharacterGeometry {
  const hit = cache.get(key);
  if (hit) return hit;
  const headY = 0.5;
  const parts: Part[] = [
    // Body (bean)
    { geo: CAP(0.115, 0.1), color: look.body, pos: [0, 0.29, 0] },
    // Belt / shorts top
    { geo: C(0.118, 0.118, 0.04, 12), color: look.legs, pos: [0, 0.2, 0] },
    // Head
    { geo: S(0.125, 12, 10), color: look.skin, pos: [0, headY, 0] },
    // Googly eyes (whites + pupils looking in different directions = goofy)
    { geo: S(0.045, 8, 6), color: '#FFFFFF', pos: [-0.05, headY + 0.03, -0.095] },
    { geo: S(0.045, 8, 6), color: '#FFFFFF', pos: [0.05, headY + 0.03, -0.095] },
    { geo: S(0.022, 6, 4), color: '#151515', pos: [-0.055, headY + 0.045, -0.135] },
    { geo: S(0.022, 6, 4), color: '#151515', pos: [0.058, headY + 0.015, -0.135] },
    // Worried "O" mouth
    { geo: S(0.026, 6, 4), color: '#5A1E1E', pos: [0, headY - 0.06, -0.112], scale: [1, 1.2, 0.5] },
    // Arms up in panic
    { geo: CAP(0.03, 0.12), color: look.body, pos: [-0.15, 0.42, 0], rot: [0, 0, 0.6] },
    { geo: CAP(0.03, 0.12), color: look.body, pos: [0.15, 0.42, 0], rot: [0, 0, -0.6] },
    { geo: S(0.038, 6, 4), color: look.skin, pos: [-0.205, 0.5, 0] },
    { geo: S(0.038, 6, 4), color: look.skin, pos: [0.205, 0.5, 0] },
    ...accessoryParts(look.accessory, look.accColor),
  ];
  const upper = mergeParts(parts);
  const leg = mergeParts([
    { geo: CAP(0.045, 0.08), color: look.legs, pos: [0, -0.07, 0] },
    { geo: B(0.07, 0.04, 0.1), color: '#2A2A2A', pos: [0, -0.15, -0.02] },
  ]);
  upper.userData.shared = true;
  leg.userData.shared = true;
  const g = { upper, leg };
  cache.set(key, g);
  return g;
}

/** Straggler NPC look (neutral grey, joins the crowd when touched). */
export const STRAGGLER_LOOK: Look = { body: '#B8BEC8', legs: '#7D8592', skin: '#F1CFAE', accessory: 'none', accColor: '#000' };
