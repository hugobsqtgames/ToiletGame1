import { MaterialCommunityIcons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import React, { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Animated, Easing, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { formatCount } from '../../core/format';
import { FREE_COINS_PER_DAY, GEM_COIN_PACKS, KEYS_PER_CHEST, gemPackCoins } from '../../meta/economy';
import type { Reward } from '../../meta/save';
import { SKINS, skinById, type SkinDef } from '../../meta/skins';
import { dayKey } from '../../meta/time';
import { ads } from '../../services/ads/AdService';
import { audio } from '../../services/audio';
import { haptics } from '../../services/haptics';
import { iap } from '../../services/iap/IapService';
import type { ProductKey } from '../../services/iap/catalog';
import { buyCoinsWithGems, buyProduct, buySkin, closeModal, freeCoins, openChest, previewSkin, restorePurchases, selectSkin } from '../../state/actions';
import { app } from '../../state/app';
import { useStore } from '../../state/store';
import { useNow, useAnimatedValue } from '../hooks';
import { getLanguage, t, tk } from '../i18n';
import { CloseButton, CoinIcon, CurrencyPill, GameButton, GemIcon, KeyIcon, Pulse, Sheet, Txt, lighten, styles as kit } from '../components/kit';
import { game } from '../../render/GameController';
import type { ChestPhase } from '../../render/ChestStage';
import { colors, radius, shadow } from '../theme';

/* ---------------- Shop ---------------- */

export function ShopModal() {
  const now = useNow();
  const save = useStore(app, (s) => s.save);
  const busy = useStore(app, (s) => s.busy);
  useStore(app, (s) => s.storeTick);
  const today = dayKey(now);
  const freeLeft = FREE_COINS_PER_DAY - (save.ads.freeCoinsDay === today ? save.ads.freeCoinsCount : 0);
  const storeOk = iap.available;
  const price = (k: ProductKey) => iap.price(k);

  return (
    <Sheet title={t('shopTitle')} onClose={closeModal} headerColor={colors.teal}>
      <View style={[kit.row, { justifyContent: 'center', gap: 8, marginBottom: 10 }]}>
        <View style={s.darkPill}><CurrencyPill kind="coins" value={save.coins} /></View>
        <View style={s.darkPill}><CurrencyPill kind="gems" value={save.gems} /></View>
      </View>
      <ScrollView style={{ maxHeight: 520 }} contentContainerStyle={{ gap: 10, paddingBottom: 8 }}>
        {!storeOk ? (
          <View style={[s.notice]}>
            <MaterialCommunityIcons name="information" size={18} color={colors.warnDark} />
            <Txt size={13} style={{ marginLeft: 6, flexShrink: 1 }}>{t('storeUnavailable')}</Txt>
          </View>
        ) : null}

        {!save.purchases.starter ? (
          <LinearGradient colors={['#FFD54F', '#FF8F00']} style={s.offer}>
            <View style={s.ribbon}><Txt display size={11} color="#fff">{t('bestValue')}</Txt></View>
            <View style={kit.row}>
              <View style={s.offerIcon}><MaterialCommunityIcons name="crown" size={40} color="#FFB300" /></View>
              <View style={{ flex: 1, marginLeft: 10 }}>
                <Txt display size={20} color="#fff" outline>{t('starterPack')}</Txt>
                <Txt size={13} color="#fff">{t('starterDesc')}</Txt>
              </View>
            </View>
            <PriceButton label={price('starter')} onPress={() => buyProduct('starter')} disabled={!storeOk || busy} testID="buy-starter" />
          </LinearGradient>
        ) : null}

        {!save.purchases.removeAds ? (
          <View style={[s.item, { borderColor: colors.danger }]}>
            <View style={[s.itemIcon, { backgroundColor: colors.danger }]}><MaterialCommunityIcons name="advertisements-off" size={28} color="#fff" /></View>
            <View style={{ flex: 1, marginHorizontal: 10 }}>
              <Txt display size={17}>{t('removeAds')}</Txt>
              <Txt size={12} color={colors.inkSoft}>{t('removeAdsDesc')}</Txt>
            </View>
            <PriceButton label={price('removeAds')} onPress={() => buyProduct('removeAds')} disabled={!storeOk || busy} small testID="buy-removeads" />
          </View>
        ) : (
          <View style={[s.notice, { backgroundColor: '#DFF7E8' }]}>
            <MaterialCommunityIcons name="check-decagram" size={18} color={colors.playDark} />
            <Txt size={13} style={{ marginLeft: 6 }}>{t('adsRemoved')}</Txt>
          </View>
        )}

        <Txt display size={18} style={{ marginTop: 4 }}>{t('gemPacks')}</Txt>
        <View style={[kit.row, { gap: 8 }]}>
          {([['gemsS', 80, 1], ['gemsM', 450, 2], ['gemsL', 1000, 3]] as const).map(([k, n, tier]) => (
            <View key={k} style={s.pack}>
              {tier === 2 ? <View style={[s.ribbon, { backgroundColor: colors.purple }]}><Txt display size={10} color="#fff">{t('popular')}</Txt></View> : null}
              <MaterialCommunityIcons name={tier === 1 ? 'diamond-stone' : tier === 2 ? 'diamond' : 'treasure-chest'} size={34 + tier * 4} color={colors.gem} />
              <Txt display size={18}>{n}</Txt>
              <PriceButton label={price(k)} onPress={() => buyProduct(k)} disabled={!storeOk || busy} small testID={`buy-${k}`} />
            </View>
          ))}
        </View>

        <Txt display size={18} style={{ marginTop: 4 }}>{t('coinPacks')}</Txt>
        <View style={[kit.row, { gap: 8 }]}>
          <View style={s.pack}>
            <MaterialCommunityIcons name="play-box-multiple" size={34} color={colors.goldDark} />
            <Txt display size={14} align="center">{t('freeCoins')}</Txt>
            <Txt size={11} color={colors.inkSoft}>{t('freeCoinsLeft', { n: freeLeft })}</Txt>
            <Pressable onPress={freeCoins} disabled={freeLeft <= 0 || !ads.rewardedReady()} style={[s.smallBtn, { backgroundColor: freeLeft > 0 && ads.rewardedReady() ? colors.play : '#9AA4B8' }]} testID="btn-free-coins">
              <Txt display size={14} color="#fff">{t('free')}</Txt>
            </Pressable>
          </View>
          {GEM_COIN_PACKS.map((p) => (
            <View key={p.id} style={s.pack}>
              <MaterialCommunityIcons name="circle-multiple" size={36} color={colors.gold} />
              <Txt display size={16}>{formatCount(gemPackCoins(p.coinsFactor, save.level))}</Txt>
              <Pressable onPress={() => buyCoinsWithGems(p.id)} style={[s.smallBtn, { backgroundColor: colors.gem, flexDirection: 'row' }]} testID={`buy-${p.id}`}>
                <GemIcon size={14} color="#fff" />
                <Txt display size={14} color="#fff" style={{ marginLeft: 3 }}>{p.gems}</Txt>
              </Pressable>
            </View>
          ))}
        </View>

        <Pressable onPress={restorePurchases} style={{ alignSelf: 'center', padding: 8 }} testID="btn-restore">
          <Txt size={14} color={colors.primary} style={{ textDecorationLine: 'underline' }}>{t('restore')}</Txt>
        </Pressable>
        <Txt size={11} color={colors.inkSoft} align="center">{t('shopLegal')}</Txt>
      </ScrollView>
      {busy ? (
        <View style={[StyleSheet.absoluteFill, kit.center, { backgroundColor: 'rgba(255,255,255,0.6)' }]}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      ) : null}
    </Sheet>
  );
}

function PriceButton({ label, onPress, disabled, small, testID }: { label: string; onPress: () => void; disabled?: boolean; small?: boolean; testID?: string }) {
  return (
    <Pressable onPress={onPress} disabled={disabled} testID={testID} style={({ pressed }) => [s.price, small && s.priceSmall, disabled && { opacity: 0.55 }, pressed && { transform: [{ scale: 0.95 }] }]}>
      <Txt display size={small ? 15 : 19} color="#fff" outline>{label}</Txt>
    </Pressable>
  );
}

/* ---------------- Skins (bottom sheet; the 3D crowd previews above) ---------------- */

export function SkinsModal() {
  const save = useStore(app, (s) => s.save);
  const insets = useSafeAreaInsets();
  const [focus, setFocus] = useState(save.skins.selected);
  const lang = getLanguage();
  const skin = skinById(focus);
  const owned = save.skins.owned.includes(focus);
  const selected = save.skins.selected === focus;
  useEffect(() => () => previewSkin(app.get().save.skins.selected), []);
  const close = () => {
    previewSkin(app.get().save.skins.selected);
    closeModal();
  };
  const u = skin.unlock;
  let action: React.ReactNode;
  if (owned) {
    action = <GameButton label={selected ? t('selected') : t('select')} size="m" color={selected ? '#9AA4B8' : colors.play} dark={selected ? '#6E7891' : colors.playDark} onPress={() => selectSkin(focus)} disabled={selected} style={{ width: 220 }} testID="btn-skin-select" />;
  } else if (u.type === 'coins' || u.type === 'gems') {
    const afford = u.type === 'coins' ? save.coins >= u.price : save.gems >= u.price;
    action = (
      <GameButton
        label={formatCount(u.price)}
        icon={<View style={{ marginRight: 6 }}>{u.type === 'coins' ? <CoinIcon size={22} /> : <GemIcon size={24} color="#fff" />}</View>}
        size="m"
        color={afford ? (u.type === 'coins' ? colors.gold : colors.gem) : '#9AA4B8'}
        dark={afford ? (u.type === 'coins' ? colors.goldDark : colors.gemDark) : '#6E7891'}
        onPress={() => buySkin(focus)}
        style={{ width: 220 }}
        testID="btn-skin-buy"
      />
    );
  } else {
    const txt = u.type === 'world' ? t('unlockWorld', { n: u.world }) : u.type === 'chest' ? t('unlockChest') : t('unlockIap');
    action = (
      <View style={[kit.row, s.lockBox]}>
        <MaterialCommunityIcons name="lock" size={18} color={colors.inkSoft} />
        <Txt display size={15} color={colors.inkSoft} style={{ marginLeft: 6 }}>{txt}</Txt>
      </View>
    );
  }

  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="box-none">
      <View style={[s.skinTop, { paddingTop: insets.top + 8 }]}>
        <Txt display size={28} color="#fff" outline>{t('skinsTitle')}</Txt>
        <CloseButton onPress={close} />
      </View>
      <View style={[s.skinSheet, { paddingBottom: insets.bottom + 12 }]}>
        <View style={[kit.row, { justifyContent: 'space-between', marginBottom: 8 }]}>
          <View>
            <Txt display size={22}>{skin.name[lang]}</Txt>
            <Txt display size={13} color={colors.rarity[skin.rarity]}>{tk('rarity_' + skin.rarity)}</Txt>
          </View>
          {action}
        </View>
        <ScrollView horizontal={false} style={{ maxHeight: 250 }} contentContainerStyle={s.skinGrid}>
          {SKINS.map((sk) => (
            <SkinTile
              key={sk.id}
              skin={sk}
              owned={save.skins.owned.includes(sk.id)}
              selected={save.skins.selected === sk.id}
              focused={focus === sk.id}
              onPress={() => {
                setFocus(sk.id);
                previewSkin(sk.id);
                audio.play('tap');
                haptics.select();
              }}
            />
          ))}
        </ScrollView>
      </View>
    </View>
  );
}

function SkinTile({ skin, owned, selected, focused, onPress }: { skin: SkinDef; owned: boolean; selected: boolean; focused: boolean; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} testID={`skin-${skin.id}`} style={[s.tile, { borderColor: focused ? colors.primary : colors.rarity[skin.rarity] }, focused && { transform: [{ scale: 1.06 }] }]}>
      <LinearGradient colors={[lighten(colors.rarity[skin.rarity], 0.55), lighten(colors.rarity[skin.rarity], 0.25)]} style={s.tileInner}>
        {/* Mini character portrait built from the skin colors */}
        <View style={{ alignItems: 'center', opacity: owned ? 1 : 0.55 }}>
          <View style={[s.mHead, { backgroundColor: skin.skin }]}>
            <View style={[kit.row, { gap: 4, marginTop: 7 }]}>
              <View style={s.mEye} />
              <View style={s.mEye} />
            </View>
          </View>
          <View style={[s.mBody, { backgroundColor: skin.body }]} />
          {skin.accessory !== 'none' ? <View style={[s.mAcc, { backgroundColor: skin.accColor }]} /> : null}
        </View>
        {!owned ? <MaterialCommunityIcons name="lock" size={16} color={colors.ink} style={s.tileLock} /> : null}
        {selected ? <MaterialCommunityIcons name="check-circle" size={20} color={colors.play} style={s.tileLock} /> : null}
      </LinearGradient>
    </Pressable>
  );
}

/* ---------------- Chests ---------------- */

type ChestTier = 'basic' | 'epic' | 'keys';

export function ChestModal() {
  const save = useStore(app, (s) => s.save);
  const [opening, setOpening] = useState<{ tier: ChestTier; reward: Reward; n: number } | null>(null);
  // Never leave the menu hidden if the modal is closed mid-reveal (e.g. Android back).
  useEffect(() => () => app.set({ cinematic: false }), []);

  const starting = useRef(false);
  const start = (tier: ChestTier) => {
    // A double tap on OPEN must not open (and skip the reveal of) two chests.
    if (starting.current) return;
    starting.current = true;
    setTimeout(() => (starting.current = false), 400);
    // The reward is rolled and saved BEFORE the animation: quitting mid-reveal can't reroll it.
    const r = openChest(tier);
    if (!r) return;
    app.set({ cinematic: true });
    setOpening((o) => ({ tier, reward: r, n: (o?.n ?? 0) + 1 }));
  };
  const finish = () => {
    app.set({ cinematic: false });
    setOpening(null);
  };
  const left = (tier: ChestTier) => (tier === 'epic' ? save.chest.epic : tier === 'basic' ? save.chest.basic : Math.floor(save.keys / KEYS_PER_CHEST));

  if (opening) {
    const more = left(opening.tier);
    return (
      <ChestReveal
        key={opening.n}
        tier={opening.tier}
        reward={opening.reward}
        onDone={finish}
        onNext={more > 0 ? () => start(opening.tier) : undefined}
        nextCount={more}
      />
    );
  }

  const rows: { tier: 'basic' | 'epic' | 'keys'; name: string; count: number; color: string; desc?: string }[] = [
    { tier: 'epic', name: t('chestEpic'), count: save.chest.epic, color: colors.gold },
    { tier: 'basic', name: t('chestBasic'), count: save.chest.basic, color: '#C68B59' },
    { tier: 'keys', name: t('chestKeys'), count: save.keys >= KEYS_PER_CHEST ? 1 : 0, color: '#8D99AE', desc: t('chestKeysDesc', { n: save.keys, m: KEYS_PER_CHEST }) },
  ];
  return (
    <Sheet title={t('chestTitle')} onClose={closeModal} headerColor="#C68B59">
      <View style={{ gap: 10 }}>
        {rows.map((r) => (
          <View key={r.tier} style={s.chestRow}>
            <MaterialCommunityIcons name="treasure-chest" size={46} color={r.color} />
            <View style={{ flex: 1, marginLeft: 10 }}>
              <Txt display size={18}>{r.name}</Txt>
              <Txt size={13} color={colors.inkSoft}>{r.desc ?? `x${r.count}`}</Txt>
            </View>
            {r.count > 0 ? (
              <Pulse>
                <GameButton label={t('open')} size="s" onPress={() => start(r.tier)} testID={`open-${r.tier}`} />
              </Pulse>
            ) : (
              <MaterialCommunityIcons name="lock" size={22} color="#B8BFD6" />
            )}
          </View>
        ))}
        {save.chest.basic + save.chest.epic === 0 && save.keys < KEYS_PER_CHEST ? (
          <Txt size={13} color={colors.inkSoft} align="center">{t('chestEmpty')}</Txt>
        ) : null}
      </View>
    </Sheet>
  );
}

/* ---------------- 3D chest reveal ---------------- */

type RevealItem = { key: string; kind: 'coins' | 'gems' | 'keys' | 'skin'; value: number; skin?: string };

function revealItems(r: Reward): RevealItem[] {
  const out: RevealItem[] = [];
  if (r.skin) out.push({ key: 's', kind: 'skin', value: 1, skin: r.skin });
  if (r.coins) out.push({ key: 'c', kind: 'coins', value: r.coins });
  if (r.gems) out.push({ key: 'g', kind: 'gems', value: r.gems });
  if (r.keys) out.push({ key: 'k', kind: 'keys', value: r.keys });
  return out;
}

const CHEST_NAME: Record<ChestTier, 'chestBasic' | 'chestEpic' | 'chestKeys'> = { basic: 'chestBasic', epic: 'chestEpic', keys: 'chestKeys' };
const CHEST_COLOR: Record<ChestTier, string> = { basic: '#FFB357', epic: colors.gold, keys: '#9BE7FF' };

/** Full-screen reveal: the chest itself is 3D (render/ChestStage), this is the UI layer above it. */
function ChestReveal({ tier, reward, onDone, onNext, nextCount }: { tier: ChestTier; reward: Reward; onDone: () => void; onNext?: () => void; nextCount: number }) {
  const insets = useSafeAreaInsets();
  const [phase, setPhase] = useState<ChestPhase>('drop');
  const [shown, setShown] = useState(0);
  const flash = useAnimatedValue(0);
  const intro = useAnimatedValue(0);
  const hint = useAnimatedValue(0);
  const [items] = useState(() => revealItems(reward));

  useEffect(() => {
    game.showChest(tier === 'keys' ? 'keys' : tier, setPhase);
    Animated.timing(intro, { toValue: 1, duration: 450, easing: Easing.out(Easing.back(1.6)), useNativeDriver: true }).start();
    return () => game.hideChest();
  }, [tier, intro]);

  useEffect(() => {
    if (phase === 'idle') {
      const loop = Animated.loop(Animated.sequence([
        Animated.timing(hint, { toValue: 1, duration: 520, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
        Animated.timing(hint, { toValue: 0.35, duration: 520, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
      ]));
      loop.start();
      return () => loop.stop();
    }
    if (phase !== 'open') return;
    flash.setValue(0.9);
    Animated.timing(flash, { toValue: 0, duration: 420, easing: Easing.out(Easing.quad), useNativeDriver: true }).start();
    const timers = items.map((it, i) => setTimeout(() => {
      setShown(i + 1);
      audio.play(it.kind === 'skin' ? 'unlock' : it.kind === 'coins' ? 'coin' : 'gain', 1 + i * 0.08);
      haptics.light();
    }, 650 + i * 420));
    const end = setTimeout(() => setShown(items.length + 1), 650 + items.length * 420 + 150);
    return () => {
      timers.forEach(clearTimeout);
      clearTimeout(end);
    };
  }, [phase, items, flash, hint]);

  const tap = () => {
    if (phase === 'idle') game.tapChest();
  };
  const done = shown > items.length;

  return (
    <Pressable style={StyleSheet.absoluteFill} onPress={tap} testID="chest-tap">
      <Animated.View style={[s.revealTop, { paddingTop: insets.top + 18, opacity: intro, transform: [{ translateY: intro.interpolate({ inputRange: [0, 1], outputRange: [-30, 0] }) }] }]}>
        <Txt display size={38} color="#fff" outline>{t(CHEST_NAME[tier])}</Txt>
        <View style={[s.revealTag, { backgroundColor: CHEST_COLOR[tier] }]}>
          <Txt display size={14} color={colors.ink}>{tier === 'epic' ? tk('rarity_epic') : tier === 'keys' ? t('chestKeysDesc', { n: KEYS_PER_CHEST, m: KEYS_PER_CHEST }) : tk('rarity_common')}</Txt>
        </View>
      </Animated.View>

      <View style={[s.revealBottom, { paddingBottom: insets.bottom + 26 }]} pointerEvents="box-none">
        {phase === 'idle' || phase === 'drop' || phase === 'charge' ? (
          <Animated.View style={{ opacity: phase === 'idle' ? hint : 0, transform: [{ scale: hint.interpolate({ inputRange: [0, 1], outputRange: [0.94, 1.06] }) }] }}>
            <Txt display size={30} color="#fff" outline align="center">{t('chestTap')}</Txt>
          </Animated.View>
        ) : null}
        {phase === 'open' ? (
          <View style={{ alignItems: 'center', gap: 12, width: '100%' }}>
            <View style={s.revealItems}>
              {items.slice(0, shown).map((it) => <RevealCard key={it.key} item={it} />)}
            </View>
            {done ? (
              <FadeIn>
                <View style={{ alignItems: 'center', gap: 10 }}>
                  {onNext ? <GameButton label={t('chestNext', { n: nextCount })} onPress={onNext} color={colors.warn} dark={colors.warnDark} style={{ width: 260 }} testID="btn-chest-next" /> : null}
                  <GameButton label={t('ok')} onPress={onDone} style={{ width: 200 }} testID="btn-chest-ok" />
                </View>
              </FadeIn>
            ) : null}
          </View>
        ) : null}
      </View>

      <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, { backgroundColor: '#FFFFFF', opacity: flash }]} />
    </Pressable>
  );
}

function FadeIn({ children }: { children: React.ReactNode }) {
  const v = useAnimatedValue(0);
  useEffect(() => {
    Animated.timing(v, { toValue: 1, duration: 260, useNativeDriver: true }).start();
  }, [v]);
  return <Animated.View style={{ opacity: v, transform: [{ translateY: v.interpolate({ inputRange: [0, 1], outputRange: [14, 0] }) }] }}>{children}</Animated.View>;
}

function RevealCard({ item }: { item: RevealItem }) {
  const v = useAnimatedValue(0);
  useEffect(() => {
    Animated.spring(v, { toValue: 1, useNativeDriver: true, friction: 5, tension: 140 }).start();
  }, [v]);
  const style = { opacity: v, transform: [{ scale: v.interpolate({ inputRange: [0, 1], outputRange: [0.3, 1] }) }, { translateY: v.interpolate({ inputRange: [0, 1], outputRange: [40, 0] }) }] };
  if (item.kind === 'skin' && item.skin) {
    const sk = skinById(item.skin);
    return (
      <Animated.View style={[s.revealSkin, style]}>
        <LinearGradient colors={[colors.purple, colors.purpleDark]} style={s.revealSkinInner}>
          <Txt display size={16} color={colors.gold}>{t('newSkin')}</Txt>
          <View style={[s.revealSkinDot, { backgroundColor: sk.body, borderColor: sk.accColor }]} />
          <Txt display size={20} color="#fff" align="center">{sk.name[getLanguage()]}</Txt>
          <Txt display size={12} color={colors.rarity[sk.rarity]}>{tk('rarity_' + sk.rarity)}</Txt>
        </LinearGradient>
      </Animated.View>
    );
  }
  const icon = item.kind === 'coins' ? <CoinIcon size={40} /> : item.kind === 'gems' ? <GemIcon size={40} /> : <KeyIcon size={36} />;
  return (
    <Animated.View style={[s.revealCard, style]}>
      {icon}
      <Txt display size={30} style={{ marginTop: 4 }}>+{formatCount(item.value)}</Txt>
    </Animated.View>
  );
}

const s = StyleSheet.create({
  darkPill: { backgroundColor: '#5B6A9A', borderRadius: 22 },
  notice: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#FFF1D6', borderRadius: radius.s, padding: 10 },
  offer: { borderRadius: radius.l, padding: 14, borderWidth: 3, borderColor: '#fff', ...shadow },
  offerIcon: { width: 64, height: 64, borderRadius: 18, backgroundColor: '#fff', alignItems: 'center', justifyContent: 'center' },
  ribbon: { position: 'absolute', top: -2, right: 12, backgroundColor: colors.danger, paddingHorizontal: 8, paddingVertical: 3, borderBottomLeftRadius: 8, borderBottomRightRadius: 8, zIndex: 2 },
  item: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#fff', borderRadius: radius.m, padding: 10, borderWidth: 2 },
  itemIcon: { width: 50, height: 50, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  pack: { flex: 1, backgroundColor: '#fff', borderRadius: radius.m, paddingVertical: 10, alignItems: 'center', borderWidth: 2, borderColor: colors.line, gap: 2 },
  price: { marginTop: 10, alignSelf: 'stretch', backgroundColor: colors.play, borderRadius: 16, paddingVertical: 10, alignItems: 'center', borderBottomWidth: 4, borderBottomColor: colors.playDark },
  priceSmall: { marginTop: 6, alignSelf: 'auto', paddingHorizontal: 12, paddingVertical: 6 },
  smallBtn: { marginTop: 6, paddingHorizontal: 14, paddingVertical: 6, borderRadius: 12, alignItems: 'center' },
  skinTop: { position: 'absolute', top: 0, left: 0, right: 0, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 16 },
  skinSheet: { position: 'absolute', left: 0, right: 0, bottom: 0, backgroundColor: colors.paper, borderTopLeftRadius: radius.xl, borderTopRightRadius: radius.xl, padding: 16, borderWidth: 4, borderColor: '#fff', ...shadow },
  skinGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, justifyContent: 'center', paddingVertical: 6 },
  tile: { width: 72, height: 84, borderRadius: 16, borderWidth: 3, overflow: 'hidden', backgroundColor: '#fff' },
  tileInner: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  tileLock: { position: 'absolute', top: 3, right: 3 },
  mHead: { width: 30, height: 30, borderRadius: 15, alignItems: 'center', zIndex: 2 },
  mEye: { width: 7, height: 7, borderRadius: 4, backgroundColor: '#151515', borderWidth: 1.5, borderColor: '#fff' },
  mBody: { width: 26, height: 30, borderRadius: 13, marginTop: -6 },
  mAcc: { position: 'absolute', top: -6, width: 26, height: 10, borderRadius: 5, zIndex: 3 },
  lockBox: { backgroundColor: '#EEF1FA', paddingHorizontal: 12, paddingVertical: 10, borderRadius: 14 },
  chestRow: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#fff', borderRadius: radius.m, padding: 10, borderWidth: 2, borderColor: colors.line },
  revealTop: { position: 'absolute', top: 0, left: 0, right: 0, alignItems: 'center', gap: 8 },
  revealTag: { borderRadius: 12, paddingHorizontal: 12, paddingVertical: 3 },
  revealBottom: { position: 'absolute', left: 0, right: 0, bottom: 0, alignItems: 'center', paddingHorizontal: 18 },
  revealItems: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: 12 },
  revealCard: { width: 104, height: 112, borderRadius: radius.l, backgroundColor: colors.paper, alignItems: 'center', justifyContent: 'center', borderWidth: 4, borderColor: '#fff', ...shadow },
  revealSkin: { borderRadius: radius.l, borderWidth: 4, borderColor: '#fff', overflow: 'hidden', ...shadow },
  revealSkinInner: { width: 150, height: 112, alignItems: 'center', justifyContent: 'center', gap: 2, paddingHorizontal: 8 },
  revealSkinDot: { width: 30, height: 30, borderRadius: 15, borderWidth: 4, marginVertical: 2 },
  rewardCard: { marginTop: 10, width: '86%', maxWidth: 380, backgroundColor: colors.paper, borderRadius: radius.xl, padding: 18, alignItems: 'center', gap: 10, borderWidth: 4, borderColor: '#fff', ...shadow },
});
