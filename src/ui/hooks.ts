import { Animated } from 'react-native';
import { useEffect, useState } from 'react';

/** Current time, refreshed every `intervalMs` (keeps render pure; timers stay live). */
export function useNow(intervalMs = 30_000): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(id);
  }, [intervalMs]);
  return now;
}

/** Stable Animated.Value (cross-platform; react-native-web lacks useAnimatedValue). */
export function useAnimatedValue(initial: number): Animated.Value {
  const [v] = useState(() => new Animated.Value(initial));
  return v;
}
