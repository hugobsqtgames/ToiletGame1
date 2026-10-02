import { niceRound } from '../core/math';
import { hash2, Rng } from '../core/rng';
import { levelBase } from './economy';
import type { Reward, SaveData } from './save';
import { chestSkinPool } from './skins';

export type ChestTier = 'basic' | 'epic';

/**
 * Chest contents are rolled deterministically from (chestsOpened, tier) so a
 * player can't reroll by closing the app mid-animation.
 */
export function rollChest(save: SaveData, tier: ChestTier): Reward {
  const rng = new Rng(hash2(save.stats.chestsOpened + 1, tier === 'epic' ? 0xe91c : 0xba51c) ^ (save.createdAt >>> 0));
  const base = levelBase(save.level);
  const reward: Reward = {};
  const unowned = chestSkinPool(tier).filter((s) => !save.skins.owned.includes(s.id));
  const skinChance = tier === 'epic' ? 0.55 : 0.12;
  if (unowned.length > 0 && rng.chance(skinChance)) {
    reward.skin = rng.pick(unowned).id;
  }
  reward.coins = niceRound(base * (tier === 'epic' ? rng.range(14, 22) : rng.range(4, 7)));
  if (tier === 'epic') reward.gems = rng.int(10, 20);
  else if (rng.chance(0.3)) reward.gems = rng.int(2, 5);
  // Compensation when the skin pool is exhausted, so chests never feel empty.
  if (!reward.skin && tier === 'epic') reward.gems = (reward.gems ?? 0) + 10;
  return reward;
}
