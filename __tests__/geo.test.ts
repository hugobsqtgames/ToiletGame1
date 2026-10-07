/** mergeParts (hand-rolled, no clone) must produce exactly what the three.js clone + applyMatrix4 path produced. */
import * as THREE from 'three';
import { mergeParts, Pill, type Part } from '../src/render/geo';
import { TextLabel, textMaterial, textWidth } from '../src/render/text3d';

function reference(parts: Part[]) {
  const pos: number[] = [], nor: number[] = [], col: number[] = [], idx: number[] = [];
  const c = new THREE.Color();
  for (const p of parts) {
    const g = p.geo.clone();
    if (!g.getAttribute('normal')) g.computeVertexNormals();
    const m = new THREE.Matrix4().compose(new THREE.Vector3(...(p.pos ?? [0, 0, 0])), new THREE.Quaternion().setFromEuler(new THREE.Euler(...(p.rot ?? [0, 0, 0]))), new THREE.Vector3(...(p.scale ?? [1, 1, 1])));
    g.applyMatrix4(m);
    const base = pos.length / 3;
    const gp = g.getAttribute('position'), gn = g.getAttribute('normal'), gc = g.getAttribute('color');
    if (g.index) for (let k = 0; k < g.index.count; k++) idx.push(g.index.getX(k) + base);
    else for (let k = 0; k < gp.count; k++) idx.push(base + k);
    if (p.color !== null) c.set(p.color);
    for (let i = 0; i < gp.count; i++) {
      pos.push(gp.getX(i), gp.getY(i), gp.getZ(i));
      nor.push(gn.getX(i), gn.getY(i), gn.getZ(i));
      if (p.color === null) col.push(gc.getX(i), gc.getY(i), gc.getZ(i));
      else col.push(c.r, c.g, c.b);
    }
  }
  return { pos, nor, col, idx };
}

const close = (a: ArrayLike<number>, b: number[]) => {
  expect(a.length).toBe(b.length);
  for (let i = 0; i < b.length; i++) expect(Math.abs(a[i] - b[i])).toBeLessThan(1e-5);
};

describe('mergeParts', () => {
  it('matches the reference for boxes, spheres, cylinders with rotation, scale and colors', () => {
    const vc = new THREE.BoxGeometry(1, 2, 3);
    const n = vc.getAttribute('position').count;
    vc.setAttribute('color', new THREE.BufferAttribute(new Float32Array(n * 3).map((_, i) => (i % 7) / 7), 3));
    const parts: Part[] = [
      { geo: new THREE.BoxGeometry(1, 1, 1), color: '#ff0000' },
      { geo: new THREE.SphereGeometry(0.7, 8, 6), color: '#00ff88', pos: [1, 2, -3], rot: [0.3, 1.1, -0.4], scale: [1, 2.5, 0.5] },
      { geo: new THREE.CylinderGeometry(0.2, 0.5, 1.4, 9), color: '#3355ff', pos: [-4, 0, 1], rot: [Math.PI / 2, 0, 0.2] },
      { geo: vc, color: null, pos: [0, -1, 0], scale: [-1, 1, 1] },
      { geo: new THREE.BoxGeometry(1, 1, 1).toNonIndexed(), color: '#ffffff', rot: [0, 0.7, 0] },
    ];
    const ref = reference(parts);
    const out = mergeParts(parts);
    close(out.getAttribute('position').array, ref.pos);
    close(out.getAttribute('normal').array, ref.nor);
    close(out.getAttribute('color').array, ref.col);
    expect(Array.from(out.index!.array)).toEqual(ref.idx);
  });
});

describe('labels', () => {
  it('a merged TextLabel holds the same triangles as the per-glyph one, in one mesh', () => {
    const mat = textMaterial('#fff');
    const a = new TextLabel(mat, 0.8, 6);
    const b = new TextLabel(mat, 0.8, 0, 'center', true);
    for (const txt of ['x3', '+125', '-7', 'x1.5', '', 'AB CD']) {
      a.setText(txt);
      b.setText(txt);
      expect(b.width).toBeCloseTo(textWidth(txt) * 0.8, 6);
      const meshes = b.children as THREE.Mesh[];
      expect(meshes.length).toBe(1);
      let glyphVerts = 0;
      for (const m of a.children as THREE.Mesh[]) if (m.visible) glyphVerts += m.geometry.getAttribute('position').count;
      expect(meshes[0].geometry.drawRange.count).toBe(glyphVerts);
      expect(meshes[0].visible).toBe(glyphVerts > 0);
      // Same bounds as the glyph meshes.
      if (glyphVerts) {
        const ba = new THREE.Box3();
        a.updateMatrixWorld(true);
        for (const m of a.children as THREE.Mesh[]) if (m.visible) ba.union(new THREE.Box3().setFromObject(m));
        const pa = meshes[0].geometry.getAttribute('position');
        const bb = new THREE.Box3();
        for (let i = 0; i < meshes[0].geometry.drawRange.count; i++) bb.expandByPoint(new THREE.Vector3(pa.getX(i), pa.getY(i), pa.getZ(i)));
        expect(bb.min.distanceTo(ba.min)).toBeLessThan(1e-4);
        expect(bb.max.distanceTo(ba.max)).toBeLessThan(1e-4);
      }
    }
  });

  it('Pill stretches to the requested width with 2 meshes', () => {
    const p = new Pill(new THREE.MeshBasicMaterial(), 0.6, new THREE.MeshBasicMaterial());
    expect(p.children.length).toBe(2);
    for (const w of [0.8, 1.7, 3.2]) {
      p.setWidth(w);
      const box = new THREE.Box3().setFromObject(p.children[1]);
      expect(box.max.x - box.min.x).toBeCloseTo(w, 5);
      expect(box.max.y - box.min.y).toBeCloseTo(0.6, 5);
      const border = new THREE.Box3().setFromObject(p.children[0]);
      expect(border.max.x - border.min.x).toBeCloseTo(w + 0.12, 5);
    }
  });
});
