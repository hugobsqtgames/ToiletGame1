import { log } from './log';

/**
 * Privacy-first analytics facade. No personal data, no device identifiers,
 * no advertising ID. Events are queued and handed to pluggable sinks.
 * Default sink: dev console. Plug a real backend (Firebase, Amplitude,
 * PostHog...) by implementing AnalyticsSink — see docs/ANALYTICS.md.
 * The player can opt out in Settings; opt-out drops events at the source.
 */
export type AnalyticsEvent =
  | { name: 'app_open'; params: { session: number } }
  | { name: 'level_start'; params: { level: number; world: number; mode: string } }
  | { name: 'level_end'; params: { level: number; won: boolean; finish: number; peak: number; time: number; revived: boolean; mode: string } }
  | { name: 'gate_taken'; params: { level: number; kind: string; before: number; after: number } }
  | { name: 'reward'; params: { source: string; coins?: number; gems?: number } }
  | { name: 'ad_shown'; params: { format: 'interstitial' | 'rewarded'; placement: string } }
  | { name: 'ad_reward'; params: { placement: string } }
  | { name: 'purchase'; params: { product: string; status: 'success' | 'cancelled' | 'error' | 'restored' } }
  | { name: 'skin_unlocked'; params: { skin: string; source: string } }
  | { name: 'mission_claimed'; params: { id: string } }
  | { name: 'chest_opened'; params: { tier: string } }
  | { name: 'world_unlocked'; params: { world: number } }
  | { name: 'tutorial_step'; params: { step: string } };

export interface AnalyticsSink {
  send(batch: AnalyticsEvent[]): Promise<void> | void;
}

const consoleSink: AnalyticsSink = {
  send(batch) {
    for (const e of batch) log.info('analytics', e.name, JSON.stringify(e.params));
  },
};

class Analytics {
  private sinks: AnalyticsSink[] = typeof __DEV__ !== 'undefined' && __DEV__ ? [consoleSink] : [];
  private queue: AnalyticsEvent[] = [];
  private enabled = true;
  private timer: ReturnType<typeof setTimeout> | null = null;

  addSink(s: AnalyticsSink) {
    this.sinks.push(s);
  }

  setEnabled(v: boolean) {
    this.enabled = v;
    if (!v) this.queue = [];
  }

  track(e: AnalyticsEvent) {
    if (!this.enabled || this.sinks.length === 0) return;
    this.queue.push(e);
    if (this.queue.length > 200) this.queue.splice(0, this.queue.length - 200);
    if (!this.timer) this.timer = setTimeout(() => this.flush(), 2000);
  }

  flush() {
    this.timer = null;
    if (this.queue.length === 0) return;
    const batch = this.queue;
    this.queue = [];
    for (const s of this.sinks) {
      try {
        const r = s.send(batch);
        if (r && typeof (r as Promise<void>).catch === 'function') (r as Promise<void>).catch(() => {});
      } catch {}
    }
  }
}

export const analytics = new Analytics();
