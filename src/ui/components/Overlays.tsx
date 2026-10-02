import { MaterialCommunityIcons } from '@expo/vector-icons';
import React, { useEffect, useState } from 'react';
import { Animated, StyleSheet, View } from 'react-native';
import { useAnimatedValue } from '../hooks';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { registerDevAdPresenter, type DevAdRequest } from '../../services/ads/devSim';
import { app } from '../../state/app';
import { useStore } from '../../state/store';
import { t } from '../i18n';
import { GameButton, Txt } from './kit';
import { colors, radius, shadow } from '../theme';

/** DEVELOPMENT ONLY: clearly-labeled simulated ad for Expo Go / web. */
export function DevAdOverlay() {
  const [req, setReq] = useState<DevAdRequest | null>(null);
  const [left, setLeft] = useState(3);
  useEffect(() => {
    registerDevAdPresenter((r) => {
      setLeft(r.kind === 'rewarded' ? 3 : 2);
      setReq(r);
    });
    return () => registerDevAdPresenter(null);
  }, []);
  useEffect(() => {
    if (!req || left <= 0) return;
    const id = setTimeout(() => setLeft((x) => x - 1), 1000);
    return () => clearTimeout(id);
  }, [req, left]);
  if (!req) return null;
  const done = left <= 0;
  const finish = (watched: boolean) => {
    const r = req;
    setReq(null);
    r.resolve(watched);
  };
  return (
    <View style={[StyleSheet.absoluteFill, s.ad]}>
      <MaterialCommunityIcons name="television-play" size={80} color="#fff" />
      <Txt display size={34} color="#fff">{t('testAd')}</Txt>
      <Txt size={14} color="#fff" align="center" style={{ marginHorizontal: 30, marginTop: 8 }}>{t('testAdDesc')}</Txt>
      <Txt display size={40} color={colors.gold} style={{ marginTop: 16 }}>{done ? '✓' : left}</Txt>
      <View style={{ flexDirection: 'row', gap: 10, marginTop: 16 }}>
        <GameButton label={t('testAdSkip')} size="s" color="#7F8BB0" dark="#5B6588" onPress={() => finish(false)} testID="devad-close" />
        <GameButton label={t('testAdFinish')} size="s" disabled={!done} onPress={() => finish(true)} testID="devad-done" />
      </View>
    </View>
  );
}

export function ToastHost() {
  const toast = useStore(app, (s) => s.toast);
  const insets = useSafeAreaInsets();
  const a = useAnimatedValue(0);
  useEffect(() => {
    if (!toast) return;
    a.setValue(0);
    Animated.sequence([
      Animated.spring(a, { toValue: 1, useNativeDriver: true, bounciness: 10 }),
      Animated.delay(1600),
      Animated.timing(a, { toValue: 0, duration: 250, useNativeDriver: true }),
    ]).start();
  }, [toast, a]);
  if (!toast) return null;
  const bg = toast.tone === 'good' ? colors.play : toast.tone === 'bad' ? colors.danger : colors.ink;
  return (
    <Animated.View pointerEvents="none" style={[s.toast, { top: insets.top + 60, backgroundColor: bg, opacity: a, transform: [{ translateY: a.interpolate({ inputRange: [0, 1], outputRange: [-20, 0] }) }] }]}>
      <Txt display size={16} color="#fff" align="center">{toast.text}</Txt>
    </Animated.View>
  );
}

const s = StyleSheet.create({
  ad: { backgroundColor: '#111428', alignItems: 'center', justifyContent: 'center', zIndex: 100 },
  toast: { position: 'absolute', alignSelf: 'center', paddingHorizontal: 18, paddingVertical: 10, borderRadius: radius.l, borderWidth: 3, borderColor: '#fff', ...shadow, zIndex: 90 },
});
