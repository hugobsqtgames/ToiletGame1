import { hasIapNative } from '../platform';
import { log } from '../log';
import { analytics } from '../analytics';
import { PRODUCTS, productById, productByKey, type ProductKey } from './catalog';

/**
 * Store facade. The game calls buy()/restore() and receives results; granting
 * is delegated to the `onVerified` handler installed by the game store, which
 * applies the entitlement idempotently (transaction id) and persists it
 * BEFORE the transaction is finished, so a crash can never lose a purchase.
 *
 * Providers:
 *  - expo-iap (StoreKit 2) in development/production builds,
 *  - DevSim in __DEV__ without the native module (clearly labeled, no money),
 *  - Unavailable otherwise (real-money items are shown as unavailable).
 */
export type PurchaseStatus = 'success' | 'cancelled' | 'pending' | 'error' | 'unavailable';

export interface StoreProduct {
  key: ProductKey;
  id: string;
  displayPrice: string;
  title?: string;
}

type VerifiedHandler = (productId: string, transactionId: string) => Promise<void>;

interface Provider {
  name: 'storekit' | 'devsim' | 'none';
  init(): Promise<void>;
  products(): StoreProduct[];
  buy(id: string): Promise<PurchaseStatus>;
  restore(): Promise<string[]>;
  dispose(): void;
}

let onVerified: VerifiedHandler = async () => {};

function fallbackProducts(): StoreProduct[] {
  return PRODUCTS.map((p) => ({ key: p.key, id: p.id, displayPrice: p.fallbackPrice }));
}

function createStoreKitProvider(): Provider {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const iap = require('expo-iap') as typeof import('expo-iap');
  let list: StoreProduct[] = fallbackProducts();
  const waiters = new Map<string, (s: PurchaseStatus) => void>();
  const timers = new Map<string, ReturnType<typeof setTimeout>>();
  const subs: { remove: () => void }[] = [];

  const settle = (sku: string | null | undefined, s: PurchaseStatus) => {
    if (!sku) return;
    const w = waiters.get(sku);
    const tm = timers.get(sku);
    if (tm) {
      clearTimeout(tm);
      timers.delete(sku);
    }
    if (w) {
      waiters.delete(sku);
      w(s);
    }
  };

  return {
    name: 'storekit',
    async init() {
      await iap.initConnection();
      subs.push(
        iap.purchaseUpdatedListener(async (purchase) => {
          const def = productById(purchase.productId);
          if (!def) return;
          if (purchase.purchaseState === 'pending') {
            settle(purchase.productId, 'pending');
            return;
          }
          try {
            // StoreKit 2 transactions are signed & verified on-device by expo-iap.
            // For server-side validation, call your backend here (docs/MONETIZATION.md).
            await onVerified(purchase.productId, purchase.id);
            await iap.finishTransaction({ purchase, isConsumable: def.type === 'consumable' });
            settle(purchase.productId, 'success');
          } catch (e) {
            log.warn('purchase handling failed', e);
            settle(purchase.productId, 'error');
          }
        }),
      );
      subs.push(
        iap.purchaseErrorListener((err) => {
          const cancelled = String(err.code) === 'user-cancelled';
          settle(err.productId ?? [...waiters.keys()][0], cancelled ? 'cancelled' : 'error');
        }),
      );
      try {
        const res = (await iap.fetchProducts({ skus: PRODUCTS.map((p) => p.id), type: 'in-app' })) ?? [];
        const byId = new Map((res as { id: string; displayPrice: string; title: string }[]).map((p) => [p.id, p]));
        list = PRODUCTS.map((p) => {
          const sp = byId.get(p.id);
          return { key: p.key, id: p.id, displayPrice: sp?.displayPrice ?? p.fallbackPrice, title: sp?.title };
        });
      } catch (e) {
        log.warn('fetchProducts failed', e);
      }
    },
    products: () => list,
    buy(id) {
      return new Promise<PurchaseStatus>((resolve) => {
        waiters.get(id)?.('cancelled');
        waiters.set(id, resolve);
        iap.requestPurchase({ request: { apple: { sku: id }, google: { skus: [id] } }, type: 'in-app' }).catch((e) => {
          log.warn('requestPurchase', e);
          settle(id, String((e as { code?: string })?.code) === 'user-cancelled' ? 'cancelled' : 'error');
        });
        // Safety: never leave the UI spinning forever (cleared when this purchase settles,
        // so it can never fail a later purchase of the same product).
        const old = timers.get(id);
        if (old) clearTimeout(old);
        timers.set(id, setTimeout(() => settle(id, 'error'), 120_000));
      });
    },
    async restore() {
      try {
        await iap.restorePurchases();
      } catch (e) {
        log.warn('restorePurchases', e);
      }
      const owned = await iap.getAvailablePurchases();
      return owned.map((p) => p.productId);
    },
    dispose() {
      for (const s of subs) s.remove();
      iap.endConnection().catch(() => {});
    },
  };
}

/** DEVELOPMENT ONLY: UI presenter for the simulated purchase sheet (ui/components/Overlays.tsx). */
export interface DevPurchaseRequest {
  productId: string;
  price: string;
  resolve: (confirmed: boolean) => void;
}
let devPresenter: ((r: DevPurchaseRequest) => void) | null = null;
export function registerDevPurchasePresenter(p: ((r: DevPurchaseRequest) => void) | null) {
  devPresenter = p;
}

/** DEVELOPMENT ONLY: exercises the full grant flow without StoreKit. */
function createDevSimProvider(): Provider {
  const owned = new Set<string>();
  return {
    name: 'devsim',
    init: async () => {},
    products: () => fallbackProducts().map((p) => ({ ...p, displayPrice: p.displayPrice + ' (test)' })),
    buy(id) {
      return new Promise<PurchaseStatus>((resolve) => {
        if (!devPresenter) return resolve('unavailable');
        const price = fallbackProducts().find((p) => p.id === id)?.displayPrice ?? '';
        devPresenter({
          productId: id,
          price,
          resolve: async (confirmed) => {
            if (!confirmed) return resolve('cancelled');
            await onVerified(id, `devsim-${id}-${Date.now()}`);
            if (productById(id)?.type === 'nonConsumable') owned.add(id);
            resolve('success');
          },
        });
      });
    },
    restore: async () => [...owned],
    dispose: () => {},
  };
}

const unavailable: Provider = {
  name: 'none',
  init: async () => {},
  products: fallbackProducts,
  buy: async () => 'unavailable',
  restore: async () => [],
  dispose: () => {},
};

class IapService {
  private provider: Provider = unavailable;
  private busy = false;

  setVerifiedHandler(h: VerifiedHandler) {
    onVerified = h;
  }

  async init() {
    try {
      if (hasIapNative()) this.provider = createStoreKitProvider();
      else if (typeof __DEV__ !== 'undefined' && __DEV__) this.provider = createDevSimProvider();
      await this.provider.init();
    } catch (e) {
      log.warn('IAP init failed', e);
      this.provider = unavailable;
    }
  }

  get available() {
    return this.provider.name !== 'none';
  }

  get providerName() {
    return this.provider.name;
  }

  products() {
    return this.provider.products();
  }

  price(key: ProductKey) {
    return this.provider.products().find((p) => p.key === key)?.displayPrice ?? productByKey(key).fallbackPrice;
  }

  async buy(key: ProductKey): Promise<PurchaseStatus> {
    if (this.busy) return 'error';
    this.busy = true;
    try {
      const status = await this.provider.buy(productByKey(key).id);
      analytics.track({ name: 'purchase', params: { product: key, status: status === 'success' ? 'success' : status === 'cancelled' ? 'cancelled' : 'error' } });
      return status;
    } finally {
      this.busy = false;
    }
  }

  async restore(): Promise<string[] | null> {
    try {
      const ids = await this.provider.restore();
      analytics.track({ name: 'purchase', params: { product: 'restore', status: 'restored' } });
      return ids;
    } catch (e) {
      log.warn('restore failed', e);
      return null;
    }
  }
}

export const iap = new IapService();
