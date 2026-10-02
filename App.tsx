import { LilitaOne_400Regular } from '@expo-google-fonts/lilita-one';
import { Nunito_700Bold, Nunito_800ExtraBold, Nunito_900Black } from '@expo-google-fonts/nunito';
import { useFonts } from 'expo-font';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import React, { useEffect } from 'react';
import { StyleSheet, View } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { GameCanvas } from './src/render/GameCanvas';
import { boot, dprFor, resolveQuality } from './src/state/actions';
import { app, type ModalId } from './src/state/app';
import { useStore } from './src/state/store';
import { DevAdOverlay, ToastHost } from './src/ui/components/Overlays';
import { BootScreen } from './src/ui/screens/BootScreen';
import { HomeScreen } from './src/ui/screens/HomeScreen';
import { ChallengesModal, DailyModal, MissionsModal, SettingsModal, WorldsModal } from './src/ui/screens/MetaModals';
import { PlayScreen } from './src/ui/screens/PlayScreen';
import { PauseModal, ResultsModal, ReviveModal, RewardModal, WorldUnlockModal } from './src/ui/screens/RunModals';
import { ChestModal, ShopModal, SkinsModal } from './src/ui/screens/StoreModals';

SplashScreen.preventAutoHideAsync().catch(() => {});

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
  const [fontsLoaded] = useFonts({ LilitaOne_400Regular, Nunito_700Bold, Nunito_800ExtraBold, Nunito_900Black });
  const screen = useStore(app, (s) => s.screen);
  const modal = useStore(app, (s) => s.modal);
  const quality = useStore(app, (s) => resolveQuality(s.save));

  useEffect(() => {
    if (!fontsLoaded) return;
    SplashScreen.hideAsync().catch(() => {});
    void boot();
  }, [fontsLoaded]);

  const Modal = modal ? MODALS[modal] : null;
  const active = screen !== 'boot' && !(modal && OPAQUE.includes(modal));

  return (
    <SafeAreaProvider>
      <View style={styles.root}>
        <StatusBar style="light" hidden={screen === 'play'} />
        <GameCanvas active={active} dpr={dprFor(quality)} />
        {screen === 'home' ? <HomeScreen /> : null}
        {screen === 'play' ? <PlayScreen /> : null}
        {Modal ? <Modal /> : null}
        {screen === 'boot' || !fontsLoaded ? <BootScreen /> : null}
        <ToastHost />
        <DevAdOverlay />
      </View>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#7FD3FF' },
});
