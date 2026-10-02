import React, { useEffect } from 'react';
import { StyleSheet, View } from 'react-native';
import type * as THREE from 'three';
import { Canvas, useFrame, useThree } from './r3f';
import { game } from './GameController';

/**
 * The single, persistent 3D canvas. It is mounted once for the app lifetime:
 * menus are React Native overlays on top of it, so the GL context is never
 * recreated (no leaks, no reload hitches). `active=false` stops the render
 * loop entirely (backgrounded app, full-screen menus) to save battery.
 */
function SceneBridge() {
  const { scene, camera, size, get } = useThree();
  useEffect(() => {
    const sz = get().size;
    game.attach(scene, camera as THREE.PerspectiveCamera, sz.width / Math.max(1, sz.height));
    return () => game.detach();
  }, [scene, camera, get]);
  useEffect(() => {
    game.setAspect(size.width / Math.max(1, size.height));
  }, [size.width, size.height]);
  useFrame((_, dt) => game.frame(dt));
  return null;
}

export function GameCanvas({ active, dpr }: { active: boolean; dpr: number }) {
  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      <Canvas
        style={StyleSheet.absoluteFill as object}
        frameloop={active ? 'always' : 'never'}
        dpr={dpr}
        gl={{ antialias: dpr < 2, powerPreference: 'high-performance' }}
        camera={{ fov: 55, near: 0.1, far: 420, position: [3, 3, -6] }}
        flat
      >
        <SceneBridge />
      </Canvas>
    </View>
  );
}
