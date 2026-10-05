import * as THREE from 'three';
import { damp } from '../core/math';

/**
 * Smooth follow camera. Modes:
 *  - menu: in front of the crowd, looking back at them (they face the player),
 *  - play: behind and above, distance grows with crowd radius & speed,
 *  - finish: lower, cinematic, slowly orbiting during the celebration,
 *  - showcase: close-up for the skins screen,
 *  - chest: fixed framing of the chest-opening stage (set with setFixedPose).
 * Effects: trauma-based shake and FOV punch, both decaying.
 */
export type CamMode = 'menu' | 'play' | 'finish' | 'showcase' | 'chest';

const _target = new THREE.Vector3();
const _look = new THREE.Vector3();

export class CameraRig {
  mode: CamMode = 'menu';
  private pos = new THREE.Vector3(3, 3, -6);
  private look = new THREE.Vector3();
  private trauma = 0;
  private fovKick = 0;
  private orbit = 0;
  private radius = 1;
  private baseFov = 55;
  private aspect = 0.46;
  private fixedPos = new THREE.Vector3();
  private fixedLook = new THREE.Vector3();
  /** Next update jumps straight to the target (scene cut). */
  private cutNext = false;

  constructor(private camera: THREE.PerspectiveCamera) {}

  setAspect(aspect: number) {
    // Narrow phones need a slightly wider FOV to keep the track visible.
    this.baseFov = aspect < 0.5 ? 60 : aspect < 0.6 ? 57 : 52;
    this.aspect = aspect;
  }

  get viewAspect() {
    return this.aspect;
  }

  /** Pose used by the 'chest' mode. */
  setFixedPose(pos: THREE.Vector3, look: THREE.Vector3) {
    this.fixedPos.copy(pos);
    this.fixedLook.copy(look);
  }

  /** Hard cut on the next frame (no travel through the level). */
  cut() {
    this.cutNext = true;
  }

  shake(amount: number) {
    this.trauma = Math.min(1, this.trauma + amount);
  }

  punch(amount: number) {
    this.fovKick = Math.min(10, this.fovKick + amount);
  }

  /** Instantly place the camera for the current mode (level load). */
  snap(x: number, z: number, radius: number) {
    this.radius = radius;
    this.compute(x, z, 0);
    this.pos.copy(_target);
    this.look.copy(_look);
    this.apply(0);
  }

  update(x: number, z: number, radius: number, dt: number) {
    this.radius += (radius - this.radius) * damp(2, dt);
    this.orbit += dt;
    this.compute(x, z, dt);
    if (this.cutNext) {
      this.cutNext = false;
      this.pos.copy(_target);
      this.look.copy(_look);
      this.apply(dt);
      return;
    }
    const k = this.mode === 'play' ? damp(6, dt) : this.mode === 'chest' ? damp(8, dt) : damp(2.6, dt);
    this.pos.lerp(_target, k);
    this.look.lerp(_look, this.mode === 'play' ? damp(8, dt) : k);
    this.apply(dt);
  }

  private compute(x: number, z: number, _dt: number) {
    const wzc = -z;
    const R = this.radius;
    switch (this.mode) {
      case 'menu':
        _target.set(x + 1.7, 1.7 + R * 0.6, wzc - 4.4 - R * 1.4);
        _look.set(x - 0.15, 0.85 + R * 0.15, wzc);
        break;
      case 'showcase':
        // Crowd framed in the upper half (the skins sheet covers the bottom).
        _target.set(x + 0.5, 1.5 + R * 0.4, wzc - 3.2 - R * 1.2);
        _look.set(x + 0.1, -0.9, wzc + 0.4);
        break;
      case 'play':
        _target.set(x * 0.55, 6.4 + R * 1.15, wzc + 8.4 + R * 1.5);
        _look.set(x * 0.8, 0.6, wzc - 12);
        break;
      case 'chest':
        _target.copy(this.fixedPos);
        _look.copy(this.fixedLook);
        break;
      case 'finish': {
        // High, slightly swaying view down the stall corridor.
        const sway = Math.sin(this.orbit * 0.5) * 1.2;
        _target.set(sway, 9.5 + R * 1.1, wzc + 9 + R * 1.2);
        _look.set(0, 0, wzc - 9);
        break;
      }
    }
  }

  private apply(dt: number) {
    const c = this.camera;
    c.position.copy(this.pos);
    if (this.trauma > 0) {
      const s = this.trauma * this.trauma * 0.35;
      c.position.x += (Math.random() - 0.5) * s;
      c.position.y += (Math.random() - 0.5) * s;
      this.trauma = Math.max(0, this.trauma - dt * 1.8);
    }
    c.lookAt(this.look);
    const fov = this.baseFov + this.fovKick;
    if (Math.abs(c.fov - fov) > 0.01) {
      c.fov = fov;
      c.updateProjectionMatrix();
    }
    this.fovKick = Math.max(0, this.fovKick - dt * 12);
  }
}
