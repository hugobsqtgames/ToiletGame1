import type { LevelDef } from '../core/types';
import type { Reward, SaveData } from '../meta/save';
import { defaultSave } from '../meta/save';
import type { RunRewards, RunResult } from '../meta/progression';
import { createStore } from './store';

export type ScreenId = 'boot' | 'home' | 'play';
export type ModalId =
  | 'pause'
  | 'revive'
  | 'results'
  | 'shop'
  | 'skins'
  | 'missions'
  | 'daily'
  | 'challenges'
  | 'chest'
  | 'settings'
  | 'worlds'
  | 'worldUnlock'
  | 'reward';

export interface RunInfo {
  def: LevelDef;
  mode: 'campaign' | 'daily';
  startedAt: number;
}

export interface ResultsInfo {
  result: RunResult;
  rewards: RunRewards;
  tripled: boolean;
}

export interface RewardPopup {
  title: string;
  reward: Reward;
}

export interface AppState {
  screen: ScreenId;
  modal: ModalId | null;
  /** Modals queued after the current one closes (e.g. world unlock after results). */
  queue: ModalId[];
  save: SaveData;
  run: RunInfo | null;
  results: ResultsInfo | null;
  reviveCount: number;
  rewardPopup: RewardPopup | null;
  toast: { id: number; text: string; tone: 'info' | 'good' | 'bad' } | null;
  busy: boolean;
  /** Bumped when ads/iap availability changes (re-render buttons). */
  storeTick: number;
  lang: string;
}

export const app = createStore<AppState>({
  screen: 'boot',
  modal: null,
  queue: [],
  save: defaultSave(Date.now()),
  run: null,
  results: null,
  reviveCount: 0,
  rewardPopup: null,
  toast: null,
  busy: false,
  storeTick: 0,
  lang: 'en',
});
