import { MaterialCommunityIcons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import React, { useEffect, useRef } from 'react';
import { Animated, Easing, StyleSheet } from 'react-native';
import { Text } from 'react-native';
import { t } from '../i18n';

/** Animated in-app splash shown while the save loads (continues the native splash). */
export function BootScreen() {
  const v = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    const loop = Animated.loop(Animated.timing(v, { toValue: 1, duration: 900, easing: Easing.inOut(Easing.quad), useNativeDriver: true }));
    loop.start();
    return () => loop.stop();
  }, [v]);
  return (
    <LinearGradient colors={['#5FC8FF', '#2B7BFF']} style={[StyleSheet.absoluteFill, { alignItems: 'center', justifyContent: 'center' }]}>
      <Animated.View style={{ transform: [{ rotate: v.interpolate({ inputRange: [0, 0.25, 0.75, 1], outputRange: ['0deg', '-12deg', '12deg', '0deg'] }) }] }}>
        <MaterialCommunityIcons name="toilet" size={110} color="#fff" />
      </Animated.View>
      {/* System font on purpose: custom fonts may still be loading here. */}
      <Text allowFontScaling={false} style={{ fontSize: 54, fontWeight: '900', color: '#fff', letterSpacing: 2 }}>LOO RUSH</Text>
      <Text allowFontScaling={false} style={{ fontSize: 16, fontWeight: '700', color: '#fff' }}>{t('loading')}</Text>
    </LinearGradient>
  );
}
