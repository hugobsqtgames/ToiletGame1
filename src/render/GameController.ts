import * as THREE from 'three';
import { SIM, TRACK } from '../core/config';
import { formatCount } from '../core/format';
import { gateTone, opLabel } from '../core/gates';
import { stallZ, Simulation, type SimEvent } from '../core/simulation';
import { bestTarget } from '../core/bot';
import type { LevelDef } from '../core/types';
import { getWorld } from '../core/worlds';
import type { SkinDef } from '../meta/skins';
import { audio } from '../services/audio';
import { haptics } from '../services/haptics';
import { hud } from '../state/hud';
import { CameraRig, type CamMode } from './CameraRig';
import { ChestStage, type ChestKind, type ChestPhase } from './ChestStage';
import { characterGeometry } from './characters';
import { CrowdView } from './CrowdView';
import { Pill } from './geo';
import { Fx } from './Fx';
import { GATE_COLORS, LevelView, STALL_COLORS } from './LevelView';
import { TextLabel, textMaterial } from './text3d';

/**
 * Bridges the deterministic Simulation with the three.js scene, audio and
 * haptics. Owned outside React (module singleton) so screens can drive it
 * imperatively without re-rendering the canvas.
 */
export type EndKind = 'won' | 'lost';

export interface ControllerCallbacks {
  onEnd(kind: EndKind, sim: Simulation, info: { multiplier: number; stallIndex: number; finishCount: number; perfect: boolean }): void;
  onEvent?(e: SimEvent): void;
}

export type QualityTier = 'low' | 'medium' | 'high';

const STEER_RANGE = TRACK.width * 1.25; // meters for a full-screen-width drag

export class GameController {
  private scene: THREE.Scene | null = null;
  private camera: THREE.PerspectiveCamera | null = null;
  private rig: CameraRig | null = null;
  private root = new THREE.Group();
  private level: LevelView | null = null;
  sim: Simulation | null = null;
  private crowd: CrowdView | null = null;
  private fx = new Fx();
  private countGroup = new THREE.Group();
  private countLabel: TextLabel;
  private countPill: Pill;
  private countMat = new THREE.MeshBasicMaterial({ color: '#2B7BFF' });
  private hemi = new THREE.HemisphereLight('#ffffff', '#8899aa', 1.6);
  private sun = new THREE.DirectionalLight('#ffffff', 1.5);
  private acc = 0;
  private paused = false;
  private endTimer = -1;
  private endInfo: { kind: EndKind; multiplier: number; stallIndex: number; finishCount: number; perfect: boolean } | null = null;
  private hudTimer = 0;
  private battleSfx = 0;
  private skin: SkinDef | null = null;
  private callbacks: ControllerCallbacks | null = null;
  private pendingLevel: { def: LevelDef; bonus: number } | null = null;
  private camMode: CamMode = 'menu';
  private showcaseTime = 0;
  private lastCount = -1;
  private runCoins = 0;
  private runKeys = 0;
  private tutorial = false;
  private quality: QualityTier = 'high';
  /** Debug/QA only: lets the planner bot steer (screenshots, soak tests). */
  autoplay = false;
  /** Debug/QA only: stops the simulation while rendering continues (screenshots). */
  debugFreeze = false;
  private autoplayTimer = 0;
  /** 3D chest-opening stage (always in the scene, hidden when unused). */
  readonly chest = new ChestStage();
  private chestPrevMode: CamMode = 'menu';
  private chestListener: ((p: ChestPhase) => void) | null = null;

  constructor() {
    const labelMat = textMaterial('#FFFFFF', { depthTest: false });
    this.countLabel = new TextLabel(labelMat, 0.42, 7);
    this.countLabel.renderOrder = 11;
    this.countPill = new Pill(this.countMat, 0.7, new THREE.MeshBasicMaterial({ color: '#FFFFFF', depthTest: false }));
    this.countMat.depthTest = false;
    this.countPill.renderOrder = 10;
    this.countGroup.add(this.countPill, this.countLabel);
    this.sun.position.set(-6, 14, 8);
    this.root.add(this.hemi, this.sun, this.sun.target, this.fx, this.countGroup, this.chest);
    this.chest.onPhase = (p) => this.chestListener?.(p);
    this.chest.onLand = () => {
      audio.play('stall', 0.7);
      haptics.medium();
      this.rig?.shake(0.35);
    };
    this.chest.onKnock = (i) => {
      audio.play('tap', 0.9 + i * 0.25);
      audio.play('pop', 0.8 + i * 0.2);
      haptics.light();
      this.rig?.shake(0.12 + i * 0.1);
    };
    this.chest.onBurst = () => {
      audio.play('chest_open');
      audio.play('unlock');
      haptics.success();
      this.rig?.shake(0.6);
      this.rig?.punch(8);
    };
  }

  setCallbacks(cb: ControllerCallbacks) {
    this.callbacks = cb;
  }

  /* ---------------- scene attach (from the r3f component) ---------------- */

  attach(scene: THREE.Scene, camera: THREE.PerspectiveCamera, aspect: number) {
    this.scene = scene;
    this.camera = camera;
    camera.near = 0.1;
    camera.far = 420;
    this.rig = new CameraRig(camera);
    this.rig.setAspect(aspect);
    this.rig.mode = this.camMode;
    scene.add(this.root);
    if (this.pendingLevel) {
      const p = this.pendingLevel;
      this.pendingLevel = null;
      this.loadLevel(p.def, p.bonus);
    }
  }

  detach() {
    if (this.scene) this.scene.remove(this.root);
    this.scene = null;
    this.camera = null;
    this.rig = null;
  }

  setAspect(aspect: number) {
    this.rig?.setAspect(aspect);
  }

  setQuality(q: QualityTier) {
    this.quality = q;
    this.fx.setBudget(q === 'low' ? 0.4 : q === 'medium' ? 0.7 : 1);
  }

  /* ---------------- level lifecycle ---------------- */

  setSkin(skin: SkinDef) {
    this.skin = skin;
    const look = { body: skin.body, legs: skin.legs, skin: skin.skin, accessory: skin.accessory, accColor: skin.accColor };
    if (this.crowd) this.crowd.setLook(look, 'skin-' + skin.id);
    this.fx.setFlyerGeometry(characterGeometry('skin-' + skin.id, look).upper);
    this.countMat.color.set(skin.glow ? '#FFB300' : '#2B7BFF');
  }

  loadLevel(def: LevelDef, startBonus: number) {
    if (!this.scene || !this.skin) {
      this.pendingLevel = { def, bonus: startBonus };
      return;
    }
    if (this.level) {
      this.root.remove(this.level);
      this.level.dispose();
    }
    this.level = new LevelView(def);
    this.root.add(this.level);
    const colors = this.level.colors;
    const foggy = def.mutators.includes('foggy');
    this.scene.fog = new THREE.Fog(colors.fog, foggy ? 22 : 48, foggy ? 75 : 150);
    this.scene.background = new THREE.Color(colors.skyBottom);
    this.hemi.color.set('#ffffff');
    this.hemi.groundColor.set(colors.tileB);
    const dark = getWorld(def.world).theme.id === 'manor' || getWorld(def.world).theme.id === 'space';
    this.hemi.intensity = dark ? 1.25 : 1.6;

    this.sim = new Simulation(def, startBonus);
    this.tutorial = def.tutorial;
    if (!this.crowd) {
      const s = this.skin;
      this.crowd = new CrowdView({ body: s.body, legs: s.legs, skin: s.skin, accessory: s.accessory, accColor: s.accColor }, 'skin-' + s.id);
      this.root.add(this.crowd);
    }
    this.crowd.snap(this.sim.s.layoutM);
    this.crowd.mode = 'idle';
    this.crowd.setFacing(0, true);
    this.crowd.position.set(0, 0, 0);
    this.fx.reset();
    this.acc = 0;
    this.endTimer = -1;
    this.endInfo = null;
    this.paused = false;
    this.lastCount = -1;
    this.runCoins = 0;
    this.runKeys = 0;
    this.rig?.snap(0, 0, this.sim.radius);
    hud.set({ count: this.sim.s.count, progress: 0, coins: 0, keys: 0, phase: 'ready', rivalCount: 0, stall: 0, pulseKind: 'none', tutorialStep: def.tutorial ? 'drag' : 'none' });
  }

  setCameraMode(mode: CamMode) {
    if ((mode === 'chest') !== (this.camMode === 'chest')) this.rig?.cut();
    this.camMode = mode;
    if (this.rig) this.rig.mode = mode;
        if (mode === 'showcase') this.showcaseTime = 0;
  }

  startRun() {
    if (!this.sim || this.sim.s.phase !== 'ready') return;
    this.setCameraMode('play');
    this.sim.start();
    this.crowd!.setFacing(0);
    this.crowd!.mode = 'run';
    audio.play('whoosh');
    hud.set({ phase: 'running', tutorialStep: this.tutorial ? 'gate' : 'none' });
  }

  /** Horizontal drag in screen pixels. */
  drag(dxPx: number, screenWidth: number) {
    if (!this.sim || this.paused) return;
    if (this.sim.s.phase === 'ready') this.startRun();
    if (this.sim.s.phase !== 'running') return;
    this.sim.moveTarget((dxPx / Math.max(1, screenWidth)) * STEER_RANGE);
  }

  setPaused(p: boolean) {
    this.paused = p;
  }

  get isPaused() {
    return this.paused;
  }

  revive(count: number) {
    if (!this.sim?.canRevive()) return;
    this.sim.revive(count);
    this.endTimer = -1;
    this.endInfo = null;
    if (this.crowd) this.crowd.mode = 'run';
    this.setCameraMode(this.sim.s.phase === 'finish' ? 'finish' : 'play');
    this.fx.burst(this.sim.s.x, 0.5, -this.sim.s.z, 40, ['#FFFFFF', '#FFE14D', '#7FD3FF'], { speed: 6, up: 7 });
    audio.play('unlock');
    haptics.success();
    hud.set({ phase: this.sim.s.phase, count: this.sim.s.count });
  }

  /* ---------------- chest opening ---------------- */

  /** Shows the 3D chest stage (the level is hidden behind it). */
  showChest(kind: ChestKind, onPhase: (p: ChestPhase) => void) {
    this.chestListener = onPhase;
    if (this.camMode !== 'chest') this.chestPrevMode = this.camMode;
    this.chest.show(kind);
    if (this.level) this.level.visible = false;
    if (this.crowd) this.crowd.visible = false;
    if (this.camera && this.rig) {
      const pos = new THREE.Vector3(), look = new THREE.Vector3();
      this.chest.cameraPose(pos, look, this.rig.viewAspect);
      this.rig.setFixedPose(pos, look);
    }
    this.setCameraMode('chest');
    audio.play('whoosh');
  }

  /** Player tap on the chest. */
  tapChest() {
    return this.chest.tap();
  }

  hideChest() {
    this.chestListener = null;
    this.chest.hide();
    if (this.level) this.level.visible = true;
    if (this.crowd) this.crowd.visible = true;
    this.setCameraMode(this.chestPrevMode === 'chest' ? 'menu' : this.chestPrevMode);
  }

  /* ---------------- frame ---------------- */

  /** Called when frames stay slow (auto quality can step down). */
  onSlowFrames: (() => void) | null = null;
  private slowTime = 0;
  private frameAvg = 1 / 60;

  frame(dtRaw: number) {
    if (!this.camera || !this.rig) return;
    // Frame-time monitor (ignores hitches > 0.25s such as resume from background).
    if (dtRaw < 0.25) {
      this.frameAvg += (dtRaw - this.frameAvg) * 0.05;
      this.slowTime = this.frameAvg > 1 / 38 ? this.slowTime + dtRaw : 0;
      if (this.slowTime > 4) {
        this.slowTime = -20; // give the new tier time before re-evaluating
        this.onSlowFrames?.();
      }
    }
    const dt = Math.min(0.05, Math.max(0, dtRaw));
    const sim = this.sim;
    if (!sim || !this.crowd || !this.level) {
      return;
    }
    if (this.autoplay && !this.paused && sim.s.phase === 'running') {
      this.autoplayTimer -= dt;
      if (this.autoplayTimer <= 0) {
        this.autoplayTimer = 0.15;
        sim.setTarget(bestTarget(sim, 1.6));
      }
    }
    if (!this.paused && !this.debugFreeze) {
      this.acc += dt;
      let steps = 0;
      while (this.acc >= SIM.fixedDt && steps < SIM.maxStepsPerFrame) {
        sim.step(SIM.fixedDt);
        this.acc -= SIM.fixedDt;
        steps++;
        for (const e of sim.drainEvents()) this.handle(e, sim);
      }
      if (steps === SIM.maxStepsPerFrame) this.acc = 0; // drop time after a hitch rather than spiral
    }

    const s = sim.s;
    const vdt = this.paused ? 0 : dt;
    this.crowd.position.set(s.x, 0, -s.z);
    this.crowd.update(sim.members, s.dead, vdt, s.t + (s.phase === 'ready' ? this.showcaseTime : 0));
    this.showcaseTime += dt;
    this.level.update(sim, vdt, this.camera);
    this.fx.update(vdt, this.camera);
    if (this.chest.visible) this.chest.update(dt, this.camera);

    // Count bubble above the crowd.
    if (s.count !== this.lastCount) {
      this.lastCount = s.count;
      const txt = formatCount(s.count);
      this.countLabel.setText(txt);
      this.countPill.setWidth(Math.max(0.9, this.countLabel.width + 0.45));
    }
    const showCount = s.count > 0 && this.camMode !== 'showcase' && this.camMode !== 'menu' && s.phase !== 'won';
    this.countGroup.visible = showCount;
    this.countGroup.position.set(s.x, 1.25 + sim.radius * 0.12, -s.z);
    this.countGroup.quaternion.copy(this.camera.quaternion);

    this.rig.update(s.x, s.phase === 'won' || s.phase === 'finish' ? Math.max(s.z, stallZ(sim.level, 0) - 6) : s.z, sim.radius, dt);

    // Battle crunch sound loop.
    if (s.phase === 'battle' && !this.paused) {
      this.battleSfx -= dt;
      if (this.battleSfx <= 0) {
        this.battleSfx = 0.28;
        audio.play('battle');
        haptics.light();
        this.rig.shake(0.08);
      }
    }

    // Delayed end-of-run callback (lets the celebration / fail play out).
    if (this.endTimer > 0 && !this.paused) {
      this.endTimer -= dt;
      if (this.endTimer <= 0 && this.endInfo) {
        const info = this.endInfo;
        this.callbacks?.onEnd(info.kind, sim, info);
      }
    }

    this.hudTimer -= dt;
    if (this.hudTimer <= 0) {
      this.hudTimer = 0.066;
      const rival = s.activeRival >= 0 ? s.rivals[s.activeRival].count : 0;
      hud.set({ count: s.count, progress: sim.progress, phase: s.phase, rivalCount: rival });
    }
  }

  /* ---------------- event → feedback ---------------- */

  private handle(e: SimEvent, sim: Simulation) {
    const s = sim.s;
    const lvl = this.level!;
    const rig = this.rig!;
    const wzc = -s.z;
    this.callbacks?.onEvent?.(e);
    switch (e.type) {
      case 'gate': {
        lvl.onGateTaken(e.rowId, e.gateIndex);
        const good = e.after >= e.before;
        const mult = e.op.kind === 'mul' && e.op.n >= 2;
        const tone = gateTone(e.op);
        const color = e.op.kind === 'mul' ? '#2BD47D' : GATE_COLORS[tone];
        this.fx.floatText(opLabel(e.op), s.x, 2.4, wzc - 1, good ? '#FFFFFF' : '#FF4D5E', mult ? 1.4 : 1.1, -sim.level.speed);
        if (good) {
          this.fx.burst(s.x, 1, wzc - 0.5, mult ? 70 : 30, [color, '#FFFFFF', '#FFE14D'], { speed: mult ? 7 : 4.5, up: mult ? 8 : 5 });
          audio.play(mult ? 'gate_mult' : 'gate_good');
          if (mult) {
            rig.punch(4 + Math.min(6, e.op.kind === 'mul' ? e.op.n : 0));
            haptics.medium();
          } else haptics.light();
        } else {
          this.fx.burst(s.x, 0.8, wzc, 24, ['#FF4D5E', '#7A1C1E'], { speed: 3.5, up: 3 });
          audio.play('gate_bad');
          rig.shake(0.25);
          haptics.heavy();
          // Show some members vanishing for subtractive gates.
          const n = Math.min(10, e.before - e.after);
          for (let i = 0; i < n; i++) this.fx.knockout(s.x + (Math.random() - 0.5) * sim.radius * 1.5, wzc + (Math.random() - 0.5) * sim.radius, 0, 0.7);
        }
        hud.set((h) => ({ pulse: h.pulse + 1, pulseKind: mult ? 'mult' : good ? 'good' : 'bad', tutorialStep: this.tutorial && sim.level.gateRows.indexOf(sim.level.gateRows.find((r) => r.id === e.rowId)!) === 1 ? 'obstacle' : hud.get().tutorialStep }));
        break;
      }
      case 'loss': {
        const n = Math.min(e.points.length, 10);
        for (let i = 0; i < n; i++) {
          const p = e.points[i];
          this.fx.knockout(p.x, -p.z, Math.sign(p.x - s.x), e.cause === 'rival' ? 0.6 : 1);
        }
        if (e.cause !== 'rival') {
          if (n > 0) this.fx.burst(e.points[0].x, 0.4, -e.points[0].z, 8, ['#FFFFFF', '#DDE3EA'], { speed: 2.5, up: 2.5, size: 0.18 });
          audio.play(e.cause === 'puddle' ? 'pop' : 'splat', 0.9 + Math.random() * 0.2);
          rig.shake(Math.min(0.35, 0.06 + e.amount * 0.01));
          haptics.light();
        } else audio.play('pop', 1 + Math.random() * 0.3);
        break;
      }
      case 'gain':
        this.hidePickupAt(sim, e.x, e.z, 'stragglers');
        this.fx.floatText('+' + formatCount(e.amount), e.x, 2, -e.z, '#2BD47D', 1.1, -sim.level.speed);
        this.fx.burst(e.x, 0.6, -e.z, 26, ['#2BD47D', '#FFFFFF'], { speed: 4, up: 5 });
        audio.play('gain');
        haptics.light();
        break;
      case 'coin':
        lvl.hidePickup(e.id);
        this.runCoins += e.amount;
        this.fx.burst(e.x, 0.6, -e.z, 6, ['#FFC83D', '#FFF3B0'], { speed: 2.5, up: 4, size: 0.1 });
        audio.play('coin', 1 + (this.runCoins % 5) * 0.05);
        hud.set({ coins: this.runCoins });
        break;
      case 'key':
        lvl.hidePickup(e.id);
        this.runKeys++;
        this.fx.burst(e.x, 1, -e.z, 30, ['#FFC107', '#FFFFFF'], { speed: 4, up: 6 });
        audio.play('unlock');
        haptics.success();
        hud.set({ keys: this.runKeys });
        break;
      case 'boxBreak': {
        lvl.breakObstacle(e.id);
        const o = sim.level.obstacles.find((x) => x.id === e.id);
        if (o) this.fx.burst(o.x, 0.7, -o.z, 40, ['#C68B59', '#E8D3A9', '#8D5B3E'], { speed: 6, up: 6, size: 0.2 });
        audio.play('splat', 0.8);
        rig.shake(0.3);
        haptics.medium();
        break;
      }
      case 'turnstileOpen':
        audio.play('gate_good');
        haptics.light();
        break;
      case 'battleStart':
        this.crowd!.mode = 'fight';
        rig.shake(0.3);
        haptics.heavy();
        this.battleSfx = 0;
        break;
      case 'battleEnd':
        if (e.won) {
          this.crowd!.mode = 'run';
          const p = lvl.rivalPosition(e.rivalId);
          this.fx.burst(p?.x ?? s.x, 1, p?.z ?? wzc - 2, 50, ['#FFE14D', '#2BD47D', '#FFFFFF'], { speed: 6, up: 7 });
          audio.play('gate_mult');
          haptics.success();
        }
        break;
      case 'finishLine':
        this.setCameraMode('finish');
        audio.play('flush');
        haptics.medium();
        hud.set({ tutorialStep: 'none' });
        break;
      case 'stall': {
        const z = -stallZ(sim.level, e.index);
        audio.play('stall', 1 + e.index * 0.07);
        this.fx.burst(0, 2.8, z, 18, [STALL_COLORS[e.index % STALL_COLORS.length], '#FFFFFF'], { speed: 4, up: 4 });
        for (let i = 0; i < 6; i++) this.fx.knockout((i % 2 ? 1 : -1) * 2.4, z + 0.5, i % 2 ? 1 : -1, 0.5);
        haptics.select();
        hud.set({ stall: e.multiplier });
        break;
      }
      case 'won':
        this.crowd!.mode = 'cheer';
        this.crowd!.setFacing(Math.PI);
        audio.play('win');
        haptics.success();
        for (let k = 0; k < 3; k++) this.fx.burst((k - 1) * 2.5, 2, -stallZ(sim.level, e.stallIndex) - 2, 60, ['#FF5FA2', '#FFE14D', '#2FA8FF', '#2BD47D', '#FFFFFF'], { speed: 7, up: 10, life: 1.8, gravity: 9 });
        this.endInfo = { kind: 'won', multiplier: e.multiplier, stallIndex: e.stallIndex, finishCount: e.finishCount, perfect: e.perfect };
        this.endTimer = 1.6;
        hud.set({ phase: 'won', stall: e.multiplier });
        break;
      case 'lost':
        this.crowd!.mode = 'idle';
        audio.play('lose');
        haptics.error();
        rig.shake(0.5);
        this.endInfo = { kind: 'lost', multiplier: 1, stallIndex: -1, finishCount: 0, perfect: false };
        this.endTimer = 0.9;
        hud.set({ phase: 'lost', count: 0 });
        break;
      case 'revived':
        break;
    }
  }

  private hidePickupAt(sim: Simulation, x: number, z: number, kind: 'stragglers') {
    const p = sim.level.pickups.find((q) => q.kind === kind && q.x === x && q.z === z);
    if (p) this.level?.hidePickup(p.id);
  }

  /** QA only: simulates `seconds` of gameplay instantly (autoplay steering). */
  debugFastForward(seconds: number, steerX?: number) {
    const sim = this.sim;
    if (!sim) return;
    if (sim.s.phase === 'ready') this.startRun();
    const steps = Math.round(seconds / SIM.fixedDt);
    for (let i = 0; i < steps && !sim.finished; i++) {
      if (sim.s.phase === 'running' && i % 9 === 0) sim.setTarget(steerX ?? bestTarget(sim, 1.6));
      sim.step(SIM.fixedDt);
      for (const e of sim.drainEvents()) this.handle(e, sim);
    }
  }

  /** Data for the results screen. */
  get runCollectibles() {
    return { coins: this.runCoins, keys: this.runKeys };
  }
}

export const game = new GameController();

if (process.env.EXPO_PUBLIC_DEBUG_HOOKS === '1') {
  (globalThis as unknown as { __game: GameController }).__game = game;
}
