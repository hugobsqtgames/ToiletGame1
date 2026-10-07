/** Music system: crossfades, ducking, settings, one existing track per world mood. */
import fs from 'fs';
import path from 'path';

/**
 * Fake expo-audio player that behaves like AVPlayer where it matters: a
 * non-looping clip stops at its end and stays there, so play() is SILENT until
 * a seek back to 0 completes (asynchronously).
 */
type FakePlayer = {
  src: unknown; volume: number; loop: boolean; playing: boolean; removed: boolean; playbackRate: number;
  atEnd: boolean; audible: number; silent: number; seeks: number; rateCalls: number;
  play(): void; pause(): void; remove(): void; seekTo(): Promise<void>; setPlaybackRate(r: number): void;
};
const players: FakePlayer[] = [];
/** Shorter than every clip the game spams, so "finished" really happens in tests. */
const FAKE_CLIP_MS = 200;
let inPlay = false;
jest.mock('expo-audio', () => ({
  setAudioModeAsync: async () => {},
  createAudioPlayer: (src: unknown) => {
    const p: FakePlayer = {
      src, volume: 1, loop: false, playing: false, removed: false, playbackRate: 1, atEnd: false, audible: 0, silent: 0, seeks: 0, rateCalls: 0,
      play() {
        if (this.atEnd && !this.loop) {
          this.silent++;
          return;
        }
        this.audible++;
        this.playing = true;
        if (!this.loop) setTimeout(() => { this.playing = false; this.atEnd = true; }, FAKE_CLIP_MS);
      },
      pause() { this.playing = false; },
      remove() { this.removed = true; },
      seekTo() {
        this.seeks++;
        return Promise.resolve().then(() => { this.atEnd = false; });
      },
      setPlaybackRate(r: number) { this.playbackRate = r; this.rateCalls++; },
    };
    players.push(p);
    return p;
  },
}));

import { audio } from '../src/services/audio';
import { BASE_THEMES } from '../src/core/worlds';

beforeAll(() => jest.useFakeTimers());
afterAll(() => jest.useRealTimers());

const music = () => players.filter((p) => p.loop);

it('fades the first track in, then crossfades to the next one and frees the old player', () => {
  audio.playMusic('menu');
  const menu = music().at(-1)!;
  expect(menu.playing).toBe(true);
  expect(menu.volume).toBe(0);
  jest.advanceTimersByTime(1000);
  expect(menu.volume).toBeCloseTo(0.4, 2);
  audio.playMusic('jazz');
  const jazz = music().at(-1)!;
  expect(jazz).not.toBe(menu);
  jest.advanceTimersByTime(200);
  expect(menu.volume).toBeLessThan(0.4);
  expect(jazz.volume).toBeGreaterThan(0);
  jest.advanceTimersByTime(1000);
  expect(menu.removed).toBe(true);
  expect(jazz.volume).toBeCloseTo(0.4, 2);
});

it('the same track keeps playing (only the boss rate changes)', () => {
  audio.playMusic('march');
  const m = music().at(-1)!;
  audio.playMusic('march', 1.06);
  expect(music().at(-1)).toBe(m);
  expect(m.playbackRate).toBe(1.06);
});

it('ducks smoothly and comes back', () => {
  audio.playMusic('surf');
  jest.advanceTimersByTime(1000);
  const s = music().at(-1)!;
  audio.duck(true);
  jest.advanceTimersByTime(1000);
  expect(s.volume).toBeCloseTo(0.14, 2);
  audio.duck(false);
  jest.advanceTimersByTime(1000);
  expect(s.volume).toBeCloseTo(0.4, 2);
});

it('music off / background pauses everything, including tracks still fading out', () => {
  audio.playMusic('groove');
  jest.advanceTimersByTime(1000);
  const g = music().at(-1)!;
  audio.playMusic('spooky');
  audio.setSuspended(true);
  const sp = music().at(-1)!;
  expect(g.removed).toBe(true);
  expect(sp.playing).toBe(false);
  audio.setSuspended(false);
  expect(sp.playing).toBe(true);
  audio.setMusic(false);
  expect(sp.playing).toBe(false);
  audio.playMusic('menu');
  expect(music().at(-1)!.playing).toBe(false); // created muted, waits for the setting
  audio.setMusic(true);
  expect(music().at(-1)!.playing).toBe(true);
});

it('every world mood has a soundtrack file', () => {
  for (const t of BASE_THEMES) {
    const f = path.join(__dirname, '..', 'assets', 'audio', `music_${t.music}.m4a`);
    expect(fs.existsSync(f)).toBe(true);
    expect(fs.statSync(f).size).toBeGreaterThan(200_000);
  }
  expect(fs.existsSync(path.join(__dirname, '..', 'assets', 'audio', 'music_menu.m4a'))).toBe(true);
});

describe('sound effects', () => {
  const sfxPlayers = () => players.filter((p) => !p.loop);
  const count = (f: (p: FakePlayer) => number) => sfxPlayers().reduce((a, p) => a + f(p), 0);

  beforeAll(async () => {
    await audio.init();
  });

  it('every coin of a long streak is audible (players are rewound before reuse)', async () => {
    const before = count((p) => p.audible);
    for (let i = 0; i < 20; i++) {
      audio.play('coin');
      await jest.advanceTimersByTimeAsync(110);
    }
    expect(count((p) => p.audible) - before).toBe(20);
    expect(count((p) => p.silent)).toBe(0);
  });

  it('play() never seeks or changes the rate synchronously (each is a native call on the JS thread)', async () => {
    await jest.advanceTimersByTimeAsync(2000);
    const seeks = count((p) => p.seeks);
    const rates = count((p) => p.rateCalls);
    audio.play('pop', 1.2);
    audio.play('stall', 1.1);
    audio.play('splat');
    expect(count((p) => p.seeks)).toBe(seeks);
    expect(count((p) => p.rateCalls)).toBe(rates);
    await jest.advanceTimersByTimeAsync(2000);
    expect(count((p) => p.seeks)).toBe(seeks + 3); // rewound afterwards, off the hot path
  });

  it('pitch variants come from preset players: the closest free rate is used', async () => {
    await jest.advanceTimersByTimeAsync(2000);
    const audibleAt = (r: number) => sfxPlayers().filter((p) => p.playbackRate === r).reduce((a, p) => a + p.audible, 0);
    const b = audibleAt(1.4);
    audio.play('stall', 1.42);
    expect(audibleAt(1.4)).toBe(b + 1);
  });

  it('spammy minor sounds share a budget instead of flooding the native bridge', async () => {
    await jest.advanceTimersByTimeAsync(3000);
    const before = count((p) => p.audible);
    for (let i = 0; i < 100; i++) {
      audio.play('pop');
      await jest.advanceTimersByTimeAsync(10);
    }
    const plays = count((p) => p.audible) - before;
    expect(plays).toBeGreaterThan(5);
    expect(plays).toBeLessThanOrEqual(15);
    expect(count((p) => p.silent)).toBe(0);
  });

  it('the battle brawl is one looping sound: one native play per battle', () => {
    const brawl = players.find((p) => p.loop && p.volume === 0.55)!; // music fades between 0 and 0.4
    expect(brawl).toBeDefined();
    const plays = brawl.audible;
    for (let i = 0; i < 60; i++) audio.loop('brawl', true);
    expect(brawl.audible).toBe(plays + 1);
    expect(brawl.playing).toBe(true);
    audio.loop('brawl', false);
    expect(brawl.playing).toBe(false);
    audio.loop('brawl', true);
    audio.setSuspended(true);
    expect(brawl.playing).toBe(false);
    audio.loop('brawl', true); // ignored while in background
    expect(brawl.playing).toBe(false);
    audio.setSuspended(false);
    audio.loop('brawl', true);
    expect(brawl.playing).toBe(true);
    audio.setSfx(false);
    expect(brawl.playing).toBe(false);
    audio.setSfx(true);
  });
});
