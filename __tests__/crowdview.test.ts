/** CrowdView writes instance matrices by hand (perf): they must equal the three.js reference math. */
import * as THREE from 'three';
import { CrowdView, type CrowdMode } from '../src/render/CrowdView';
import { HIP_X, HIP_Y } from '../src/render/characters';
import { spacingFor, UNIT_X, UNIT_Z } from '../src/core/formation';

const LOOK = { body: '#FFD23F', legs: '#2B59C3', skin: '#FFD7B5', accessory: 'cap' as const, accColor: '#2B9BFF' };

function reference(v: CrowdView, i: number, t: number) {
  const a = v as unknown as { px: Float32Array; pz: Float32Array; sc: Float32Array; phase: Float32Array; jitter: Float32Array; facing: number; mode: CrowdMode };
  const running = a.mode === 'run';
  const legAmp = running ? 0.75 : a.mode === 'fight' ? 0.5 : a.mode === 'cheer' ? 0.25 : 0.12;
  const freq = running ? 13 : a.mode === 'fight' ? 16 : a.mode === 'cheer' ? 9 : 3;
  const ph = t * freq * a.jitter[i] + a.phase[i];
  const sw = Math.sin(ph);
  let bob = Math.abs(Math.cos(ph)) * (running ? 0.05 : 0.02);
  let lean = running ? -0.18 : 0;
  let yaw = a.facing + (running ? sw * 0.08 : 0);
  if (a.mode === 'cheer') {
    bob = Math.max(0, Math.sin(ph * 0.9)) * 0.22;
    yaw = a.facing + Math.sin(t * 2 + a.phase[i]) * 0.4;
    lean = 0;
  } else if (a.mode === 'fight') {
    lean = -0.3;
    bob = Math.abs(sw) * 0.06;
  }
  const s = a.sc[i] * (0.94 + 0.12 * (a.jitter[i] - 0.9) * 5);
  const m = new THREE.Matrix4().compose(
    new THREE.Vector3(a.px[i], bob, -a.pz[i]),
    new THREE.Quaternion().setFromEuler(new THREE.Euler(lean, yaw, sw * (running ? 0.06 : 0.02))),
    new THREE.Vector3(s, s * (1 + 0.04 * Math.cos(ph * 2)), s),
  );
  const leg = (side: number) => new THREE.Matrix4().multiplyMatrices(m, new THREE.Matrix4().makeTranslation(side * HIP_X, HIP_Y, 0).multiply(new THREE.Matrix4().makeRotationX(-side * sw * legAmp)));
  const ss = 0.16 * s * (1 - bob * 1.5);
  const shadow = new THREE.Matrix4().compose(new THREE.Vector3(a.px[i], 0.012, -a.pz[i]), new THREE.Quaternion(), new THREE.Vector3(ss, 1, ss));
  return { upper: m, legL: leg(-1), legR: leg(1), shadow };
}

describe('CrowdView instance matrices', () => {
  for (const mode of ['run', 'fight', 'cheer', 'idle'] as CrowdMode[]) {
    it(`match the reference transform in ${mode} mode`, () => {
      const v = new CrowdView(LOOK, 'test-' + mode);
      v.snap(60);
      v.mode = mode;
      v.setFacing(mode === 'cheer' ? Math.PI : 0.3, true);
      const t = 3.7;
      v.update(60, null, 1 / 60, t);
      const meshes = v.children as THREE.InstancedMesh[];
      const [upper, legs, shadow] = meshes;
      expect(upper.count).toBe(60);
      expect(legs.count).toBe(120);
      const got = new THREE.Matrix4();
      for (const i of [0, 7, 33, 59]) {
        const ref = reference(v, i, t);
        for (const [mesh, exp, j] of [[upper, ref.upper, i], [legs, ref.legL, 2 * i], [legs, ref.legR, 2 * i + 1], [shadow, ref.shadow, i]] as const) {
          mesh.getMatrixAt(j, got);
          for (let k = 0; k < 16; k++) expect(got.elements[k]).toBeCloseTo(exp.elements[k], 5);
        }
      }
      // Members sit on their formation slots.
      const sp = spacingFor(60);
      upper.getMatrixAt(5, got);
      expect(got.elements[12]).toBeCloseTo(UNIT_X[5] * sp, 5);
      expect(got.elements[14]).toBeCloseTo(-UNIT_Z[5] * sp, 5);
      v.dispose();
    });
  }
});
