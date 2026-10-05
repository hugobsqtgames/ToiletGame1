/** Music system: crossfades, ducking, settings, one existing track per world mood. */
import fs from 'fs';
import path from 'path';

type FakePlayer = { src: unknown; volume: number; loop: boolean; playing: boolean; removed: boolean; playbackRate: number; play(): void; pause(): void; remove(): void; seekTo(): Promise<void>; setPlaybackRate(r: number): void };
const players: FakePlayer[] = [];
jest.mock('expo-audio', () => ({
  setAudioModeAsync: async () => {},
  createAudioPlayer: (src: unknown) => {
    const p: FakePlayer = {
      src, volume: 1, loop: false, playing: false, removed: false, playbackRate: 1,
      play() { this.playing = true; }, pause() { this.playing = false; }, remove() { this.removed = true; },
      seekTo: async () => {}, setPlaybackRate(r: number) { this.playbackRate = r; },
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
