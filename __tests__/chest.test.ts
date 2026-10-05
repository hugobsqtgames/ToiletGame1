/** 3D chest-opening stage: phase machine, callbacks, geometry sanity for every chest kind. */
import * as THREE from 'three';
import { ChestStage, type ChestKind, type ChestPhase } from '../src/render/ChestStage';

const cam = new THREE.PerspectiveCamera(60, 0.46, 0.1, 400);
cam.position.set(0, 2.3, 425.9);

function run(stage: ChestStage, seconds: number) {
  for (let i = 0; i < Math.round(seconds * 60); i++) stage.update(1 / 60, cam);
}

function finite(stage: ChestStage) {
  let bad = 0;
  stage.updateMatrixWorld(true);
  stage.traverse((o) => {
    for (const v of o.matrixWorld.elements) if (!Number.isFinite(v)) bad++;
    const im = o as THREE.InstancedMesh;
    if (im.isInstancedMesh) for (const v of im.instanceMatrix.array) if (!Number.isFinite(v)) bad++;
  });
  return bad;
}

describe.each(['basic', 'epic', 'keys'] as ChestKind[])('%s chest', (kind) => {
  it('drops, waits for a tap, charges with 3 knocks, bursts once and stays open', () => {
    const stage = new ChestStage();
    const phases: ChestPhase[] = [];
    let lands = 0, knocks = 0, bursts = 0;
    stage.onPhase = (p) => phases.push(p);
    stage.onLand = () => lands++;
    stage.onKnock = () => knocks++;
    stage.onBurst = () => bursts++;
    stage.show(kind);
    expect(stage.visible).toBe(true);
    expect(stage.tap()).toBe(false); // can't open while it is still falling
    run(stage, 1.2);
    expect(stage.phase).toBe('idle');
    run(stage, 3); // waits as long as needed
    expect(stage.phase).toBe('idle');
    expect(stage.tap()).toBe(true);
    expect(stage.tap()).toBe(false);
    run(stage, 2);
    expect(stage.phase).toBe('open');
    run(stage, 5);
    expect(phases).toEqual(['drop', 'idle', 'charge', 'open']);
    expect([lands, knocks, bursts]).toEqual([1, 3, 1]);
    expect(finite(stage)).toBe(0);
    stage.hide();
    expect(stage.visible).toBe(false);
    expect(stage.phase).toBe('hidden');
    stage.dispose();
  });

  it('can be replayed (open next chest) and survives huge / zero frame times', () => {
    const stage = new ChestStage();
    for (let k = 0; k < 3; k++) {
      stage.show(kind);
      stage.update(0, cam);
      stage.update(5, cam);
      run(stage, 1);
      stage.tap();
      run(stage, 2);
      expect(stage.phase).toBe('open');
    }
    expect(finite(stage)).toBe(0);
    stage.dispose();
  });
});

it('stays light: every chest model + effects under 25k vertices', () => {
  const stage = new ChestStage();
  for (const k of ['basic', 'epic', 'keys'] as ChestKind[]) stage.show(k);
  let verts = 0;
  stage.traverse((o) => {
    const m = o as THREE.Mesh;
    if (m.isMesh && m.visible !== false) verts += m.geometry.getAttribute('position').count;
  });
  expect(verts).toBeLessThan(25_000);
  stage.dispose();
});
