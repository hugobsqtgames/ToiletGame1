/** Regression tests for user actions: double taps, interstitial transitions, reset keeping purchases. */
jest.mock('expo-audio', () => ({
  setAudioModeAsync: async () => {},
  createAudioPlayer: () => ({ play() {}, pause() {}, seekTo: async () => {}, setPlaybackRate() {}, remove() {}, volume: 1, loop: false, playbackRate: 1 }),
}));
jest.mock('@react-native-async-storage/async-storage', () => require('@react-native-async-storage/async-storage/jest/async-storage-mock'));

import { generateLevel } from '../src/core/levelGen';
import { Simulation } from '../src/core/simulation';
import { defaultSave } from '../src/meta/save';
import { game } from '../src/render/GameController';
import { app } from '../src/state/app';
import * as actions from '../src/state/actions';
import { analytics } from '../src/services/analytics';

const NOW = Date.now();

function lostRun(level = 12, gems = 0) {
  const def = generateLevel(level);
  const sim = new Simulation(def);
  sim.start();
  sim.s.count = 0;
  sim.s.phase = 'lost';
  game.sim = sim;
  app.set({ save: { ...defaultSave(NOW), level, gems }, run: { def, mode: 'campaign', startedAt: NOW }, modal: 'revive', reviveCount: 20, results: null, queue: [] });
  return sim;
}

afterAll(() => new Promise((r) => setTimeout(r, 300)));

beforeAll(() => {
  analytics.setEnabled(false);
  jest.spyOn(console, 'warn').mockImplementation(() => {});
  jest.spyOn(console, 'log').mockImplementation(() => {});
});

describe('double taps', () => {
  it('declining the revive twice counts the run once', () => {
    lostRun();
    actions.declineRevive();
    actions.declineRevive();
    expect(app.get().save.stats.runs).toBe(1);
    expect(app.get().save.stats.losses).toBe(1);
    expect(app.get().modal).toBe('results');
  });
  it('the auto-decline at 0 s after a manual decline does not count the run again', () => {
    lostRun();
    actions.declineRevive();
    actions.declineRevive(); // countdown effect firing late
    expect(app.get().save.stats.runs).toBe(1);
  });
  it('reviving with gems twice spends the gems once', () => {
    const sim = lostRun(12, 100);
    actions.reviveWithGems();
    actions.reviveWithGems();
    expect(app.get().save.gems).toBe(85);
    expect(sim.s.revived).toBe(true);
    expect(sim.s.phase).toBe('running');
  });
  it('cannot revive with gems once the run has been declined', () => {
    lostRun(12, 100);
    actions.declineRevive();
    actions.reviveWithGems();
    expect(app.get().save.gems).toBe(100);
  });
  it('NEXT tapped twice starts the next level once', async () => {
    lostRun();
    actions.declineRevive();
    const spy = jest.spyOn(game, 'loadLevel');
    spy.mockClear();
    await Promise.all([actions.continueAfterResults('retry'), actions.continueAfterResults('retry')]);
    expect(spy).toHaveBeenCalledTimes(1);
    expect(app.get().screen).toBe('play');
  });
});

describe('reset progress', () => {
  it('wipes progress but keeps purchases and the paid skin', async () => {
    app.set({
      save: {
        ...defaultSave(NOW), level: 80, coins: 5000, gems: 300,
        purchases: { removeAds: true, starter: true, processed: ['t1'] },
        skins: { owned: ['rookie', 'golden', 'robot'], selected: 'golden' },
      },
    });
    await actions.resetProgress();
    const s = app.get().save;
    expect(s.level).toBe(1);
    expect(s.coins).toBe(0);
    expect(s.purchases.removeAds).toBe(true);
    expect(s.purchases.starter).toBe(true);
    expect(s.skins.owned).toEqual(['rookie', 'golden']);
  });
});
