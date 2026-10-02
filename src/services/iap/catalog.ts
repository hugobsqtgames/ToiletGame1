import type { Reward, SaveData } from '../../meta/save';

/**
 * In-app purchase catalog. Product IDs are placeholders following the bundle
 * id: they MUST be created with the exact same IDs in App Store Connect
 * (see docs/MONETIZATION.md). Prices shown in the UI always come from StoreKit
 * (`displayPrice`); `fallbackPrice` is only displayed while the store loads.
 */
export type ProductKey = 'removeAds' | 'starter' | 'gemsS' | 'gemsM' | 'gemsL';

export interface ProductDef {
  key: ProductKey;
  id: string;
  type: 'consumable' | 'nonConsumable';
  fallbackPrice: string;
  grant: Reward & { removeAds?: boolean; starter?: boolean };
}

export const BUNDLE_ID = 'com.loorush.game';

export const PRODUCTS: ProductDef[] = [
  { key: 'removeAds', id: `${BUNDLE_ID}.removeads`, type: 'nonConsumable', fallbackPrice: '$3.99', grant: { removeAds: true } },
  { key: 'starter', id: `${BUNDLE_ID}.starterpack`, type: 'nonConsumable', fallbackPrice: '$4.99', grant: { removeAds: true, starter: true, gems: 150, skin: 'golden' } },
  { key: 'gemsS', id: `${BUNDLE_ID}.gems.small`, type: 'consumable', fallbackPrice: '$0.99', grant: { gems: 80 } },
  { key: 'gemsM', id: `${BUNDLE_ID}.gems.medium`, type: 'consumable', fallbackPrice: '$4.99', grant: { gems: 450 } },
  { key: 'gemsL', id: `${BUNDLE_ID}.gems.large`, type: 'consumable', fallbackPrice: '$9.99', grant: { gems: 1000 } },
];

export const productByKey = (k: ProductKey) => PRODUCTS.find((p) => p.key === k)!;
export const productById = (id: string) => PRODUCTS.find((p) => p.id === id);

/**
 * Grants a verified transaction exactly once (idempotent on transaction id).
 * Non-consumables are also idempotent on their entitlement flag so a restore
 * never grants gems twice.
 */
export function grantPurchase(save: SaveData, productId: string, transactionId: string): { save: SaveData; granted: boolean } {
  const p = productById(productId);
  if (!p) return { save, granted: false };
  if (save.purchases.processed.includes(transactionId)) return { save, granted: false };
  const processed = [...save.purchases.processed, transactionId].slice(-200);
  let s: SaveData = { ...save, purchases: { ...save.purchases, processed } };
  if (p.type === 'nonConsumable') {
    const already = (p.grant.starter && save.purchases.starter) || (!p.grant.starter && p.grant.removeAds && save.purchases.removeAds);
    if (already) return { save: s, granted: false };
  }
  if (p.grant.removeAds) s = { ...s, purchases: { ...s.purchases, removeAds: true } };
  if (p.grant.starter) s = { ...s, purchases: { ...s.purchases, starter: true } };
  if (p.grant.gems) s = { ...s, gems: s.gems + p.grant.gems };
  if (p.grant.coins) s = { ...s, coins: s.coins + p.grant.coins };
  if (p.grant.skin && !s.skins.owned.includes(p.grant.skin)) s = { ...s, skins: { ...s.skins, owned: [...s.skins.owned, p.grant.skin] } };
  return { save: s, granted: true };
}

/** Restore: re-applies non-consumable entitlements (no consumables). */
export function restoreEntitlements(save: SaveData, ownedProductIds: string[]): SaveData {
  let s = save;
  for (const id of ownedProductIds) {
    const p = productById(id);
    if (!p || p.type !== 'nonConsumable') continue;
    if (p.grant.removeAds) s = { ...s, purchases: { ...s.purchases, removeAds: true } };
    if (p.grant.starter) {
      s = { ...s, purchases: { ...s.purchases, starter: true } };
      if (p.grant.skin && !s.skins.owned.includes(p.grant.skin)) s = { ...s, skins: { ...s.skins, owned: [...s.skins.owned, p.grant.skin] } };
    }
  }
  return s;
}
