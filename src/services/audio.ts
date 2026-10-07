import { createAudioPlayer, setAudioModeAsync, type AudioPlayer } from 'expo-audio';
import { log } from './log';
import { MUSIC_SOURCES } from './musicSources';

/**
 * Audio manager: pools of pre-rewound players per SFX, throttling for spammy
 * sounds, looping SFX (battle brawl) and a single music channel with crossfades.
 * Respects the iOS silent switch (`playsInSilentMode: false`) and mixes with
 * the player's own music/podcasts instead of stopping it.
 *
 * iOS performance notes (expo-audio = AVPlayer): every `play()` is a
 * synchronous native call on the JS thread that also re-activates the audio
 * session, so the number of plays per second directly costs frame time. Hence:
 *  - no seek / rate change at play time: a player is rewound right after it
 *    finished, and pitch variants are separate players with a preset rate;
 *  - a player that is still playing or not yet rewound is never reused (a
 *    finished AVPlayer sits at its end: playing it again before the rewind
 *    completed was silent, which dropped coin sounds);
 *  - long bursts (battles) use ONE looping sound instead of dozens of hits;
 *  - a global budget caps minor sounds per second.
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
  brawl: require('../../assets/audio/brawl.wav'),
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
export type LoopId = 'brawl';

/**
 * Playback rates of each sound's players (pool size = number of rates).
 * `play(id, rate)` picks the free player whose rate is closest. Consecutive
 * coins walk up the list, which gives the rising "combo" jingle.
 */
const RATES: Partial<Record<SfxId, number[]>> = {
  coin: [1, 1.05, 1.1, 1.15, 1.2, 1.25],
  pop: [0.8, 1, 1.1, 1.2, 1.3],
  splat: [0.8, 0.95, 1.05],
  tap: [0.9, 1, 1.15, 1.4],
  stall: [0.7, 1, 1.1, 1.2, 1.3, 1.4],
  gate_good: [1, 1],
  gain: [1, 1],
};
/** Clip lengths in seconds (assets/audio/*.wav), used before the native duration is known. */
const LENGTH: Record<SfxId, number> = {
  tap: 0.06, gate_good: 0.35, gate_mult: 0.7, gate_bad: 0.45, pop: 0.08, splat: 0.18, coin: 0.25, gain: 0.3, brawl: 1.6,
  win: 1.9, lose: 1.7, flush: 1.3, chest_open: 1.0, purchase: 0.6, unlock: 1.1, whoosh: 0.3, stall: 0.22,
};
const MIN_GAP: Partial<Record<SfxId, number>> = { pop: 70, splat: 90, coin: 45, tap: 30, gate_good: 60 };
const VOLUME: Partial<Record<SfxId, number>> = { pop: 0.5, splat: 0.6, coin: 0.55, whoosh: 0.5, tap: 0.6, brawl: 0.55 };
/** Sounds that always play (feedback the player must hear); the others share a budget. */
const MAJOR = new Set<SfxId>(['gate_mult', 'gate_bad', 'gate_good', 'win', 'lose', 'flush', 'chest_open', 'purchase', 'unlock', 'gain', 'stall', 'coin']);
const BUDGET_PER_S = 14;
const BUDGET_BURST = 5;
const LOOPS: Record<LoopId, SfxId> = { brawl: 'brawl' };
const MUSIC_VOLUME = 0.4;
const FADE_OUT_S = 0.45;
const FADE_IN_S = 0.7;
const FADE_TICK_MS = 40;
/** Native status events are useless for SFX: keep them rare. */
const SFX_STATUS_INTERVAL_MS = 60_000;

interface Voice {
  p: AudioPlayer;
  rate: number;
  /** Rewound and idle. */
  ready: boolean;
  /** Date.now() when the last play started (stuck-rewind safety net). */
  startedAt: number;
}

class AudioManager {
  private pools = new Map<SfxId, { voices: Voice[]; next: number; last: number }>();
  private loops = new Map<LoopId, { p: AudioPlayer; on: boolean }>();
  private budget = BUDGET_BURST;
  private budgetAt = 0;
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
      if (id === 'brawl') continue;
      const voices: Voice[] = [];
      for (const rate of RATES[id] ?? [1]) {
        try {
          const p = createAudioPlayer(SFX[id], { updateInterval: SFX_STATUS_INTERVAL_MS, keepAudioSessionActive: true });
          p.volume = VOLUME[id] ?? 0.8;
          if (rate !== 1) p.setPlaybackRate(rate, 'low');
          voices.push({ p, rate, ready: true, startedAt: 0 });
        } catch (e) {
          log.warn('sfx load', id, e);
        }
      }
      this.pools.set(id, { voices, next: 0, last: 0 });
    }
    for (const [loop, id] of Object.entries(LOOPS) as [LoopId, SfxId][]) {
      try {
        const p = createAudioPlayer(SFX[id], { updateInterval: SFX_STATUS_INTERVAL_MS, keepAudioSessionActive: true });
        p.loop = true;
        p.volume = VOLUME[id] ?? 0.8;
        this.loops.set(loop, { p, on: false });
      } catch (e) {
        log.warn('sfx load', id, e);
      }
    }
    this.ready = true;
  }

  setSfx(on: boolean) {
    this.sfxOn = on;
    if (!on) this.stopLoops();
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
      this.stopLoops();
    } else if (this.musicOn) this.resumeMusic();
  }

  play(id: SfxId, rate = 1) {
    if (!this.sfxOn || !this.ready || this.suspended) return;
    const pool = this.pools.get(id);
    if (!pool || pool.voices.length === 0) return;
    const now = Date.now();
    if (now - pool.last < (MIN_GAP[id] ?? 0)) return;
    if (!MAJOR.has(id)) {
      this.budget = Math.min(BUDGET_BURST, this.budget + ((now - this.budgetAt) / 1000) * BUDGET_PER_S);
      this.budgetAt = now;
      if (this.budget < 1) return;
    }
    const v = this.pickVoice(pool, rate, now);
    if (!v) return; // every player busy: dropping a hit beats stalling the frame
    if (!MAJOR.has(id)) this.budget -= 1;
    pool.last = now;
    v.ready = false;
    v.startedAt = now;
    try {
      v.p.play();
    } catch (e) {
      log.warn('sfx play', id, e);
    }
    // Rewind once the clip is over, so the next play() starts instantly.
    const ms = ((LENGTH[id] ?? 1) / v.rate) * 1000 + 40;
    setTimeout(() => this.rewind(v), ms);
  }

  /** Starts/stops a looping sound (one native call each way, whatever its length). */
  loop(id: LoopId, on: boolean) {
    const l = this.loops.get(id);
    if (!l || l.on === on) return;
    if (on && (!this.sfxOn || this.suspended)) return;
    l.on = on;
    try {
      if (on) l.p.play();
      else l.p.pause();
    } catch (e) {
      log.warn('sfx loop', id, e);
    }
  }

  private stopLoops() {
    for (const id of this.loops.keys()) this.loop(id, false);
  }

  private pickVoice(pool: { voices: Voice[]; next: number }, rate: number, now: number): Voice | null {
    const vs = pool.voices;
    if (rate === 1) {
      // Round-robin from the last used voice (coins climb the pitch ladder).
      for (let k = 0; k < vs.length; k++) {
        const i = (pool.next + k) % vs.length;
        if (this.isFree(vs[i], now)) {
          pool.next = (i + 1) % vs.length;
          return vs[i];
        }
      }
      return null;
    }
    let best: Voice | null = null;
    for (const v of vs) if (this.isFree(v, now) && (!best || Math.abs(v.rate - rate) < Math.abs(best.rate - rate))) best = v;
    return best;
  }

  private isFree(v: Voice, now: number) {
    if (v.ready) return true;
    // Safety net: a rewind that never completed must not lock the voice forever.
    if (now - v.startedAt > 3000) {
      v.ready = true;
      return true;
    }
    return false;
  }

  private rewind(v: Voice) {
    try {
      // Started late (or still playing): rewinding now would leave it parked at its end.
      if (v.p.playing && Date.now() - v.startedAt < 3000) {
        setTimeout(() => this.rewind(v), 50);
        return;
      }
      v.p.seekTo(0).then(
        () => (v.ready = true),
        () => (v.ready = true),
      );
    } catch {
      v.ready = true;
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
