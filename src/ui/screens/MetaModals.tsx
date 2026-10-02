import { MaterialCommunityIcons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import React, { useState } from 'react';
import { Alert, Linking, Platform, Pressable, ScrollView, StyleSheet, Switch, View } from 'react-native';
import { LEVELS_PER_WORLD } from '../../core/config';
import { formatCount, formatDuration } from '../../core/format';
import { getWorld, worldOfLevel } from '../../core/worlds';
import { DAILY_CYCLE, dailyRewardFor, dailyStatus } from '../../meta/daily';
import { ACHIEVEMENTS, achievementState } from '../../meta/missions';
import { dailyChallengeStatus } from '../../meta/progression';
import type { MissionState, QualitySetting, LanguageSetting } from '../../meta/save';
import { msUntilNextWeek, msUntilTomorrow } from '../../meta/time';
import { ads } from '../../services/ads/AdService';
import { appVersion } from '../../services/platform';
import { claimAchievement, claimDaily, claimMission, closeModal, resetProgress, restorePurchases, startDailyChallenge, updateSettings } from '../../state/actions';
import { app } from '../../state/app';
import { useStore } from '../../state/store';
import { useNow } from '../hooks';
import { getLanguage, t, tk } from '../i18n';
import { GameButton, ProgressBar, RewardChips, Sheet, Txt, styles as kit } from '../components/kit';
import { colors, radius } from '../theme';

/** Replace with the hosted privacy policy URL before release (docs/APP_STORE.md). */
export const PRIVACY_POLICY_URL = 'https://example.com/loorush/privacy';

/* ---------------- Daily ---------------- */

export function DailyModal() {
  const now = useNow();
  const save = useStore(app, (s) => s.save);
  const st = dailyStatus(save, now);
  return (
    <Sheet title={t('dailyTitle')} onClose={closeModal} headerColor="#FF5FA2">
      <View style={s.grid}>
        {Array.from({ length: DAILY_CYCLE }, (_, i) => {
          const r = dailyRewardFor(i, save.level);
          const isToday = i === st.dayIndex && st.canClaim;
          const doneUpto = st.canClaim ? (st.broken ? -1 : st.dayIndex - 1) : (save.daily.streak - 1) % DAILY_CYCLE;
          const done = i <= doneUpto;
          const big = i === DAILY_CYCLE - 1;
          return (
            <View key={i} style={[s.day, big && s.dayBig, isToday && s.dayToday, done && s.dayDone]}>
              <Txt display size={13} color={isToday ? '#fff' : colors.inkSoft}>{t('day', { n: i + 1 })}</Txt>
              <View style={{ marginVertical: 4 }}>
                {r.chest ? (
                  <MaterialCommunityIcons name="treasure-chest" size={big ? 40 : 30} color={r.chest === 'epic' ? colors.gold : '#C68B59'} />
                ) : r.gems ? (
                  <MaterialCommunityIcons name="diamond-stone" size={30} color={colors.gem} />
                ) : r.keys ? (
                  <MaterialCommunityIcons name="key-variant" size={30} color={colors.gold} />
                ) : (
                  <MaterialCommunityIcons name="circle-multiple" size={30} color={colors.gold} />
                )}
              </View>
              <Txt display size={13} color={isToday ? '#fff' : colors.ink}>
                {r.coins ? formatCount(r.coins) : r.gems && !r.chest ? `${r.gems}` : r.keys ? `x${r.keys}` : big ? `+${r.gems}` : ''}
              </Txt>
              {done ? <MaterialCommunityIcons name="check-circle" size={20} color={colors.play} style={s.check} /> : null}
            </View>
          );
        })}
      </View>
      <Txt size={13} color={colors.inkSoft} align="center" style={{ marginTop: 10 }}>
        {st.broken ? t('dailyMissed') : t('dailyStreak', { n: save.daily.streak })}
      </Txt>
      <View style={{ alignItems: 'center', marginTop: 10 }}>
        {st.canClaim ? (
          <GameButton label={t('claim')} icon="gift" onPress={claimDaily} style={{ width: 230 }} testID="btn-claim-daily" />
        ) : (
          <Txt display size={16} color={colors.inkSoft}>{t('dailyCome')} · {formatDuration(msUntilTomorrow(now))}</Txt>
        )}
      </View>
    </Sheet>
  );
}

/* ---------------- Missions ---------------- */

export function MissionsModal() {
  const now = useNow();
  const save = useStore(app, (s) => s.save);
  const [tab, setTab] = useState<'daily' | 'weekly' | 'ach'>('daily');
  return (
    <Sheet title={t('missions')} onClose={closeModal} headerColor={colors.warn}>
      <View style={s.tabs}>
        {(['daily', 'weekly', 'ach'] as const).map((k) => (
          <Pressable key={k} onPress={() => setTab(k)} style={[s.tab, tab === k && s.tabOn]} testID={`tab-${k}`}>
            <Txt display size={15} color={tab === k ? '#fff' : colors.inkSoft}>
              {k === 'daily' ? t('tabDaily') : k === 'weekly' ? t('tabWeekly') : t('tabAchievements')}
            </Txt>
          </Pressable>
        ))}
      </View>
      <ScrollView style={{ maxHeight: 440 }} contentContainerStyle={{ gap: 10, paddingBottom: 6 }}>
        {tab !== 'ach' ? (
          <>
            <Txt size={12} color={colors.inkSoft} align="center">
              {t('resetsIn', { t: formatDuration(tab === 'daily' ? msUntilTomorrow(now) : msUntilNextWeek(now)) })}
            </Txt>
            {(tab === 'daily' ? save.missions.daily : save.missions.weekly).map((m) => (
              <MissionRow key={m.id} m={m} />
            ))}
          </>
        ) : (
          ACHIEVEMENTS.map((a) => {
            const st = achievementState(save, a);
            return (
              <View key={a.id} style={s.mission}>
                <View style={[s.mIcon, { backgroundColor: colors.purple }]}>
                  <MaterialCommunityIcons name={a.icon as never} size={22} color="#fff" />
                </View>
                <View style={{ flex: 1, marginHorizontal: 10 }}>
                  <Txt display size={15}>{tk('ach_' + a.id)} · {t('tier', { n: st.tier + 1 })}</Txt>
                  <Txt size={12} color={colors.inkSoft}>{tk('achDesc_' + a.id, { n: formatCount(st.target) })}</Txt>
                  <ProgressBar value={st.value / st.target} color={colors.purple} track={colors.line} height={9} style={{ marginTop: 4 }} />
                  <Txt size={11} color={colors.inkSoft}>{formatCount(Math.min(st.value, st.target))}/{formatCount(st.target)}</Txt>
                </View>
                <ClaimBox reward={st.reward} can={st.claimable} onPress={() => claimAchievement(a.id)} testID={`claim-ach-${a.id}`} />
              </View>
            );
          })
        )}
      </ScrollView>
    </Sheet>
  );
}

function MissionRow({ m }: { m: MissionState }) {
  const done = m.progress >= m.target;
  return (
    <View style={[s.mission, m.claimed && { opacity: 0.55 }]}>
      <View style={[s.mIcon, { backgroundColor: done ? colors.play : colors.warn }]}>
        <MaterialCommunityIcons name={done ? 'check-bold' : 'flag-variant'} size={22} color="#fff" />
      </View>
      <View style={{ flex: 1, marginHorizontal: 10 }}>
        <Txt size={14}>{tk('metric_' + m.metric, { n: formatCount(m.target) })}</Txt>
        <ProgressBar value={m.progress / m.target} color={done ? colors.play : colors.warn} track={colors.line} height={9} style={{ marginTop: 4 }} />
        <Txt size={11} color={colors.inkSoft}>{formatCount(m.progress)}/{formatCount(m.target)}</Txt>
      </View>
      {m.claimed ? <Txt size={12} color={colors.inkSoft}>{t('claimed')}</Txt> : <ClaimBox reward={m.reward} can={done} onPress={() => claimMission(m.id)} testID={`claim-${m.id}`} />}
    </View>
  );
}

function ClaimBox({ reward, can, onPress, testID }: { reward: MissionState['reward']; can: boolean; onPress: () => void; testID?: string }) {
  return (
    <Pressable onPress={onPress} disabled={!can} testID={testID} style={[s.claim, { backgroundColor: can ? colors.play : '#EEF1FA' }]}>
      <RewardChips reward={reward} size="s" />
      {can ? <Txt display size={12} color="#fff" style={{ marginTop: 2 }}>{t('claim')}</Txt> : null}
    </Pressable>
  );
}

/* ---------------- Challenges ---------------- */

export function ChallengesModal() {
  const now = useNow();
  const save = useStore(app, (s) => s.save);
  const dc = dailyChallengeStatus(save, now);
  return (
    <Sheet title={t('challenges')} onClose={closeModal} headerColor={colors.purple}>
      <View style={{ gap: 12 }}>
        <LinearGradient colors={['#A27BFF', '#6C4BE0']} style={s.dcCard}>
          <View style={kit.row}>
            <MaterialCommunityIcons name="calendar-star" size={34} color="#fff" />
            <View style={{ marginLeft: 10, flex: 1 }}>
              <Txt display size={22} color="#fff" outline>{t('dailyChallenge')}</Txt>
              <Txt size={13} color="#fff">{t('dailyChallengeDesc')}</Txt>
            </View>
          </View>
          <Txt size={13} color="#FFE48A" style={{ marginTop: 8 }}>{dc.completed ? t('dailyChallengeDone', { n: formatCount(dc.best) }) : t('dailyChallengeReward')}</Txt>
          <GameButton label={t('play')} icon="play" size="m" color={dc.completed ? '#9AA4B8' : colors.play} dark={dc.completed ? '#6E7891' : colors.playDark} onPress={startDailyChallenge} style={{ marginTop: 10, alignSelf: 'center', width: 200 }} testID="btn-daily-challenge" />
          <Txt size={11} color="rgba(255,255,255,0.8)" align="center" style={{ marginTop: 6 }}>{t('resetsIn', { t: formatDuration(msUntilTomorrow(now)) })}</Txt>
        </LinearGradient>
        <View style={s.mission}>
          <View style={[s.mIcon, { backgroundColor: colors.primary }]}>
            <MaterialCommunityIcons name="target" size={22} color="#fff" />
          </View>
          <View style={{ flex: 1, marginLeft: 10 }}>
            <Txt display size={16}>{t('levelChallenges')}</Txt>
            <Txt size={12} color={colors.inkSoft}>{t('levelChallengesDesc')}</Txt>
            <Txt display size={14} color={colors.primary} style={{ marginTop: 4 }}>{t('challengesCompleted', { n: save.stats.challenges })}</Txt>
          </View>
        </View>
      </View>
    </Sheet>
  );
}

/* ---------------- Worlds (infinite) ---------------- */

export function WorldsModal() {
  const level = useStore(app, (s) => s.save.level);
  const lang = getLanguage();
  const cur = worldOfLevel(level);
  const worlds = Array.from({ length: cur + 3 }, (_, i) => cur + 2 - i).filter((w) => w >= 1);
  return (
    <Sheet title={t('worldMapTitle')} onClose={closeModal} headerColor={colors.primary}>
      <ScrollView style={{ maxHeight: 500 }} contentContainerStyle={{ gap: 10 }}>
        <Txt size={12} color={colors.inkSoft} align="center">{t('infiniteWorlds')} ∞</Txt>
        {worlds.map((wn) => {
          const w = getWorld(wn);
          const locked = wn > cur;
          const done = wn < cur;
          const levelsDone = done ? LEVELS_PER_WORLD : wn === cur ? (level - 1) % LEVELS_PER_WORLD : 0;
          return (
            <LinearGradient key={wn} colors={locked ? ['#B8BFD6', '#8F98B5'] : [w.colors.skyTop, w.colors.ui[1]]} style={[s.worldRow, wn === cur && { borderColor: colors.gold }]}>
              <View style={s.worldNum}>
                {locked ? <MaterialCommunityIcons name="lock" size={22} color="#fff" /> : <Txt display size={20} color="#fff">{wn}</Txt>}
              </View>
              <View style={{ flex: 1, marginLeft: 10 }}>
                <Txt display size={18} color="#fff" outline numberOfLines={1}>{locked && wn > cur + 1 ? '???' : w.displayName[lang]}</Txt>
                <Txt size={12} color="rgba(255,255,255,0.92)">
                  {wn === cur ? `${t('currentWorld')} · ` : ''}
                  {t('levelsDone', { n: levelsDone, m: LEVELS_PER_WORLD })}
                  {w.cycle > 0 ? ` · ${t('remix')}` : ''}
                </Txt>
                <ProgressBar value={levelsDone / LEVELS_PER_WORLD} height={7} color="#fff" style={{ marginTop: 4 }} />
              </View>
              {done ? <MaterialCommunityIcons name="check-decagram" size={26} color="#fff" style={{ marginLeft: 8 }} /> : null}
            </LinearGradient>
          );
        })}
      </ScrollView>
    </Sheet>
  );
}

/* ---------------- Settings ---------------- */

export function SettingsModal() {
  const settings = useStore(app, (s) => s.save.settings);
  useStore(app, (s) => s.lang);
  const row = (label: string, value: boolean, key: 'music' | 'sfx' | 'haptics' | 'analytics', icon: string) => (
    <View style={s.setRow}>
      <MaterialCommunityIcons name={icon as never} size={22} color={colors.primary} />
      <Txt size={15} style={{ flex: 1, marginLeft: 10 }}>{label}</Txt>
      <Switch value={value} onValueChange={(v) => updateSettings({ [key]: v })} trackColor={{ true: colors.play, false: '#C9CFE0' }} testID={`switch-${key}`} />
    </View>
  );
  const seg = <T extends string>(label: string, icon: string, value: T, opts: [T, string][], on: (v: T) => void) => (
    <View style={s.setRow}>
      <MaterialCommunityIcons name={icon as never} size={22} color={colors.primary} />
      <Txt size={15} style={{ flex: 1, marginLeft: 10 }}>{label}</Txt>
      <View style={s.seg}>
        {opts.map(([v, l]) => (
          <Pressable key={v} onPress={() => on(v)} style={[s.segItem, value === v && s.segOn]}>
            <Txt display size={12} color={value === v ? '#fff' : colors.inkSoft}>{l}</Txt>
          </Pressable>
        ))}
      </View>
    </View>
  );
  return (
    <Sheet title={t('settings')} onClose={closeModal} headerColor="#5B6A9A">
      <ScrollView style={{ maxHeight: 520 }} contentContainerStyle={{ gap: 8 }}>
        {row(t('music'), settings.music, 'music', 'music')}
        {row(t('sound'), settings.sfx, 'sfx', 'volume-high')}
        {row(t('vibration'), settings.haptics, 'haptics', 'vibrate')}
        {seg<LanguageSetting>(t('language'), 'translate', settings.language, [['auto', t('langAuto')], ['en', 'EN'], ['fr', 'FR']], (v) => updateSettings({ language: v }))}
        {seg<QualitySetting>(t('quality'), 'monitor-eye', settings.quality, [['auto', t('qAuto')], ['low', t('qLow')], ['medium', t('qMedium')], ['high', t('qHigh')]], (v) => updateSettings({ quality: v }))}
        {row(t('analyticsOpt'), settings.analytics, 'analytics', 'chart-bar')}
        <View style={{ gap: 8, marginTop: 6 }}>
          {ads.privacyOptionsRequired() ? <LinkRow icon="shield-account" label={t('privacyOptions')} onPress={() => ads.showPrivacyOptions()} /> : null}
          <LinkRow icon="restore" label={t('restore')} onPress={restorePurchases} />
          <LinkRow icon="file-document" label={t('privacyPolicy')} onPress={() => Linking.openURL(PRIVACY_POLICY_URL)} />
          <LinkRow
            icon="delete-forever"
            label={t('resetProgress')}
            danger
            onPress={() => {
              if (Platform.OS === 'web') {
                if (globalThis.confirm?.(t('resetConfirm'))) void resetProgress();
                return;
              }
              Alert.alert(t('resetProgress'), t('resetConfirm'), [
                { text: t('cancel'), style: 'cancel' },
                { text: t('confirm'), style: 'destructive', onPress: () => void resetProgress() },
              ]);
            }}
          />
        </View>
        <Txt size={12} color={colors.inkSoft} align="center" style={{ marginTop: 8 }}>{t('version', { v: appVersion })}</Txt>
        <Txt size={12} color={colors.inkSoft} align="center">{t('credits')}</Txt>
      </ScrollView>
    </Sheet>
  );
}

function LinkRow({ icon, label, onPress, danger }: { icon: string; label: string; onPress: () => void; danger?: boolean }) {
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [s.setRow, pressed && { opacity: 0.7 }]}>
      <MaterialCommunityIcons name={icon as never} size={22} color={danger ? colors.danger : colors.primary} />
      <Txt size={15} color={danger ? colors.danger : colors.ink} style={{ flex: 1, marginLeft: 10 }}>{label}</Txt>
      <MaterialCommunityIcons name="chevron-right" size={22} color={colors.inkSoft} />
    </Pressable>
  );
}

const s = StyleSheet.create({
  grid: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: 8 },
  day: { width: 88, height: 104, borderRadius: radius.m, backgroundColor: '#fff', alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: colors.line },
  dayBig: { width: 184, backgroundColor: '#FFF3C4', borderColor: colors.gold },
  dayToday: { backgroundColor: '#FF5FA2', borderColor: '#fff', transform: [{ scale: 1.05 }] },
  dayDone: { opacity: 0.6 },
  check: { position: 'absolute', top: 4, right: 4 },
  tabs: { flexDirection: 'row', backgroundColor: '#E8ECF8', borderRadius: 14, padding: 4, marginBottom: 10 },
  tab: { flex: 1, alignItems: 'center', paddingVertical: 8, borderRadius: 11 },
  tabOn: { backgroundColor: colors.primary },
  mission: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#fff', borderRadius: radius.m, padding: 10, borderWidth: 2, borderColor: colors.line },
  mIcon: { width: 42, height: 42, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  claim: { minWidth: 76, alignItems: 'center', justifyContent: 'center', borderRadius: 12, padding: 6 },
  dcCard: { borderRadius: radius.l, padding: 14, borderWidth: 3, borderColor: '#fff' },
  worldRow: { flexDirection: 'row', alignItems: 'center', borderRadius: radius.l, padding: 12, borderWidth: 3, borderColor: 'rgba(255,255,255,0.85)' },
  worldNum: { width: 42, height: 42, borderRadius: 21, backgroundColor: 'rgba(0,0,0,0.2)', alignItems: 'center', justifyContent: 'center' },
  setRow: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#fff', borderRadius: radius.m, paddingHorizontal: 12, paddingVertical: 10, borderWidth: 2, borderColor: colors.line },
  seg: { flexDirection: 'row', backgroundColor: '#E8ECF8', borderRadius: 10, padding: 2 },
  segItem: { paddingHorizontal: 7, paddingVertical: 5, borderRadius: 8 },
  segOn: { backgroundColor: colors.primary },
});
