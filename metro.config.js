// Learn more https://docs.expo.dev/guides/customizing-metro
const { getDefaultConfig } = require('expo/metro-config');
const path = require('path');

const config = getDefaultConfig(__dirname);

/**
 * three.js ships a deprecated CommonJS entry (build/three.cjs) that calls
 * process.emitWarning — which does not exist in React Native and crashes the
 * app at startup on iOS. Always resolve `three` to its ES module build.
 */
const THREE_ESM = path.resolve(__dirname, 'node_modules/three/build/three.module.js');
const defaultResolve = config.resolver.resolveRequest;
config.resolver.resolveRequest = (context, moduleName, platform) => {
  if (moduleName === 'three') return { type: 'sourceFile', filePath: THREE_ESM };
  return (defaultResolve ?? context.resolveRequest)(context, moduleName, platform);
};

module.exports = config;
