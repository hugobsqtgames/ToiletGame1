import { createAudioPlayer, setAudioModeAsync, type AudioPlayer } from 'expo-audio';
import { log } from './log';
import { MUSIC_SOURCES } from './musicSources';

/**
 * Audio manager: small pools per SFX (overlapping plays), throttling for
 * spammy sounds, and a single music channel with track switching.
 * Respects the iOS silent switch (`playsInSilentMode: false`) and mixes with
 * the player's own music/podcasts instead of stopping it.
 */
const SFX = {
  tap: require('../../assets/audio/tap.wav'),
  gate_good: require('../../assets/audio/gate_good.wav'),
  gate_mult: require('../../assets/audio/gate_mult.wav'),
  gate_bad: require('../../assets/audio/gate_bad.wav'),
  pop: require('../../assets/audio/pop.wav'),
  splat: require('../../assets/audio/splat.wav'),
  coin: require('../../assets/audio/coin.wav'),
  gain: require('../../assets/audio/gain.wav'),
  battle: require('../../assets/audio/battle.wav'),
  win: require('../../assets/audio/win.wav'),
  lose: require('../../assets/audio/lose.wav'),
  flush: require('../../assets/audio/flush.wav'),
  chest_open: require('../../assets/audio/chest_open.wav'),
  purchase: require('../../assets/audio/purchase.wav'),
  unlock: require('../../assets/audio/unlock.wav'),
  whoosh: require('../../assets/audio/whoosh.wav'),
  stall: require('../../assets/audio/stall.wav'),
} as const;

/** Soundtrack (scripts/gen-music.js): AAC loops on iOS, MP3 on web (see musicSources.web.ts). */
const MUSIC = MUSIC_SOURCES;

export type SfxId = keyof typeof SFX;
export type MusicId = keyof typeof MUSIC | 'none';

const POOL: Partial<Record<SfxId, number>> = { pop: 4, coin: 3, splat: 3, tap: 2, stall: 2, gate_good: 2 };
const MIN_GAP: Partial<Record<SfxId, number>> = { pop: 45, splat: 70, coin: 40, battle: 220, tap: 30 };
const VOLUME: Partial<Record<SfxId, number>> = { pop: 0.5, splat: 0.6, coin: 0.55, whoosh: 0.5, tap: 0.6, battle: 0.7 };
const MUSIC_VOLUME = 0.4;
const FADE_OUT_S = 0.45;
const FADE_IN_S = 0.7;
const FADE_TICK_MS = 40;

class AudioManager {
  private pools = new Map<SfxId, { players: AudioPlayer[]; next: number; last: number }>();
  private music: AudioPlayer | null = null;
  private musicId: MusicId = 'none';
  /** Current level of `music` and the level it fades towards (ducking). */
  private musicLevel = 0;
  private musicTarget = MUSIC_VOLUME;
  /** Previous tracks fading out (crossfade). */
  private fading: { p: AudioPlayer; v: number }[] = [];
  private fadeTimer: ReturnType<typeof setInterval> | null = null;
  private sfxOn = true;
  private musicOn = true;
  private ready = false;
  private suspended = false;

  async init() {
    if (this.ready) return;
    try {
      await setAudioModeAsync({ playsInSilentMode: false, interruptionMode: 'mixWithOthers', allowsRecording: false, shouldPlayInBackground: false });
    } catch (e) {
      log.warn('audio mode', e);
    }
    for (const id of Object.keys(SFX) as SfxId[]) {
      const n = POOL[id] ?? 1;
      const players: AudioPlayer[] = [];
      for (let i = 0; i < n; i++) {
        try {
          const p = createAudioPlayer(SFX[id]);
          p.volume = VOLUME[id] ?? 0.8;
          players.push(p);
        } catch (e) {
          log.warn('sfx load', id, e);
        }
      }
      this.pools.set(id, { players, next: 0, last: 0 });
    }
    this.ready = true;
  }

  setSfx(on: boolean) {
    this.sfxOn = on;
  }

  setMusic(on: boolean) {
    this.musicOn = on;
    if (!on) {
      this.music?.pause();
      this.dropFading();
    } else if (!this.suspended) this.resumeMusic();
  }

  /** Called when the app goes to background / returns. */
  setSuspended(s: boolean) {
    this.suspended = s;
    if (s) {
      this.music?.pause();
      this.dropFading();
    } else if (this.musicOn) this.resumeMusic();
  }

  play(id: SfxId, rate = 1) {
    if (!this.sfxOn || !this.ready || this.suspended) return;
    const pool = this.pools.get(id);
    if (!pool || pool.players.length === 0) return;
    const now = Date.now();
    if (now - pool.last < (MIN_GAP[id] ?? 0)) return;
    pool.last = now;
    const p = pool.players[pool.next];
    pool.next = (pool.next + 1) % pool.players.length;
    try {
      if (rate !== 1) p.setPlaybackRate(rate, 'low');
      else if (p.playbackRate !== 1) p.setPlaybackRate(1);
      p.seekTo(0).catch(() => {});
      p.play();
    } catch (e) {
      log.warn('sfx play', id, e);
    }
  }

  /** Switches track with a short crossfade (same track: only the rate changes). */
  playMusic(id: MusicId, rate = 1) {
    if (id === this.musicId) {
      if (this.music && this.music.playbackRate !== rate) this.music.setPlaybackRate(rate, 'low');
      return;
    }
    this.musicId = id;
    if (this.music) {
      if (this.musicOn && !this.suspended) this.fading.push({ p: this.music, v: this.musicLevel });
      else this.release(this.music);
    }
    this.music = null;
    this.musicLevel = 0;
    if (id !== 'none') {
      try {
        const p = createAudioPlayer(MUSIC[id]);
        p.loop = true;
        p.volume = 0;
        if (rate !== 1) p.setPlaybackRate(rate, 'low');
        this.music = p;
        if (this.musicOn && !this.suspended) p.play();
      } catch (e) {
        log.warn('music', e);
      }
    }
    this.startFade();
  }

  /** Temporarily lowers music (results/fanfare). */
  duck(v: boolean) {
    this.musicTarget = v ? MUSIC_VOLUME * 0.35 : MUSIC_VOLUME;
    this.startFade();
  }

  private resumeMusic() {
    if (!this.music) return;
    this.music.play();
    this.startFade();
  }

  private startFade() {
    if (this.fadeTimer) return;
    this.fadeTimer = setInterval(() => this.tickFade(), FADE_TICK_MS);
  }

  private tickFade() {
    const dt = FADE_TICK_MS / 1000;
    for (const f of this.fading) {
      f.v -= (MUSIC_VOLUME / FADE_OUT_S) * dt;
      try {
        if (f.v <= 0) this.release(f.p);
        else f.p.volume = f.v;
      } catch {}
    }
    this.fading = this.fading.filter((f) => f.v > 0);
    let settled = true;
    if (this.music) {
      const step = (MUSIC_VOLUME / FADE_IN_S) * dt;
      const d = this.musicTarget - this.musicLevel;
      if (Math.abs(d) > 1e-3) {
        this.musicLevel += Math.sign(d) * Math.min(Math.abs(d), step);
        settled = false;
      }
      try {
        this.music.volume = this.musicLevel;
      } catch {}
    }
    if (settled && this.fading.length === 0 && this.fadeTimer) {
      clearInterval(this.fadeTimer);
      this.fadeTimer = null;
    }
  }

  private dropFading() {
    for (const f of this.fading) this.release(f.p);
    this.fading = [];
  }

  private release(p: AudioPlayer) {
    try {
      p.pause();
      p.remove();
    } catch {}
  }
}

export const audio = new AudioManager();
