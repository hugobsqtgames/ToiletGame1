import { MaterialCommunityIcons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import React from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LEVELS_PER_WORLD } from '../../core/config';
import { getWorld, worldOfLevel } from '../../core/worlds';
import { dailyStatus } from '../../meta/daily';
import { CHEST_WINS, KEYS_PER_CHEST, UPGRADE_MAX, startBonus, upgradeCost, incomeMultiplier, type UpgradeId } from '../../meta/economy';
import { countClaimable } from '../../meta/missions';
import { dailyChallengeStatus } from '../../meta/progression';
import { buyUpgrade, openModal, play } from '../../state/actions';
import { app } from '../../state/app';
import { useStore } from '../../state/store';
import { getLanguage, t } from '../i18n';
import { CoinIcon, CurrencyPill, GameButton, IconButton, Pulse, Txt, lighten, styles as kit } from '../components/kit';
import { colors, radius, shadow } from '../theme';

export function HomeScreen() {
  const save = useStore(app, (s) => s.save);
  useStore(app, (s) => s.lang);
  const insets = useSafeAreaInsets();
  const now = Date.now();
  const world = getWorld(worldOfLevel(save.level));
  const lang = getLanguage();
  const daily = dailyStatus(save, now);
  const claimable = countClaimable(save);
  const chestCount = save.chest.basic + save.chest.epic + (save.keys >= KEYS_PER_CHEST ? 1 : 0);
  const dc = dailyChallengeStatus(save, now);
  const levelInWorld = (save.level - 1) % LEVELS_PER_WORLD;

  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="box-none">
      {/* Top bar */}
      <View style={[s.top, { paddingTop: insets.top + 6 }]} pointerEvents="box-none">
        <View style={kit.row}>
          <IconButton icon="cog" size={42} color="#5B6A9A" onPress={() => openModal('settings')} testID="btn-settings" />
          {!save.purchases.removeAds && save.level >= 3 ? (
            <Pressable onPress={() => openModal('shop')} style={s.noAds} testID="btn-noads">
              <MaterialCommunityIcons name="advertisements-off" size={16} color="#fff" />
              <Txt size={12} color="#fff" display style={{ marginLeft: 4 }}>
                {t('noAds')}
              </Txt>
            </Pressable>
          ) : null}
        </View>
        <View style={[kit.row, { gap: 6 }]}>
          <CurrencyPill kind="coins" value={save.coins} onPlus={() => openModal('shop')} testID="pill-coins" />
          <CurrencyPill kind="gems" value={save.gems} onPlus={() => openModal('shop')} testID="pill-gems" />
        </View>
      </View>

      {/* Logo */}
      <View style={s.logoWrap} pointerEvents="none">
        <Txt display size={52} color="#fff" outline style={s.logo}>
          LOO RUSH
        </Txt>
        <View style={s.tagline}>
          <MaterialCommunityIcons name="toilet" size={16} color={colors.ink} />
          <Txt size={13} style={{ marginLeft: 4 }}>{t('tagline')}</Txt>
        </View>
      </View>

      {/* World banner + level path */}
      <Pressable onPress={() => openModal('worlds')} testID="btn-worlds">
        <LinearGradient colors={[lighten(world.colors.ui[0]), world.colors.ui[1]]} style={s.worldCard}>
          <View style={[kit.row, { justifyContent: 'space-between' }]}>
            <View>
              <Txt display size={13} color="rgba(255,255,255,0.85)">
                {t('world', { n: world.world })}
                {world.cycle > 0 ? ` · ${t('remix')}` : ''}
              </Txt>
              <Txt display size={21} color="#fff" outline numberOfLines={1}>
                {world.displayName[lang]}
              </Txt>
            </View>
            <MaterialCommunityIcons name="map-marker-path" size={26} color="#fff" />
          </View>
          <View style={s.path}>
            {Array.from({ length: LEVELS_PER_WORLD }, (_, i) => {
              const done = i < levelInWorld;
              const cur = i === levelInWorld;
              const boss = i === LEVELS_PER_WORLD - 1;
              return (
                <React.Fragment key={i}>
                  {i > 0 ? <View style={[s.pathLine, done || cur ? { backgroundColor: '#fff' } : null]} /> : null}
                  <View style={[s.node, done && s.nodeDone, cur && s.nodeCur, boss && s.nodeBoss]}>
                    {boss ? (
                      <MaterialCommunityIcons name="crown" size={cur ? 16 : 13} color={done || cur ? colors.goldDark : '#fff'} />
                    ) : done ? (
                      <MaterialCommunityIcons name="check-bold" size={11} color={colors.playDark} />
                    ) : cur ? (
                      <Txt display size={11} color={colors.ink}>{save.level}</Txt>
                    ) : null}
                  </View>
                </React.Fragment>
              );
            })}
          </View>
        </LinearGradient>
      </Pressable>

      {/* Side menus */}
      <View style={[s.side, { left: 12 }]} pointerEvents="box-none">
        <IconButton icon="gift" label={t('daily')} color="#FF5FA2" badge={daily.canClaim} onPress={() => openModal('daily')} testID="btn-daily" />
        <IconButton icon="clipboard-check" label={t('missions')} color={colors.warn} badge={claimable || false} onPress={() => openModal('missions')} testID="btn-missions" />
        {save.level >= 4 ? (
          <IconButton icon="trophy" label={t('challenges')} color={colors.purple} badge={!dc.completed} onPress={() => openModal('challenges')} testID="btn-challenges" />
        ) : null}
      </View>
      <View style={[s.side, { right: 12 }]} pointerEvents="box-none">
        <IconButton icon="cart" label={t('shop')} color={colors.teal} onPress={() => openModal('shop')} testID="btn-shop" />
        <IconButton icon="tshirt-crew" label={t('skins')} color={colors.primary} onPress={() => openModal('skins')} testID="btn-skins" />
        <View>
          <IconButton icon="treasure-chest" label={t('chest')} color="#C68B59" badge={chestCount || false} onPress={() => openModal('chest')} testID="btn-chest" />
          <View style={s.chestMeter}>
            {Array.from({ length: CHEST_WINS }, (_, i) => (
              <View key={i} style={[s.chestDot, i < save.chest.progress && { backgroundColor: colors.gold }]} />
            ))}
          </View>
        </View>
      </View>

      {/* Bottom: play + upgrades */}
      <View style={[s.bottom, { paddingBottom: insets.bottom + 14 }]} pointerEvents="box-none">
        <Pulse>
          <GameButton
            label={t('play')}
            sub={<Txt display size={14} color="rgba(255,255,255,0.92)">{world.theme.id && (save.level % LEVELS_PER_WORLD === 0 ? t('bossLevel') : t('level', { n: save.level }))}</Txt>}
            icon="play"
            onPress={play}
            style={{ width: 250 }}
            testID="btn-play"
          />
        </Pulse>
        {save.level >= 2 ? (
          <View style={[kit.row, { gap: 10, marginTop: 14 }]}>
            <UpgradeCard id="startCrowd" />
            <UpgradeCard id="income" />
          </View>
        ) : null}
      </View>
    </View>
  );
}

function UpgradeCard({ id }: { id: UpgradeId }) {
  const save = useStore(app, (s) => s.save);
  const lvl = save.upgrades[id];
  const maxed = lvl >= UPGRADE_MAX[id];
  const cost = upgradeCost(id, lvl);
  const afford = save.coins >= cost && !maxed;
  const isStart = id === 'startCrowd';
  return (
    <Pressable onPress={() => buyUpgrade(id)} disabled={maxed} testID={`btn-upgrade-${id}`} style={({ pressed }) => [s.upCard, pressed && { transform: [{ scale: 0.95 }] }, !afford && { opacity: 0.85 }]}>
      <View style={[s.upIcon, { backgroundColor: isStart ? colors.primary : colors.goldDark }]}>
        <MaterialCommunityIcons name={isStart ? 'account-multiple-plus' : 'cash-multiple'} size={22} color="#fff" />
      </View>
      <View style={{ flex: 1, marginLeft: 8 }}>
        <Txt display size={14} numberOfLines={1}>
          {isStart ? t('upgradeStart') : t('upgradeIncome')}
        </Txt>
        <Txt size={11} color={colors.inkSoft} numberOfLines={1}>
          {t('levelShort', { n: lvl + 1 })} · {isStart ? t('upgradeStartDesc', { n: startBonus(lvl + 1) }) : t('upgradeIncomeDesc', { n: Math.round((incomeMultiplier(lvl + 1) - 1) * 100) })}
        </Txt>
        <View style={[kit.row, s.upCost, { backgroundColor: maxed ? colors.inkSoft : afford ? colors.play : '#9AA4B8' }]}>
          {maxed ? (
            <Txt display size={13} color="#fff">{t('max')}</Txt>
          ) : (
            <>
              <CoinIcon size={14} />
              <Txt display size={13} color="#fff" style={{ marginLeft: 4 }}>
                {cost}
              </Txt>
            </>
          )}
        </View>
      </View>
    </Pressable>
  );
}

const s = StyleSheet.create({
  top: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 12 },
  noAds: { flexDirection: 'row', alignItems: 'center', marginLeft: 8, backgroundColor: colors.danger, paddingHorizontal: 10, paddingVertical: 6, borderRadius: 14, borderWidth: 2, borderColor: '#fff' },
  logoWrap: { alignItems: 'center', marginTop: 6 },
  logo: { letterSpacing: 2, transform: [{ rotate: '-3deg' }], textShadowColor: '#1A55C7', textShadowOffset: { width: 0, height: 4 }, textShadowRadius: 0.1 },
  tagline: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#fff', paddingHorizontal: 10, paddingVertical: 3, borderRadius: 12, marginTop: -2, ...shadow },
  worldCard: { marginHorizontal: 70, marginTop: 10, borderRadius: radius.l, padding: 10, borderWidth: 3, borderColor: 'rgba(255,255,255,0.85)', ...shadow },
  path: { flexDirection: 'row', alignItems: 'center', marginTop: 8 },
  pathLine: { flex: 1, height: 4, backgroundColor: 'rgba(255,255,255,0.35)', marginHorizontal: -1 },
  node: { width: 16, height: 16, borderRadius: 8, backgroundColor: 'rgba(255,255,255,0.35)', alignItems: 'center', justifyContent: 'center' },
  nodeDone: { backgroundColor: '#fff' },
  nodeCur: { width: 26, height: 26, borderRadius: 13, backgroundColor: colors.gold, borderWidth: 3, borderColor: '#fff' },
  nodeBoss: { width: 22, height: 22, borderRadius: 11, backgroundColor: colors.danger },
  side: { position: 'absolute', top: '36%', gap: 14 },
  chestMeter: { flexDirection: 'row', justifyContent: 'center', gap: 3, marginTop: 2 },
  chestDot: { width: 9, height: 5, borderRadius: 3, backgroundColor: 'rgba(255,255,255,0.6)' },
  bottom: { position: 'absolute', left: 0, right: 0, bottom: 0, alignItems: 'center' },
  upCard: { width: 168, flexDirection: 'row', alignItems: 'center', backgroundColor: '#fff', borderRadius: radius.m, padding: 8, borderWidth: 3, borderColor: 'rgba(255,255,255,0.9)', ...shadow },
  upIcon: { width: 40, height: 40, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  upCost: { alignSelf: 'flex-start', marginTop: 3, paddingHorizontal: 8, paddingVertical: 2, borderRadius: 10 },
});
