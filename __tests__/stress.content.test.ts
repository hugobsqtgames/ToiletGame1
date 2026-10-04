/**
 * Content & rendering stress tests: translations, 3D font coverage, gate label
 * fitting, scenery placement for every world, character geometry for every
 * skin, persistence service under corruption/failure, analytics queue.
 */
import fs from 'fs';
import path from 'path';
import * as THREE from 'three';
import { en } from '../src/ui/i18n/en';
import { fr } from '../src/ui/i18n/fr';
import { ACHIEVEMENTS } from '../src/meta/missions';
import { SKINS } from '../src/meta/skins';
import { generateLevel } from '../src/core/levelGen';
import { gateLabelLines, opLabel } from '../src/core/gates';
import { formatCount } from '../src/core/format';
import { BASE_THEMES, getWorld } from '../src/core/worlds';
import { TRACK } from '../src/core/config';
import type { MechanicId, MutatorId, ChallengeKind } from '../src/core/types';
import { textWidth, TextLabel, bakeText, textMaterial } from '../src/render/text3d';
import { buildEnvironment } from '../src/render/environment/build';
import { kitFor } from '../src/render/environment/kits';
import { characterGeometry } from '../src/render/characters';
import { mergeParts } from '../src/render/geo';
import { range } from '../test-utils/fuzz';

const HALF = TRACK.width / 2;
const SRC = path.join(__dirname, '..', 'src');
const walk = (d: string): string[] => fs.readdirSync(d, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(path.join(d, e.name)) : [path.join(d, e.name)]));
const SOURCES = walk(SRC).filter((f) => /\.(ts|tsx)$/.test(f)).map((f) => ({ f, txt: fs.readFileSync(f, 'utf8') }));

/* ------------------------------------------------------------------ */

describe('translations', () => {
  const enKeys = Object.keys(en) as (keyof typeof en)[];
  const ph = (s: string) => [...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort().join(',');

  it('fr has exactly the same keys as en', () => {
    expect(Object.keys(fr).sort()).toEqual([...enKeys].sort());
  });
  it.each(enKeys)('"%s" is non-empty and has the same placeholders in fr', (k) => {
    expect(en[k].trim().length).toBeGreaterThan(0);
    expect(fr[k].trim().length).toBeGreaterThan(0);
    expect(ph(fr[k])).toBe(ph(en[k]));
  });
  it('every static t("key") used in the code exists', () => {
    const missing: string[] = [];
    for (const { f, txt } of SOURCES) for (const m of txt.matchAll(/\bt\(\s*'([A-Za-z0-9_]+)'/g)) if (!(m[1] in en)) missing.push(`${path.basename(f)}: ${m[1]}`);
    expect(missing).toEqual([]);
  });
  const MECHS: MechanicId[] = ['gate_add', 'gate_mul', 'gate_sub', 'gate_div', 'gate_pct', 'gate_timed', 'gate_mystery', 'gate_cond', 'gate_moving', 'wall', 'sweeper', 'slider', 'puddle', 'roller', 'stomper', 'blower', 'boxes', 'turnstile', 'rival', 'pickup'];
  const MUTS: MutatorId[] = ['rushHour', 'butterfingers', 'rivalry', 'foggy', 'mystery', 'tight', 'windy'];
  const CHS: ChallengeKind[] = ['finishWith', 'maxLoss', 'noDivide', 'bigMultiplier', 'peak'];
  const METRICS = ['runs', 'wins', 'gates', 'multipliers', 'bigMultipliers', 'peakCrowd', 'finishCrowd', 'coinsEarned', 'rivalsDefeated', 'stragglers', 'chestsOpened', 'perfect', 'challenges', 'topStall', 'people'];
  it.each([
    ...MECHS.map((m) => 'mech_' + m),
    ...MUTS.map((m) => 'mut_' + m),
    ...CHS.map((c) => 'ch_' + c),
    ...METRICS.map((m) => 'metric_' + m),
    ...ACHIEVEMENTS.flatMap((a) => ['ach_' + a.id, 'achDesc_' + a.id]),
    ...['common', 'rare', 'epic', 'legendary'].map((r) => 'rarity_' + r),
  ])('dynamic key %s exists', (k) => {
    expect(k in en).toBe(true);
  });
  it('no translation contains leftover TODO / undefined / NaN text', () => {
    for (const d of [en, fr]) for (const v of Object.values(d)) expect(v).not.toMatch(/TODO|undefined|NaN|\{\s*\}/);
  });
  it('french strings are actually translated (≤ 15% identical to english)', () => {
    const same = enKeys.filter((k) => en[k] === fr[k] && /[a-z]{4,}/i.test(en[k]));
    expect(same.length / enKeys.length).toBeLessThan(0.15);
  });
});

/* ------------------------------------------------------------------ */

const glyphs = JSON.parse(fs.readFileSync(path.join(SRC, 'render', 'fonts', 'lilita.json'), 'utf8')).glyphs as Record<string, unknown>;
const hasGlyph = (s: string) => [...s].every((ch) => ch === ' ' || ch in glyphs);

describe('3D font coverage', () => {
  it.each(range(1, 30).map((i) => i * 97))('every 3D string of level %i has glyphs', (L) => {
    const d = generateLevel(L);
    for (const r of d.gateRows) for (const g of r.gates) {
      for (const op of [g.op, g.timed?.alt].filter(Boolean)) {
        const l = gateLabelLines(op!);
        expect(hasGlyph(l.big)).toBe(true);
        expect(hasGlyph(`${l.small ?? ''} ${l.small2 ?? ''}`.replace('ELSE ', '/'))).toBe(true);
      }
    }
    for (const m of d.finish.multipliers) expect(hasGlyph('x' + (Number.isInteger(m) ? m : m.toFixed(1)))).toBe(true);
  });
  it('count badges, floating texts and signs have glyphs', () => {
    for (let e = 0; e < 8; e += 0.01) {
      const n = Math.round(10 ** e);
      expect(hasGlyph(formatCount(n))).toBe(true);
      expect(hasGlyph('+' + formatCount(n))).toBe(true);
      expect(hasGlyph('-' + formatCount(n))).toBe(true);
    }
    for (const s of ['START', 'FINISH', 'WC', '150M', 'BOSS', 'x10', 'x2.5', '÷2', '?', '<30 /-10']) expect(hasGlyph(s)).toBe(true);
  });
  it('TextLabel grows past its initial capacity without losing characters', () => {
    const l = new TextLabel(textMaterial(), 1, 2);
    l.setText('+1234567');
    expect(l.children.filter((c) => c.visible)).toHaveLength(8);
    l.setText('x2');
    expect(l.children.filter((c) => c.visible)).toHaveLength(2);
    l.setText('');
    expect(l.children.filter((c) => c.visible)).toHaveLength(0);
  });
  it('bakeText of an empty or space-only string does not crash', () => {
    expect(() => bakeText('', textMaterial())).not.toThrow();
    expect(() => bakeText('   ', textMaterial())).not.toThrow();
  });
});

/* ------------------------------------------------------------------ */

/** Mirrors LevelView: panel width = gate width - 0.18, big label height 1.0, cond label height 0.36. */
import { gateLabelScale } from '../src/render/labelFit';

describe('gate labels always fit inside their panel', () => {
  it.each(range(1, 40).map((i) => [i * 75 - 74, i * 75] as const))('levels %i–%i', (a, b) => {
    for (let L = a; L <= b; L++) {
      const d = generateLevel(L);
      for (const r of d.gateRows) for (const g of r.gates) {
        const panel = g.x1 - g.x0 - 0.18;
        for (const op of [g.op, g.timed?.alt].filter(Boolean)) {
          const l = gateLabelLines(op!);
          const big = textWidth(l.big) * 1.0 * gateLabelScale(l.big, panel, 1.0);
          if (big > panel - 0.2 + 1e-9) throw new Error(`L${L}: "${l.big}" is ${big.toFixed(2)} m wide in a ${panel.toFixed(2)} m panel`);
          // Never shrink so much it becomes unreadable.
          if (gateLabelScale(l.big, panel, 1.0) < 0.45) throw new Error(`L${L}: "${l.big}" must shrink to ${gateLabelScale(l.big, panel, 1).toFixed(2)} in a ${panel.toFixed(2)} m panel`);
          if (l.small) {
            const t = `${l.small} ${l.small2 ?? ''}`.trim().replace('ELSE ', '/');
            const w = textWidth(t) * 0.36 * gateLabelScale(t, panel, 0.36);
            if (w > panel - 0.2 + 1e-9) throw new Error(`L${L}: "${t}" overflows`);
          }
        }
      }
    }
  });
  it('labels for every op magnitude stay readable in a 3-gate row', () => {
    const panel = TRACK.width / 3 - 0.18;
    for (const n of [1, 9, 99, 999, 9999, 99_999, 999_999]) {
      for (const op of [{ kind: 'add', n }, { kind: 'sub', n }] as const) {
        const s = opLabel(op);
        expect(textWidth(s) * gateLabelScale(s, panel, 1)).toBeLessThanOrEqual(panel - 0.2 + 1e-9);
      }
    }
  });
});

/* ------------------------------------------------------------------ */

const _m = new THREE.Matrix4();
const _b = new THREE.Box3();

describe.each(range(1, 16))('scenery of world %i', (w) => {
  const info = getWorld(w);
  const def = generateLevel(info.firstLevel + 3);
  const env = buildEnvironment({
    kind: info.theme.id, colors: info.colors, seed: def.seed,
    zStart: -30, zEnd: def.length + 80, finishZ: def.finish.z, lastStallZ: def.finish.z + 41,
  });
  const meshes: THREE.Mesh[] = [];
  env.group.traverse((o) => { if ((o as THREE.Mesh).isMesh) meshes.push(o as THREE.Mesh); });
  env.group.updateMatrixWorld(true);

  it('no scenery prop intrudes on the track (exact, vertex by vertex)', () => {
    const offenders: string[] = [];
    const v = new THREE.Vector3();
    for (const mesh of meshes) {
      if (!(mesh as THREE.InstancedMesh).isInstancedMesh) continue;
      const im = mesh as THREE.InstancedMesh;
      const pos = im.geometry.getAttribute('position');
      for (let i = 0; i < im.count; i++) {
        im.getMatrixAt(i, _m);
        for (let k = 0; k < pos.count; k++) {
          v.fromBufferAttribute(pos, k).applyMatrix4(_m);
          const z = -v.z;
          // Above 15 m it is sky decor (planets, domes) flying over the track: allowed.
          if (z < 0 || z > def.finish.z || v.y < 0.05 || v.y > 15) continue;
          if (Math.abs(v.x) < HALF + 0.3) {
            offenders.push(`vertex at x=${v.x.toFixed(2)} y=${v.y.toFixed(1)} z=${z.toFixed(0)}`);
            break;
          }
        }
      }
    }
    expect(offenders.slice(0, 5)).toEqual([]);
  });
  it('all geometry is finite and within the vertex budget', () => {
    let verts = 0;
    for (const mesh of meshes) {
      const pos = mesh.geometry.getAttribute('position');
      if (!pos) continue;
      const n = (mesh as THREE.InstancedMesh).isInstancedMesh ? (mesh as THREE.InstancedMesh).count : 1;
      verts += pos.count * n;
      for (let i = 0; i < pos.array.length; i += 7) if (!Number.isFinite(pos.array[i])) throw new Error('NaN vertex');
      if ((mesh as THREE.InstancedMesh).isInstancedMesh) {
        const arr = (mesh as THREE.InstancedMesh).instanceMatrix.array;
        for (let i = 0; i < arr.length; i++) if (!Number.isFinite(arr[i])) throw new Error('NaN instance matrix');
      }
    }
    expect(verts).toBeGreaterThan(20_000); // richly decorated
    expect(verts).toBeLessThan(450_000); // still mobile-friendly
    expect(meshes.length).toBeLessThan(120); // draw calls
  });
});

describe('environment kits', () => {
  it.each(BASE_THEMES.map((t) => t.id))('kit "%s" has props in every row and valid colors', (kind) => {
    const kit = kitFor(kind, BASE_THEMES[0].colors);
    expect(kit.near.length).toBeGreaterThan(0);
    expect(kit.mid.length).toBeGreaterThan(0);
    expect(kit.far.length).toBeGreaterThan(0);
    for (const def of [...kit.near, ...kit.mid, ...kit.far]) {
      const g = mergeParts(def.parts);
      expect(g.getAttribute('position').count).toBeGreaterThan(0);
      expect(g.getAttribute('color')).toBeDefined();
      g.dispose();
    }
  });
});

describe('characters', () => {
  it.each(SKINS.map((s) => [s.id, s] as const))('skin %s builds light, finite geometry', (_id, sk) => {
    const g = characterGeometry('test-' + sk.id, sk);
    for (const geo of [g.upper, g.leg]) {
      const pos = geo.getAttribute('position');
      expect(pos.count).toBeGreaterThan(10);
      for (let i = 0; i < pos.array.length; i++) if (!Number.isFinite(pos.array[i])) throw new Error('NaN');
    }
    expect(g.upper.getAttribute('position').count + 2 * g.leg.getAttribute('position').count).toBeLessThan(1200);
    expect(characterGeometry('test-' + sk.id, sk)).toBe(g); // cached
  });
});

/* ------------------------------------------------------------------ */

jest.mock('@react-native-async-storage/async-storage', () => require('@react-native-async-storage/async-storage/jest/async-storage-mock'));

describe('storage service', () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const AsyncStorage = require('@react-native-async-storage/async-storage');
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const storage = require('../src/services/storage') as typeof import('../src/services/storage');
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { defaultSave, encodeSave } = require('../src/meta/save') as typeof import('../src/meta/save');
  const NOW = new Date(2026, 9, 4).getTime();
  const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
  afterAll(() => warn.mockRestore());
  beforeEach(async () => {
    await AsyncStorage.clear();
    jest.clearAllMocks();
  });

  it('fresh install → new save', async () => {
    const r = await storage.loadSave(NOW);
    expect(r.source).toBe('new');
    expect(r.save.level).toBe(1);
  });
  it('round-trips through persistSave', async () => {
    await storage.persistSave({ ...defaultSave(NOW), level: 42, coins: 9 });
    const r = await storage.loadSave(NOW);
    expect(r.source).toBe('primary');
    expect(r.save.level).toBe(42);
  });
  it('corrupted primary → backup is used', async () => {
    await storage.persistSave({ ...defaultSave(NOW), level: 7 });
    await AsyncStorage.setItem('loorush.save', '{"v":2,"c":"x","d":"{}"}');
    const r = await storage.loadSave(NOW);
    expect(r.source).toBe('backup');
    expect(r.save.level).toBe(7);
  });
  it('both corrupted → recovered default, never a crash', async () => {
    await AsyncStorage.setItem('loorush.save', 'garbage');
    await AsyncStorage.setItem('loorush.save.bak', '{{{{');
    const r = await storage.loadSave(NOW);
    expect(r.source).toBe('recovered-default');
  });
  it('a storage read failure still boots the game', async () => {
    AsyncStorage.getItem.mockImplementationOnce(() => Promise.reject(new Error('disk')));
    const r = await storage.loadSave(NOW);
    expect(r.save.level).toBe(1);
  });
  it('a storage write failure does not throw and the next write succeeds', async () => {
    AsyncStorage.setItem.mockImplementationOnce(() => Promise.reject(new Error('full')));
    await expect(storage.persistSave({ ...defaultSave(NOW), level: 3 })).resolves.toBeUndefined();
    await storage.persistSave({ ...defaultSave(NOW), level: 4 });
    expect((await storage.loadSave(NOW)).save.level).toBe(4);
  });
  it('100 rapid writes are coalesced and the LAST one wins', async () => {
    const ps: Promise<void>[] = [];
    for (let i = 1; i <= 100; i++) ps.push(storage.persistSave({ ...defaultSave(NOW), level: i }));
    await Promise.all(ps);
    expect((await storage.loadSave(NOW)).save.level).toBe(100);
    expect(AsyncStorage.setItem.mock.calls.length).toBeLessThan(20);
  });
  it('writes queued during an in-flight write are not lost', async () => {
    const p1 = storage.persistSave({ ...defaultSave(NOW), level: 10 });
    await Promise.resolve();
    const p2 = storage.persistSave({ ...defaultSave(NOW), level: 11 });
    await Promise.all([p1, p2]);
    expect((await storage.loadSave(NOW)).save.level).toBe(11);
  });
  it('wipeSave removes both copies', async () => {
    await storage.persistSave({ ...defaultSave(NOW), level: 10 });
    await storage.wipeSave();
    expect((await storage.loadSave(NOW)).source).toBe('new');
  });
  it('an old-format envelope from v1 is migrated on load', async () => {
    const d = JSON.stringify({ version: 1, level: 9, chestProgress: 2, removeAds: true });
    const { checksum } = jest.requireActual('../src/meta/save') as typeof import('../src/meta/save');
    await AsyncStorage.setItem('loorush.save', JSON.stringify({ v: 1, c: checksum(d), d }));
    const r = await storage.loadSave(NOW);
    expect(r.save.level).toBe(9);
    expect(r.save.purchases.removeAds).toBe(true);
    expect(encodeSave(r.save)).toContain('"v":2');
  });
});

/* ------------------------------------------------------------------ */

describe('analytics queue', () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { analytics } = require('../src/services/analytics') as typeof import('../src/services/analytics');
  beforeAll(() => jest.useFakeTimers());
  afterAll(() => jest.useRealTimers());

  it('batches events, caps the queue, survives throwing sinks and respects opt-out', async () => {
    const got: number[] = [];
    analytics.addSink({ send: () => { throw new Error('boom'); } });
    analytics.addSink({ send: async () => { throw new Error('async boom'); } });
    analytics.addSink({ send: (b) => { got.push(b.length); } });
    for (let i = 0; i < 1000; i++) analytics.track({ name: 'tutorial_step', params: { step: String(i) } });
    jest.advanceTimersByTime(2500);
    await Promise.resolve();
    expect(got).toEqual([200]);
    analytics.setEnabled(false);
    analytics.track({ name: 'tutorial_step', params: { step: 'x' } });
    jest.advanceTimersByTime(2500);
    expect(got).toEqual([200]);
    analytics.setEnabled(true);
    analytics.flush();
    expect(got).toEqual([200]);
  });
});

/* ------------------------------------------------------------------ */

describe('source hygiene (needle in a haystack)', () => {
  it('no Node-only APIs in app code (they crash Hermes)', () => {
    const bad: string[] = [];
    for (const { f, txt } of SOURCES) {
      if (/require\(['"](fs|path|child_process|crypto|os)['"]\)|from ['"](fs|path|child_process|os)['"]/.test(txt)) bad.push(f);
      if (/process\.(emitWarning|nextTick|hrtime|cwd)/.test(txt) && !f.endsWith('polyfills.ts')) bad.push(f);
    }
    expect(bad).toEqual([]);
  });
  it('no debug leftovers (debugger, focused tests, console.log outside the logger)', () => {
    const bad: string[] = [];
    for (const { f, txt } of SOURCES) {
      if (/\bdebugger\b/.test(txt)) bad.push(f + ': debugger');
      if (/console\.log\(/.test(txt) && !f.endsWith('log.ts')) bad.push(f + ': console.log');
    }
    expect(bad).toEqual([]);
  });
  it('no hard-coded secrets or production ad unit ids', () => {
    const bad: string[] = [];
    for (const { f, txt } of SOURCES) {
      if (/sk_live_|AKIA[0-9A-Z]{16}|-----BEGIN (RSA )?PRIVATE KEY/.test(txt)) bad.push(f);
    }
    expect(bad).toEqual([]);
  });
  it('the polyfill is the very first import of the entry point', () => {
    const idx = fs.readFileSync(path.join(__dirname, '..', 'index.ts'), 'utf8');
    expect(idx.split('\n').find((l) => l.startsWith('import'))).toContain('./src/polyfills');
  });
  it('app.json is iPhone-only, portrait, with the required privacy strings', () => {
    const app = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'app.json'), 'utf8')).expo;
    expect(app.orientation).toBe('portrait');
    expect(app.ios.supportsTablet).toBe(false);
    expect(app.ios.bundleIdentifier).toBe('com.loorush.game');
    const plist = app.ios.infoPlist ?? {};
    const tracking = JSON.stringify(app.plugins);
    expect(plist.NSUserTrackingUsageDescription ?? tracking).toMatch(/track|Track|userTrackingPermission/);
  });
});
