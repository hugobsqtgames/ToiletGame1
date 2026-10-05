import { LilitaOne_400Regular } from '@expo-google-fonts/lilita-one';
import { Nunito_700Bold, Nunito_800ExtraBold, Nunito_900Black } from '@expo-google-fonts/nunito';
import { useFonts } from 'expo-font';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import React, { useEffect } from 'react';
import { StyleSheet, View } from 'react-native';
import { SafeAreaInsetsContext, SafeAreaProvider } from 'react-native-safe-area-context';
import { GameCanvas } from './src/render/GameCanvas';
import { boot, dprFor, resolveQuality } from './src/state/actions';
import { app, type ModalId } from './src/state/app';
import { useStore } from './src/state/store';
import { DevAdOverlay, DevPurchaseOverlay, ToastHost } from './src/ui/components/Overlays';
import { BootScreen } from './src/ui/screens/BootScreen';
import { HomeScreen } from './src/ui/screens/HomeScreen';
import { ChallengesModal, DailyModal, MissionsModal, SettingsModal, WorldsModal } from './src/ui/screens/MetaModals';
import { PlayScreen } from './src/ui/screens/PlayScreen';
import { PauseModal, ResultsModal, ReviveModal, RewardModal, WorldUnlockModal } from './src/ui/screens/RunModals';
import { ChestModal, ShopModal, SkinsModal } from './src/ui/screens/StoreModals';

SplashScreen.preventAutoHideAsync().catch(() => {});

/** QA/mockups only: simulate iPhone safe-area insets in web captures (`?insets=59,34`). */
const DEBUG_INSETS = (() => {
  if (process.env.EXPO_PUBLIC_DEBUG_HOOKS !== '1') return null;
  const m = /insets=(\d+),(\d+)/.exec(String(globalThis.location?.search ?? ''));
  return m ? { top: Number(m[1]), bottom: Number(m[2]), left: 0, right: 0 } : null;
})();

const MODALS: Record<ModalId, React.ComponentType> = {
  pause: PauseModal,
  revive: ReviveModal,
  results: ResultsModal,
  shop: ShopModal,
  skins: SkinsModal,
  missions: MissionsModal,
  daily: DailyModal,
  challenges: ChallengesModal,
  chest: ChestModal,
  settings: SettingsModal,
  worlds: WorldsModal,
  worldUnlock: WorldUnlockModal,
  reward: RewardModal,
};

/** Modals that fully cover the scene: the 3D loop is stopped behind them to save battery. */
const OPAQUE: ModalId[] = [];

export default function App() {
  const [fontsReady, fontError] = useFonts({ LilitaOne_400Regular, Nunito_700Bold, Nunito_800ExtraBold, Nunito_900Black });
  const screen = useStore(app, (s) => s.screen);
  const modal = useStore(app, (s) => s.modal);
  const quality = useStore(app, (s) => resolveQuality(s.save, s.qualityOverride));
  const foreground = useStore(app, (s) => s.foreground);
  const cinematic = useStore(app, (s) => s.cinematic);

  // A font failure must never block the game: fall back to system fonts.
  const fontsLoaded = fontsReady || !!fontError;
  useEffect(() => {
    if (!fontsLoaded) return;
    SplashScreen.hideAsync().catch(() => {});
    void boot();
  }, [fontsLoaded]);

  const Modal = modal ? MODALS[modal] : null;
  const active = foreground && screen !== 'boot' && !(modal && OPAQUE.includes(modal));

  return (
    <SafeAreaProvider>
      <InsetsOverride>
      <View style={styles.root}>
        <StatusBar style="light" hidden={screen === 'play'} />
        <GameCanvas active={active} dpr={dprFor(quality)} />
        {screen === 'home' && modal !== 'skins' && !cinematic ? <HomeScreen /> : null}
        {screen === 'play' && modal !== 'skins' ? <PlayScreen /> : null}
        {Modal ? <Modal /> : null}
        {screen === 'boot' || !fontsLoaded ? <BootScreen /> : null}
        <ToastHost />
        <DevAdOverlay />
        <DevPurchaseOverlay />
      </View>
      </InsetsOverride>
    </SafeAreaProvider>
  );
}

function InsetsOverride({ children }: { children: React.ReactNode }) {
  return DEBUG_INSETS ? <SafeAreaInsetsContext.Provider value={DEBUG_INSETS}>{children}</SafeAreaInsetsContext.Provider> : <>{children}</>;
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#7FD3FF' },
});
