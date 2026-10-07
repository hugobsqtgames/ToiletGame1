import { MaterialCommunityIcons } from '@expo/vector-icons';
import React, { useEffect, useRef } from 'react';
import { Animated, Easing, Pressable, StyleSheet, View, useWindowDimensions, type GestureResponderEvent } from 'react-native';
import { useAnimatedValue } from '../hooks';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { formatCount } from '../../core/format';
import { getWorld } from '../../core/worlds';
import type { MechanicId } from '../../core/types';
import { game } from '../../render/GameController';
import { markMechanicsSeen, pause } from '../../state/actions';
import { app } from '../../state/app';
import { hud } from '../../state/hud';
import { useStore } from '../../state/store';
import { getLanguage, t, tk } from '../i18n';
import { CoinIcon, GemIcon, KeyIcon, ProgressBar, Txt, styles as kit } from '../components/kit';
import { colors, radius, shadow } from '../theme';

const HIDDEN_INTRO: MechanicId[] = ['gate_add', 'gate_mul'];

export function PlayScreen() {
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const run = useStore(app, (s) => s.run);
  const modal = useStore(app, (s) => s.modal);
  const seen = useStore(app, (s) => s.save.seenMechanics);
  // Only slow-changing values here: fast ones (count, progress, coins) live in
  // small leaf components so a HUD tick never re-renders the whole screen.
  const phase = useStore(hud, (h) => h.phase);
  const stall = useStore(hud, (h) => h.stall);
  const touchId = useRef<string | null>(null);
  const lastX = useRef(0);
  const def = run?.def;
  const world = def ? getWorld(def.world) : null;
  const lang = getLanguage();

  const newMechs = def ? def.mechanics.filter((m) => !seen.includes(m) && !HIDDEN_INTRO.includes(m)).slice(0, 2) : [];
  useEffect(() => {
    if (phase === 'running' && newMechs.length) markMechanicsSeen(newMechs);
  }, [phase]); // eslint-disable-line react-hooks/exhaustive-deps

  // Touch steering: relative drag, only the first finger counts (multitouch-safe).
  const onStart = (e: GestureResponderEvent) => {
    const t0 = e.nativeEvent;
    touchId.current = String(t0.identifier);
    lastX.current = t0.pageX;
    if (hud.get().phase === 'ready') game.drag(0, width);
  };
  const onMove = (e: GestureResponderEvent) => {
    const touches = e.nativeEvent.touches?.length ? e.nativeEvent.touches : [e.nativeEvent];
    const tt = touches.find((x) => String(x.identifier) === touchId.current) ?? touches[0];
    if (!tt) return;
    const dx = tt.pageX - lastX.current;
    lastX.current = tt.pageX;
    if (dx !== 0) game.drag(dx, width);
  };
  const onEnd = () => {
    touchId.current = null;
  };

  const tutorial = def?.tutorial ?? false;
  const challenge = def?.challenge;

  return (
    <View style={StyleSheet.absoluteFill}>
      {/* Gesture surface */}
      <View
        style={StyleSheet.absoluteFill}
        onStartShouldSetResponder={() => !modal}
        onMoveShouldSetResponder={() => !modal}
        onResponderGrant={onStart}
        onResponderMove={onMove}
        onResponderRelease={onEnd}
        onResponderTerminate={onEnd}
        testID="touch-surface"
      />

      {/* Top HUD */}
      <View style={[s.top, { paddingTop: insets.top + 6 }]} pointerEvents="box-none">
        <Pressable onPress={pause} style={s.pauseBtn} hitSlop={10} testID="btn-pause" accessibilityLabel={t('paused')}>
          <MaterialCommunityIcons name="pause" size={24} color="#fff" />
        </Pressable>
        <View style={{ flex: 1, marginHorizontal: 10 }} pointerEvents="none">
          <View style={[kit.row, { justifyContent: 'space-between', marginBottom: 4 }]}>
            <Txt display size={16} color="#fff" outline>
              {run?.mode === 'daily' ? t('dailyChallenge') : def?.isBoss ? `${t('levelShort', { n: def.level })} · ${t('boss')}` : t('levelShort', { n: def?.level ?? 1 })}
            </Txt>
            <MaterialCommunityIcons name="toilet" size={20} color="#fff" />
          </View>
          <HudProgress color={world?.colors.ui[0] ?? colors.primary} />
        </View>
        <HudCollect />
      </View>

      {/* Ready state: level card, challenge, new mechanics, drag hint */}
      {phase === 'ready' && def && world ? (
        <View style={[s.readyWrap, { top: insets.top + 70 }]} pointerEvents="none">
          <View style={[s.levelCard, { backgroundColor: def.isBoss ? colors.danger : world.colors.ui[1] }]}>
            <Txt display size={13} color="rgba(255,255,255,0.85)">
              {t('world', { n: def.world })} · {world.displayName[lang]}
            </Txt>
            <Txt display size={34} color="#fff" outline>
              {run?.mode === 'daily' ? t('dailyChallenge') : def.isBoss ? t('bossLevel') : t('level', { n: def.level })}
            </Txt>
          </View>
          {run?.mode === 'daily' && def.mutators.length ? (
            <View style={s.infoCard}>
              <Txt display size={13} color={colors.purple}>{t('mutators')}</Txt>
              {def.mutators.map((m) => (
                <Txt key={m} size={13}>• {tk('mut_' + m)}</Txt>
              ))}
            </View>
          ) : null}
          {challenge && run?.mode === 'campaign' ? (
            <View style={[s.infoCard, kit.row]}>
              <MaterialCommunityIcons name="target" size={22} color={colors.purple} />
              <View style={{ marginLeft: 8, flexShrink: 1 }}>
                <Txt display size={12} color={colors.purple}>{t('challengeLabel')}</Txt>
                <Txt size={14}>{tk('ch_' + challenge.kind, { n: formatCount(challenge.target) })}</Txt>
              </View>
              <View style={[kit.row, { marginLeft: 8 }]}>
                <GemIcon size={18} />
                <Txt display size={15}>+{challenge.rewardGems}</Txt>
              </View>
            </View>
          ) : null}
          {newMechs.map((m) => (
            <View key={m} style={[s.infoCard, kit.row, { borderColor: colors.warn }]}>
              <View style={s.newTag}>
                <Txt display size={11} color="#fff">{t('newMechanic')}</Txt>
              </View>
              <Txt size={14} style={{ marginLeft: 8, flexShrink: 1 }}>{tk('mech_' + m)}</Txt>
            </View>
          ))}
        </View>
      ) : null}
      {phase === 'ready' && !modal ? <DragHint /> : null}

      {tutorial ? <TutorialHint /> : null}

      {phase === 'battle' ? <BattleBanner /> : null}

      {(phase === 'finish' || phase === 'won') && stall > 0 ? (
        <View style={[s.center, { top: '18%' }]} pointerEvents="none">
          <Txt display size={64} color={colors.gold} outline style={{ textShadowColor: '#7a4b00' }}>
            x{Number.isInteger(stall) ? stall : stall.toFixed(1)}
          </Txt>
        </View>
      ) : null}
    </View>
  );
}

function HudProgress({ color }: { color: string }) {
  // Quantized: the bar moves by whole pixels anyway.
  const progress = useStore(hud, (h) => Math.round(h.progress * 250) / 250);
  return <ProgressBar value={progress} color={color} height={14} track="rgba(20,26,60,0.45)" />;
}

function HudCollect() {
  const coins = useStore(hud, (h) => h.coins);
  const keys = useStore(hud, (h) => h.keys);
  return (
    <View style={s.collect} pointerEvents="none">
      <CoinIcon size={18} />
      <Txt display size={16} color="#fff" style={{ marginLeft: 4 }}>{coins}</Txt>
      {keys > 0 ? (
        <>
          <KeyIcon size={18} />
          <Txt display size={16} color="#fff">{keys}</Txt>
        </>
      ) : null}
    </View>
  );
}

function TutorialHint() {
  const insets = useSafeAreaInsets();
  const hint = useStore(hud, (h) => (h.phase !== 'running' ? null : h.progress < 0.16 ? 'tutGate' : h.progress > 0.5 && h.progress < 0.66 ? 'tutObstacle' : null));
  if (!hint) return null;
  return (
    <View style={[s.tutBubble, { top: insets.top + 90 }]} pointerEvents="none">
      <Txt display size={20} color={colors.ink} align="center">{t(hint)}</Txt>
    </View>
  );
}

function BattleBanner() {
  const count = useStore(hud, (h) => h.count);
  const rival = useStore(hud, (h) => h.rivalCount);
  return (
    <View style={[s.center, { top: '22%' }]} pointerEvents="none">
      <Txt display size={44} color={colors.danger} outline style={{ textShadowColor: '#fff' }}>{t('fight')}</Txt>
      <View style={kit.row}>
        <Txt display size={28} color="#fff" outline>{formatCount(count)}</Txt>
        <Txt display size={20} color={colors.gold} outline style={{ marginHorizontal: 10 }}>VS</Txt>
        <Txt display size={28} color={colors.danger} outline>{formatCount(rival)}</Txt>
      </View>
    </View>
  );
}

function DragHint() {
  const v = useAnimatedValue(0);
  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(v, { toValue: 1, duration: 700, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
        Animated.timing(v, { toValue: 0, duration: 700, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [v]);
  return (
    <View style={s.dragWrap} pointerEvents="none">
      <View style={s.dragTrack}>
        <MaterialCommunityIcons name="chevron-left" size={28} color="#fff" />
        <View style={{ flex: 1 }} />
        <MaterialCommunityIcons name="chevron-right" size={28} color="#fff" />
      </View>
      <Animated.View style={{ transform: [{ translateX: v.interpolate({ inputRange: [0, 1], outputRange: [-80, 80] }) }], marginTop: -38 }}>
        <MaterialCommunityIcons name="gesture-tap" size={64} color="#fff" style={{ textShadowColor: 'rgba(0,0,0,0.35)', textShadowRadius: 6 }} />
      </Animated.View>
      <Txt display size={24} color="#fff" outline style={{ marginTop: 6 }}>
        {t('dragToStart')}
      </Txt>
    </View>
  );
}

const s = StyleSheet.create({
  top: { position: 'absolute', left: 0, right: 0, top: 0, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12 },
  pauseBtn: { width: 44, height: 44, borderRadius: 14, backgroundColor: 'rgba(20,26,60,0.55)', alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: 'rgba(255,255,255,0.3)' },
  collect: { flexDirection: 'row', alignItems: 'center', backgroundColor: 'rgba(20,26,60,0.55)', borderRadius: 14, paddingHorizontal: 8, paddingVertical: 6, gap: 2 },
  readyWrap: { position: 'absolute', left: 16, right: 16, alignItems: 'center', gap: 8 },
  levelCard: { paddingHorizontal: 22, paddingVertical: 8, borderRadius: radius.l, alignItems: 'center', borderWidth: 3, borderColor: '#fff', ...shadow },
  infoCard: { backgroundColor: 'rgba(255,255,255,0.95)', borderRadius: radius.m, paddingHorizontal: 12, paddingVertical: 8, maxWidth: 340, borderWidth: 2, borderColor: colors.line, ...shadow },
  newTag: { backgroundColor: colors.warn, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8 },
  dragWrap: { position: 'absolute', left: 0, right: 0, bottom: '5%', alignItems: 'center' },
  dragTrack: { flexDirection: 'row', width: 230, height: 36, borderRadius: 18, backgroundColor: 'rgba(20,26,60,0.35)', alignItems: 'center', paddingHorizontal: 4 },
  tutBubble: { position: 'absolute', alignSelf: 'center', backgroundColor: '#fff', paddingHorizontal: 18, paddingVertical: 10, borderRadius: radius.l, borderWidth: 3, borderColor: colors.gold, ...shadow },
  center: { position: 'absolute', left: 0, right: 0, alignItems: 'center' },
});
