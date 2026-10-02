import * as Haptics from 'expo-haptics';
import { isWeb } from './platform';

let enabled = true;
let last = 0;

export const haptics = {
  setEnabled(v: boolean) {
    enabled = v;
  },
  /** Throttled so rapid events (losses) don't buzz continuously. */
  light() {
    fire(() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light), 60);
  },
  medium() {
    fire(() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium), 80);
  },
  heavy() {
    fire(() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy), 120);
  },
  success() {
    fire(() => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success), 0);
  },
  error() {
    fire(() => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error), 0);
  },
  select() {
    fire(() => Haptics.selectionAsync(), 40);
  },
};

function fire(fn: () => Promise<void>, minGapMs: number) {
  if (!enabled || isWeb) return;
  const now = Date.now();
  if (now - last < minGapMs) return;
  last = now;
  fn().catch(() => {});
}
