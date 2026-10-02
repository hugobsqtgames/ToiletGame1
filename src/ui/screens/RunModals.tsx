import { MaterialCommunityIcons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import React, { useEffect, useRef, useState } from 'react';
import { Animated, Easing, StyleSheet, View } from 'react-native';
import { formatCount } from '../../core/format';
import { getWorld } from '../../core/worlds';
import { CHEST_WINS, REVIVE_GEMS } from '../../meta/economy';
import { skinById } from '../../meta/skins';
import { ads } from '../../services/ads/AdService';
import { audio } from '../../services/audio';
import {
  closeModal, continueAfterResults, declineRevive, goHome, markWorldSeen, restartLevel, resume, reviveWithAd, reviveWithGems, tripleCoins, updateSettings,
} from '../../state/actions';
import { app } from '../../state/app';
import { useStore } from '../../state/store';
import { getLanguage, t, tk } from '../i18n';
import { CoinIcon, CountUp, GameButton, GemIcon, IconButton, Pulse, RewardChips, Sheet, Txt, styles as kit } from '../components/kit';
import { colors, radius, shadow } from '../theme';

/* ---------------- Pause ---------------- */

export function PauseModal() {
  const settings = useStore(app, (s) => s.save.settings);
  return (
    <Sheet title={t('paused')} headerColor={colors.primary}>
      <View style={{ gap: 12, alignItems: 'center' }}>
        <View style={[kit.row, { gap: 12 }]}>
          <Toggle icon={settings.music ? 'music' : 'music-off'} on={settings.music} onPress={() => updateSettings({ music: !settings.music })} />
          <Toggle icon={settings.sfx ? 'volume-high' : 'volume-off'} on={settings.sfx} onPress={() => updateSettings({ sfx: !settings.sfx })} />
          <Toggle icon={settings.haptics ? 'vibrate' : 'vibrate-off'} on={settings.haptics} onPress={() => updateSettings({ haptics: !settings.haptics })} />
        </View>
        <GameButton label={t('resume')} icon="play" onPress={resume} style={{ width: 240 }} testID="btn-resume" />
        <View style={[kit.row, { gap: 10 }]}>
          <GameButton label={t('restart')} icon="refresh" size="s" color={colors.warn} dark={colors.warnDark} onPress={restartLevel} />
          <GameButton label={t('home')} icon="home" size="s" color={colors.primary} dark={colors.primaryDark} onPress={goHome} testID="btn-home" />
        </View>
      </View>
    </Sheet>
  );
}

function Toggle({ icon, on, onPress }: { icon: React.ComponentProps<typeof MaterialCommunityIcons>['name']; on: boolean; onPress: () => void }) {
  return <IconButton icon={icon} onPress={onPress} color={on ? colors.play : '#9AA4B8'} size={54} />;
}

/* ---------------- Revive ---------------- */

const REVIVE_SECONDS = 6;

export function ReviveModal() {
  const n = useStore(app, (s) => s.reviveCount);
  const gems = useStore(app, (s) => s.save.gems);
  useStore(app, (s) => s.storeTick);
  const [left, setLeft] = useState(REVIVE_SECONDS);
  const [busy, setBusy] = useState(false);
  const ring = useRef(new Animated.Value(1)).current;
  useEffect(() => {
    Animated.timing(ring, { toValue: 0, duration: REVIVE_SECONDS * 1000, easing: Easing.linear, useNativeDriver: false }).start();
    const id = setInterval(() => setLeft((x) => x - 1), 1000);
    return () => clearInterval(id);
  }, [ring]);
  useEffect(() => {
    if (left <= 0 && !busy) declineRevive();
  }, [left, busy]);
  const canAd = ads.rewardedReady();
  return (
    <Sheet title={t('revive')} headerColor={colors.danger}>
      <View style={{ alignItems: 'center', gap: 12 }}>
        <View style={s.timer}>
          <Animated.View style={[s.timerFill, { height: ring.interpolate({ inputRange: [0, 1], outputRange: ['0%', '100%'] }) }]} />
          <Txt display size={44} color="#fff" outline>{Math.max(0, left)}</Txt>
        </View>
        <Txt size={16} align="center">{t('reviveDesc', { n: formatCount(n) })}</Txt>
        {canAd ? (
          <Pulse>
            <GameButton
              label={t('watchAd')}
              icon="play-box"
              onPress={async () => {
                setBusy(true);
                await reviveWithAd();
                setBusy(false);
              }}
              style={{ width: 250 }}
              testID="btn-revive-ad"
            />
          </Pulse>
        ) : null}
        {gems >= REVIVE_GEMS ? (
          <GameButton
            label={t('reviveGems', { n: REVIVE_GEMS })}
            icon={<View style={{ marginRight: 6 }}><GemIcon size={22} /></View>}
            size="m"
            color={colors.gem}
            dark={colors.gemDark}
            onPress={reviveWithGems}
            style={{ width: 220 }}
            testID="btn-revive-gems"
          />
        ) : null}
        <GameButton label={t('noThanks')} size="s" color="#9AA4B8" dark="#6E7891" onPress={declineRevive} testID="btn-revive-no" />
      </View>
    </Sheet>
  );
}

/* ---------------- Results ---------------- */

const TIPS = ['tipLow', 'tipWalls', 'tipUpgrade', 'tipGates'] as const;

export function ResultsModal() {
  const results = useStore(app, (s) => s.results);
  const save = useStore(app, (s) => s.save);
  useStore(app, (s) => s.storeTick);
  const pop = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.spring(pop, { toValue: 1, useNativeDriver: true, speed: 8, bounciness: 14 }).start();
  }, [pop]);
  if (!results) return null;
  const { result, rewards, tripled } = results;
  const won = result.won;
  const coins = rewards.coins + (tripled ? rewards.adBonusCoins : 0);
  const canTriple = won && !tripled && ads.rewardedReady();
  const tip = TIPS[(result.level + result.stats.gatesTaken) % TIPS.length];

  return (
    <View style={[StyleSheet.absoluteFill, kit.center, { backgroundColor: colors.scrim }]}>
      <Animated.View style={{ alignItems: 'center', transform: [{ scale: pop }] }}>
        <Txt display size={won ? 54 : 50} color={won ? colors.gold : colors.danger} outline style={s.title}>
          {won ? (result.perfect ? t('perfect') : t('victory')) : t('defeat')}
        </Txt>
      </Animated.View>
      <View style={s.card}>
        {won ? (
          <>
            <View style={[kit.row, { justifyContent: 'space-around', width: '100%' }]}>
              <Stat label={t('finishCrowd')} value={<CountUp to={result.finishCount} size={30} />} icon="account-group" />
              <Stat label={t('multiplier')} value={<Txt display size={30} color={colors.goldDark}>x{Number.isInteger(result.multiplier) ? result.multiplier : result.multiplier.toFixed(1)}</Txt>} icon="toilet" />
            </View>
            <View style={s.coinsBox}>
              <CoinIcon size={34} />
              <View style={{ marginLeft: 8 }}>
                <CountUp to={coins} size={40} color={colors.goldDark} prefix="+" />
              </View>
            </View>
          </>
        ) : (
          <>
            <Txt size={15} color={colors.inkSoft} align="center">{t('defeatSub')}</Txt>
            <Txt display size={22} style={{ marginTop: 6 }}>{t('progressPct', { n: Math.round(result.progress * 100) })}</Txt>
            <View style={s.coinsBox}>
              <CoinIcon size={26} />
              <Txt display size={28} color={colors.goldDark} style={{ marginLeft: 8 }}>+{coins}</Txt>
            </View>
            <View style={s.tip}>
              <MaterialCommunityIcons name="lightbulb-on" size={18} color={colors.warnDark} />
              <Txt size={13} style={{ marginLeft: 6, flexShrink: 1 }}>{t(tip)}</Txt>
            </View>
          </>
        )}
        {result.challenge && won ? (
          <View style={[kit.row, s.line]}>
            <MaterialCommunityIcons name={rewards.challengeDone ? 'check-decagram' : 'close-octagon'} size={20} color={rewards.challengeDone ? colors.play : colors.danger} />
            <Txt size={14} style={{ marginLeft: 6, flexShrink: 1 }}>
              {rewards.challengeDone ? t('challengeDone', { n: result.challenge.rewardGems }) : `${t('challengeFailed')}: ${tk('ch_' + result.challenge.kind, { n: formatCount(result.challenge.target) })}`}
            </Txt>
            {rewards.challengeDone ? <GemIcon size={18} /> : null}
          </View>
        ) : null}
        {rewards.keys > 0 ? (
          <View style={[kit.row, s.line]}>
            <MaterialCommunityIcons name="key-variant" size={20} color={colors.gold} />
            <Txt size={14} style={{ marginLeft: 6 }}>{t('keysFound', { n: rewards.keys })}</Txt>
          </View>
        ) : null}
        {rewards.completedMissions > 0 ? (
          <View style={[kit.row, s.line]}>
            <MaterialCommunityIcons name="clipboard-check" size={20} color={colors.warn} />
            <Txt size={14} style={{ marginLeft: 6 }}>{t('missionsDone', { n: rewards.completedMissions })}</Txt>
          </View>
        ) : null}
        {won && result.mode === 'campaign' ? (
          <View style={[kit.row, s.line]}>
            <MaterialCommunityIcons name="treasure-chest" size={20} color="#C68B59" />
            <View style={[kit.row, { gap: 4, marginLeft: 8 }]}>
              {Array.from({ length: CHEST_WINS }, (_, i) => (
                <View key={i} style={[s.meter, (rewards.chestReady || i < save.chest.progress) && { backgroundColor: colors.gold }]} />
              ))}
            </View>
            {rewards.chestReady ? <Txt display size={14} color={colors.goldDark} style={{ marginLeft: 8 }}>{t('chestReady')}</Txt> : null}
          </View>
        ) : null}
      </View>

      <View style={{ gap: 10, alignItems: 'center', marginTop: 14 }}>
        {canTriple ? (
          <Pulse>
            <GameButton
              label={t('tripleCoins')}
              icon="play-box"
              color={colors.gold}
              dark={colors.goldDark}
              onPress={tripleCoins}
              style={{ width: 260 }}
              sub={<View style={kit.row}><CoinIcon size={14} /><Txt display size={13} color="#fff" style={{ marginLeft: 4 }}>{formatCount(rewards.coins * 3)}</Txt></View>}
              testID="btn-triple"
            />
          </Pulse>
        ) : null}
        <GameButton
          label={won ? (result.mode === 'daily' ? t('home') : t('next')) : t('retry')}
          icon={won ? 'arrow-right-bold' : 'refresh'}
          color={won ? colors.play : colors.primary}
          dark={won ? colors.playDark : colors.primaryDark}
          onPress={() => continueAfterResults(won ? 'next' : 'retry')}
          style={{ width: 260 }}
          size={canTriple ? 'm' : 'l'}
          testID="btn-next"
        />
        <GameButton label={t('home')} icon="home" size="s" color="#7F8BB0" dark="#5B6588" onPress={() => continueAfterResults('home')} testID="btn-results-home" />
      </View>
    </View>
  );
}

function Stat({ label, value, icon }: { label: string; value: React.ReactNode; icon: React.ComponentProps<typeof MaterialCommunityIcons>['name'] }) {
  return (
    <View style={{ alignItems: 'center' }}>
      <View style={kit.row}>
        <MaterialCommunityIcons name={icon} size={16} color={colors.inkSoft} />
        <Txt size={13} color={colors.inkSoft} style={{ marginLeft: 4 }}>{label}</Txt>
      </View>
      {value}
    </View>
  );
}

/* ---------------- World unlock ---------------- */

export function WorldUnlockModal() {
  const level = useStore(app, (s) => s.save.level);
  const results = useStore(app, (s) => s.results);
  const w = getWorld(Math.floor((level - 1) / 10) + 1);
  const lang = getLanguage();
  const spin = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    audio.play('unlock');
    const loop = Animated.loop(Animated.timing(spin, { toValue: 1, duration: 6000, easing: Easing.linear, useNativeDriver: true }));
    loop.start();
    return () => loop.stop();
  }, [spin]);
  const skin = results?.rewards.worldSkin ? skinById(results.rewards.worldSkin) : null;
  return (
    <View style={[StyleSheet.absoluteFill, kit.center, { backgroundColor: colors.scrim }]}>
      <Animated.View style={[s.rays, { transform: [{ rotate: spin.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '360deg'] }) }] }]}>
        {Array.from({ length: 12 }, (_, i) => (
          <View key={i} style={[s.ray, { transform: [{ rotate: `${i * 30}deg` }] }]} />
        ))}
      </Animated.View>
      <Txt display size={46} color={colors.gold} outline style={s.title}>{t('worldUnlocked')}</Txt>
      <LinearGradient colors={[w.colors.skyTop, w.colors.ui[1]]} style={s.worldCard}>
        <Txt display size={16} color="rgba(255,255,255,0.9)">{t('world', { n: w.world })}</Txt>
        <Txt display size={32} color="#fff" outline align="center">{w.displayName[lang]}</Txt>
        <Txt size={14} color="#fff" align="center" style={{ marginTop: 4 }}>{w.theme.tagline[lang]}</Txt>
        <View style={[kit.row, { gap: 6, marginTop: 10 }]}>
          {[w.colors.tileA, w.colors.wall, w.colors.accent, w.colors.rail].map((c, i) => (
            <View key={i} style={{ width: 26, height: 26, borderRadius: 8, backgroundColor: c, borderWidth: 2, borderColor: '#fff' }} />
          ))}
        </View>
      </LinearGradient>
      {skin ? (
        <View style={[s.card, { marginTop: 12, flexDirection: 'row', alignItems: 'center', width: 300 }]}>
          <View style={[s.skinDot, { backgroundColor: skin.body }]}>
            <View style={[s.skinHead, { backgroundColor: skin.skin }]} />
          </View>
          <View style={{ marginLeft: 10 }}>
            <Txt display size={13} color={colors.purple}>{t('newSkin')}</Txt>
            <Txt display size={20}>{skin.name[lang]}</Txt>
          </View>
        </View>
      ) : null}
      <GameButton
        label={t('ok')}
        onPress={() => {
          markWorldSeen();
          closeModal();
        }}
        style={{ width: 200, marginTop: 16 }}
        testID="btn-world-ok"
      />
    </View>
  );
}

/* ---------------- Generic reward popup ---------------- */

export function RewardModal() {
  const popup = useStore(app, (s) => s.rewardPopup);
  if (!popup) return null;
  return (
    <Sheet title={t('youGot')} headerColor={colors.play} compact>
      <View style={{ alignItems: 'center', gap: 14, paddingVertical: 6 }}>
        <Txt display size={20}>{popup.title}</Txt>
        <RewardChips reward={popup.reward} size="l" />
        <GameButton label={t('ok')} onPress={closeModal} style={{ width: 200 }} testID="btn-reward-ok" />
      </View>
    </Sheet>
  );
}

const s = StyleSheet.create({
  title: { textShadowColor: '#3b2a00', textShadowOffset: { width: 0, height: 4 }, letterSpacing: 1 },
  card: { width: '88%', maxWidth: 400, backgroundColor: colors.paper, borderRadius: radius.xl, padding: 16, alignItems: 'center', borderWidth: 4, borderColor: '#fff', ...shadow },
  coinsBox: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#FFF3C4', borderRadius: radius.l, paddingHorizontal: 18, paddingVertical: 8, marginTop: 12, borderWidth: 2, borderColor: colors.gold },
  line: { alignSelf: 'stretch', marginTop: 10, backgroundColor: '#fff', borderRadius: radius.s, padding: 8, borderWidth: 2, borderColor: colors.line },
  meter: { width: 26, height: 10, borderRadius: 5, backgroundColor: colors.line },
  tip: { flexDirection: 'row', alignItems: 'center', marginTop: 10, backgroundColor: '#FFF1D6', borderRadius: radius.s, padding: 8 },
  timer: { width: 110, height: 110, borderRadius: 55, backgroundColor: colors.dangerDark, alignItems: 'center', justifyContent: 'center', overflow: 'hidden', borderWidth: 4, borderColor: '#fff' },
  timerFill: { position: 'absolute', bottom: 0, left: 0, right: 0, backgroundColor: colors.danger },
  rays: { position: 'absolute', width: 700, height: 700, alignItems: 'center', justifyContent: 'center', opacity: 0.25 },
  ray: { position: 'absolute', width: 60, height: 700, backgroundColor: colors.gold },
  worldCard: { width: 310, borderRadius: radius.xl, padding: 18, alignItems: 'center', borderWidth: 4, borderColor: '#fff', marginTop: 10, ...shadow },
  skinDot: { width: 44, height: 52, borderRadius: 22, alignItems: 'center', justifyContent: 'flex-start', paddingTop: 2 },
  skinHead: { width: 30, height: 30, borderRadius: 15, marginTop: -10, borderWidth: 2, borderColor: '#fff' },
});
