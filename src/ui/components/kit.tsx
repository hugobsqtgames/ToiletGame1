import { MaterialCommunityIcons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import React, { useEffect, useRef } from 'react';
import { Animated, Easing, Pressable, StyleSheet, Text, View, type StyleProp, type TextStyle, type ViewStyle } from 'react-native';
import { formatCount } from '../../core/format';
import type { Reward } from '../../meta/save';
import { skinById } from '../../meta/skins';
import { audio } from '../../services/audio';
import { haptics } from '../../services/haptics';
import { t } from '../i18n';
import { colors, fonts, radius, shadow, textOutline } from '../theme';

export type IconName = React.ComponentProps<typeof MaterialCommunityIcons>['name'];

/* ---------------- Text ---------------- */

export function Txt({ children, size = 16, color = colors.ink, display, outline, style, numberOfLines, align }: {
  children: React.ReactNode;
  size?: number;
  color?: string;
  display?: boolean;
  outline?: boolean;
  style?: StyleProp<TextStyle>;
  numberOfLines?: number;
  align?: 'left' | 'center' | 'right';
}) {
  return (
    <Text
      allowFontScaling={false}
      numberOfLines={numberOfLines}
      style={[{ fontFamily: display ? fonts.display : fonts.body, fontSize: size, color, textAlign: align }, outline && textOutline, style]}
    >
      {children}
    </Text>
  );
}

/* ---------------- Press feedback ---------------- */

export function usePressScale() {
  const v = useRef(new Animated.Value(1)).current;
  const onPressIn = () => Animated.spring(v, { toValue: 0.92, useNativeDriver: true, speed: 50, bounciness: 0 }).start();
  const onPressOut = () => Animated.spring(v, { toValue: 1, useNativeDriver: true, speed: 20, bounciness: 12 }).start();
  return { scale: v, onPressIn, onPressOut };
}

/* ---------------- Buttons ---------------- */

export function GameButton({ label, sub, onPress, color = colors.play, dark = colors.playDark, icon, disabled, style, size = 'l', testID }: {
  label: string;
  sub?: React.ReactNode;
  onPress: () => void;
  color?: string;
  dark?: string;
  icon?: IconName | React.ReactNode;
  disabled?: boolean;
  style?: StyleProp<ViewStyle>;
  size?: 's' | 'm' | 'l';
  testID?: string;
}) {
  const { scale, onPressIn, onPressOut } = usePressScale();
  const h = size === 'l' ? 68 : size === 'm' ? 54 : 42;
  const fs = size === 'l' ? 30 : size === 'm' ? 22 : 17;
  return (
    <Animated.View style={[{ transform: [{ scale }] }, style]}>
      <Pressable
        testID={testID}
        accessibilityRole="button"
        accessibilityLabel={label}
        disabled={disabled}
        onPressIn={onPressIn}
        onPressOut={onPressOut}
        onPress={() => {
          audio.play('tap');
          haptics.select();
          onPress();
        }}
        style={{ opacity: disabled ? 0.5 : 1 }}
      >
        <View style={[styles.btnBase, { backgroundColor: dark, height: h + 6, borderRadius: h / 2.6 }]}>
          <LinearGradient colors={[lighten(color), color]} style={[styles.btnFace, { height: h, borderRadius: h / 2.6 }]}>
            <View style={styles.btnShine} />
            <View style={styles.row}>
              {typeof icon === 'string' ? <MaterialCommunityIcons name={icon as IconName} size={fs + 2} color="#fff" style={{ marginRight: 8 }} /> : icon}
              <Txt display size={fs} color="#fff" outline>
                {label}
              </Txt>
            </View>
            {sub ? <View style={{ marginTop: -2 }}>{typeof sub === 'string' ? <Txt size={12} color="#fff">{sub}</Txt> : sub}</View> : null}
          </LinearGradient>
        </View>
      </Pressable>
    </Animated.View>
  );
}

export function IconButton({ icon, label, onPress, color = colors.primary, badge, size = 58, testID, glyph }: {
  icon: IconName;
  label?: string;
  onPress: () => void;
  color?: string;
  badge?: number | boolean;
  size?: number;
  testID?: string;
  glyph?: React.ReactNode;
}) {
  const { scale, onPressIn, onPressOut } = usePressScale();
  return (
    <Pressable
      testID={testID}
      accessibilityRole="button"
      accessibilityLabel={label ?? icon}
      onPressIn={onPressIn}
      onPressOut={onPressOut}
      onPress={() => {
        audio.play('tap');
        haptics.select();
        onPress();
      }}
      style={{ alignItems: 'center' }}
      hitSlop={6}
    >
      <Animated.View style={{ transform: [{ scale }] }}>
        <View style={[styles.iconBtn, { width: size, height: size, borderRadius: size * 0.32, backgroundColor: darken(color) }]}>
          <LinearGradient colors={[lighten(color), color]} style={[styles.iconFace, { borderRadius: size * 0.32, height: size - 4 }]}>
            {glyph ?? <MaterialCommunityIcons name={icon} size={size * 0.52} color="#fff" />}
          </LinearGradient>
        </View>
        {badge ? (
          <View style={styles.badge}>
            {typeof badge === 'number' ? <Txt size={11} color="#fff" display>{badge > 9 ? '9+' : badge}</Txt> : <Txt size={11} color="#fff" display>!</Txt>}
          </View>
        ) : null}
      </Animated.View>
      {label ? (
        <Txt size={12} color="#fff" outline style={{ marginTop: 3 }} display>
          {label}
        </Txt>
      ) : null}
    </Pressable>
  );
}

export function CloseButton({ onPress }: { onPress: () => void }) {
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={t('close')} onPress={() => { audio.play('tap'); onPress(); }} hitSlop={10} style={styles.close}>
      <MaterialCommunityIcons name="close-thick" size={22} color="#fff" />
    </Pressable>
  );
}

/* ---------------- Currency ---------------- */

export function CoinIcon({ size = 22 }: { size?: number }) {
  return (
    <View style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: colors.goldDark, alignItems: 'center', justifyContent: 'flex-start' }}>
      <View style={{ width: size, height: size - 2, borderRadius: size / 2, backgroundColor: colors.gold, alignItems: 'center', justifyContent: 'center' }}>
        <View style={{ width: size * 0.55, height: size * 0.55, borderRadius: size, borderWidth: Math.max(1.5, size / 11), borderColor: '#FFE48A' }} />
      </View>
    </View>
  );
}

export function GemIcon({ size = 22, color = colors.gem }: { size?: number; color?: string }) {
  return <MaterialCommunityIcons name="diamond-stone" size={size} color={color} />;
}

export function KeyIcon({ size = 20 }: { size?: number }) {
  return <MaterialCommunityIcons name="key-variant" size={size} color={colors.gold} />;
}

export function CurrencyPill({ kind, value, onPlus, testID }: { kind: 'coins' | 'gems' | 'keys'; value: number; onPlus?: () => void; testID?: string }) {
  const bump = useRef(new Animated.Value(1)).current;
  const prev = useRef(value);
  useEffect(() => {
    if (value !== prev.current) {
      prev.current = value;
      Animated.sequence([
        Animated.timing(bump, { toValue: 1.18, duration: 90, useNativeDriver: true }),
        Animated.spring(bump, { toValue: 1, useNativeDriver: true, bounciness: 14 }),
      ]).start();
    }
  }, [value, bump]);
  return (
    <Pressable onPress={onPlus} disabled={!onPlus} testID={testID}>
      <Animated.View style={[styles.pill, { transform: [{ scale: bump }] }]}>
        {kind === 'coins' ? <CoinIcon /> : kind === 'gems' ? <GemIcon /> : <KeyIcon />}
        <Txt display size={18} color="#fff" style={{ marginHorizontal: 6, minWidth: 30 }}>
          {formatCount(value)}
        </Txt>
        {onPlus ? (
          <View style={styles.plus}>
            <MaterialCommunityIcons name="plus-thick" size={13} color="#fff" />
          </View>
        ) : null}
      </Animated.View>
    </Pressable>
  );
}

/* ---------------- Progress ---------------- */

export function ProgressBar({ value, color = colors.play, height = 12, track = 'rgba(255,255,255,0.35)', style }: { value: number; color?: string; height?: number; track?: string; style?: StyleProp<ViewStyle> }) {
  const v = Math.max(0, Math.min(1, value));
  return (
    <View style={[{ height, borderRadius: height / 2, backgroundColor: track, overflow: 'hidden' }, style]}>
      <View style={{ width: `${v * 100}%`, height, borderRadius: height / 2, backgroundColor: color }}>
        <View style={{ position: 'absolute', left: 4, right: 4, top: 2, height: height * 0.3, borderRadius: height, backgroundColor: 'rgba(255,255,255,0.35)' }} />
      </View>
    </View>
  );
}

/* ---------------- Sheet (modal card) ---------------- */

export function Sheet({ title, onClose, children, headerColor = colors.primary, style, scrim = true, compact }: {
  title?: string;
  onClose?: () => void;
  children: React.ReactNode;
  headerColor?: string;
  style?: StyleProp<ViewStyle>;
  scrim?: boolean;
  compact?: boolean;
}) {
  const a = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.spring(a, { toValue: 1, useNativeDriver: true, speed: 14, bounciness: 7 }).start();
  }, [a]);
  return (
    <View style={[StyleSheet.absoluteFill, styles.center, scrim && { backgroundColor: colors.scrim }]} pointerEvents="box-none">
      <Animated.View
        style={[
          styles.sheet,
          compact && { maxHeight: undefined },
          { opacity: a, transform: [{ translateY: a.interpolate({ inputRange: [0, 1], outputRange: [60, 0] }) }, { scale: a.interpolate({ inputRange: [0, 1], outputRange: [0.92, 1] }) }] },
          style,
        ]}
      >
        {title ? (
          <LinearGradient colors={[lighten(headerColor), headerColor]} style={styles.sheetHeader}>
            <Txt display size={26} color="#fff" outline>
              {title}
            </Txt>
            {onClose ? <View style={styles.sheetClose}><CloseButton onPress={onClose} /></View> : null}
          </LinearGradient>
        ) : null}
        <View style={styles.sheetBody}>{children}</View>
      </Animated.View>
    </View>
  );
}

/* ---------------- Rewards ---------------- */

export function RewardChips({ reward, size = 'm' }: { reward: Reward; size?: 's' | 'm' | 'l' }) {
  const fs = size === 'l' ? 26 : size === 'm' ? 18 : 14;
  const is = size === 'l' ? 30 : size === 'm' ? 22 : 16;
  const items: React.ReactNode[] = [];
  if (reward.coins) items.push(<Chip key="c" icon={<CoinIcon size={is} />} text={formatCount(reward.coins)} fs={fs} />);
  if (reward.gems) items.push(<Chip key="g" icon={<GemIcon size={is} />} text={String(reward.gems)} fs={fs} />);
  if (reward.keys) items.push(<Chip key="k" icon={<KeyIcon size={is} />} text={String(reward.keys)} fs={fs} />);
  if (reward.chest) items.push(<Chip key="ch" icon={<MaterialCommunityIcons name="treasure-chest" size={is} color={reward.chest === 'epic' ? colors.gold : '#C68B59'} />} text={reward.chest === 'epic' ? t('chestEpic') : t('chestBasic')} fs={fs * 0.75} />);
  if (reward.skin) items.push(<Chip key="s" icon={<MaterialCommunityIcons name="account-star" size={is} color={colors.purple} />} text={skinById(reward.skin).name.en} fs={fs * 0.75} />);
  return <View style={[styles.row, { flexWrap: 'wrap', justifyContent: 'center', gap: 8 }]}>{items}</View>;
}

function Chip({ icon, text, fs }: { icon: React.ReactNode; text: string; fs: number }) {
  return (
    <View style={styles.chip}>
      {icon}
      <Txt display size={fs} style={{ marginLeft: 6 }}>
        {text}
      </Txt>
    </View>
  );
}

/* ---------------- Misc ---------------- */

/** Gentle looping pulse to draw attention (claimable rewards, CTA). */
export function Pulse({ children, active = true, style }: { children: React.ReactNode; active?: boolean; style?: StyleProp<ViewStyle> }) {
  const v = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (!active) return;
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(v, { toValue: 1, duration: 650, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
        Animated.timing(v, { toValue: 0, duration: 650, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [active, v]);
  return <Animated.View style={[style, { transform: [{ scale: v.interpolate({ inputRange: [0, 1], outputRange: [1, 1.06] }) }] }]}>{children}</Animated.View>;
}

/** Animated number counting up (results screen). */
export function CountUp({ to, duration = 900, size = 34, color = colors.ink, prefix = '' }: { to: number; duration?: number; size?: number; color?: string; prefix?: string }) {
  const [v, setV] = React.useState(0);
  useEffect(() => {
    let raf = 0;
    const start = Date.now();
    const tick = () => {
      const k = Math.min(1, (Date.now() - start) / duration);
      setV(Math.round(to * (1 - Math.pow(1 - k, 3))));
      if (k < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [to, duration]);
  return (
    <Txt display size={size} color={color}>
      {prefix}
      {formatCount(v)}
    </Txt>
  );
}

export function lighten(hex: string, amt = 0.22): string {
  return mix(hex, '#FFFFFF', amt);
}
export function darken(hex: string, amt = 0.28): string {
  return mix(hex, '#000000', amt);
}
function mix(a: string, b: string, t: number) {
  const pa = parseInt(a.slice(1), 16);
  const pb = parseInt(b.slice(1), 16);
  const ch = (s: number) => Math.round(((pa >> s) & 255) * (1 - t) + ((pb >> s) & 255) * t);
  return '#' + [16, 8, 0].map((s) => ch(s).toString(16).padStart(2, '0')).join('');
}

export const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center' },
  center: { alignItems: 'center', justifyContent: 'center' },
  btnBase: { justifyContent: 'flex-start', ...shadow },
  btnFace: { alignItems: 'center', justifyContent: 'center', paddingHorizontal: 22, overflow: 'hidden' },
  btnShine: { position: 'absolute', top: 4, left: 14, right: 14, height: 10, borderRadius: 10, backgroundColor: 'rgba(255,255,255,0.28)' },
  iconBtn: { ...shadow, justifyContent: 'flex-start' },
  iconFace: { alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: 'rgba(255,255,255,0.35)' },
  badge: { position: 'absolute', top: -6, right: -6, minWidth: 22, height: 22, borderRadius: 11, backgroundColor: colors.danger, borderWidth: 2, borderColor: '#fff', alignItems: 'center', justifyContent: 'center', paddingHorizontal: 4 },
  close: { width: 38, height: 38, borderRadius: 19, backgroundColor: colors.danger, borderWidth: 3, borderColor: '#fff', alignItems: 'center', justifyContent: 'center', ...shadow },
  pill: { flexDirection: 'row', alignItems: 'center', backgroundColor: 'rgba(20, 26, 60, 0.55)', borderRadius: 20, paddingLeft: 5, paddingRight: 5, paddingVertical: 4, borderWidth: 2, borderColor: 'rgba(255,255,255,0.25)' },
  plus: { width: 20, height: 20, borderRadius: 10, backgroundColor: colors.play, alignItems: 'center', justifyContent: 'center' },
  sheet: { width: '92%', maxWidth: 440, maxHeight: '86%', backgroundColor: colors.paper, borderRadius: radius.xl, overflow: 'hidden', borderWidth: 4, borderColor: '#fff', ...shadow },
  sheetHeader: { paddingVertical: 14, alignItems: 'center', justifyContent: 'center' },
  sheetClose: { position: 'absolute', right: 10, top: 10 },
  sheetBody: { padding: 16, flexShrink: 1 },
  chip: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#fff', borderRadius: 14, paddingHorizontal: 10, paddingVertical: 6, borderWidth: 2, borderColor: colors.line },
  card: { backgroundColor: '#fff', borderRadius: radius.m, padding: 12, borderWidth: 2, borderColor: colors.line },
});
