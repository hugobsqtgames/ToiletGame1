import { MaterialCommunityIcons } from '@expo/vector-icons';
import React, { useEffect, useState } from 'react';
import { Animated, StyleSheet, View } from 'react-native';
import { useAnimatedValue } from '../hooks';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { registerDevAdPresenter, type DevAdRequest } from '../../services/ads/devSim';
import { registerDevPurchasePresenter, type DevPurchaseRequest } from '../../services/iap/IapService';
import { productById } from '../../services/iap/catalog';
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
  payScrim: { backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'flex-end', zIndex: 100 },
  paySheet: { backgroundColor: '#F7F7FA', borderTopLeftRadius: 22, borderTopRightRadius: 22, padding: 18, alignItems: 'stretch' },
  payHandle: { alignSelf: 'center', width: 40, height: 5, borderRadius: 3, backgroundColor: '#C9CCD6', marginBottom: 10 },
  payRow: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#fff', borderRadius: radius.m, padding: 12, marginTop: 8 },
  ad: { backgroundColor: '#111428', alignItems: 'center', justifyContent: 'center', zIndex: 100 },
  toast: { position: 'absolute', alignSelf: 'center', paddingHorizontal: 18, paddingVertical: 10, borderRadius: radius.l, borderWidth: 3, borderColor: '#fff', ...shadow, zIndex: 90 },
});

/** DEVELOPMENT ONLY: simulated StoreKit confirmation sheet (no payment happens). */
export function DevPurchaseOverlay() {
  const [req, setReq] = useState<DevPurchaseRequest | null>(null);
  const insets = useSafeAreaInsets();
  useEffect(() => {
    registerDevPurchasePresenter(setReq);
    return () => registerDevPurchasePresenter(null);
  }, []);
  if (!req) return null;
  const done = (ok: boolean) => {
    const r = req;
    setReq(null);
    r.resolve(ok);
  };
  const p = productById(req.productId);
  return (
    <View style={[StyleSheet.absoluteFill, s.payScrim]}>
      <View style={[s.paySheet, { paddingBottom: insets.bottom + 16 }]}>
        <View style={s.payHandle} />
        <Txt display size={13} color={colors.danger}>{t('sandboxTitle')}</Txt>
        <View style={s.payRow}>
          <MaterialCommunityIcons name="toilet" size={44} color={colors.primary} />
          <View style={{ marginLeft: 12, flex: 1 }}>
            <Txt display size={18}>Loo Rush</Txt>
            <Txt size={13} color={colors.inkSoft}>{p?.id}</Txt>
          </View>
          <Txt display size={20}>{req.price}</Txt>
        </View>
        <Txt size={13} color={colors.inkSoft} align="center" style={{ marginVertical: 10 }}>{t('sandboxDesc')}</Txt>
        <GameButton label={t('sandboxConfirm')} icon="check-bold" color={colors.primary} dark={colors.primaryDark} onPress={() => done(true)} testID="devpay-confirm" />
        <GameButton label={t('cancel')} size="s" color="#9AA4B8" dark="#6E7891" onPress={() => done(false)} style={{ marginTop: 10, alignSelf: 'center' }} testID="devpay-cancel" />
      </View>
    </View>
  );
}
