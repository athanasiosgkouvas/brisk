module.exports = function (api) {
  api.cache(true);
  return {
    presets: ["babel-preset-expo", "nativewind/babel"],
    // Reanimated 4 / worklets: must be the LAST plugin. Without it every
    // worklet (useSharedValue, useAnimatedStyle, …) throws at runtime.
    plugins: ["react-native-worklets/plugin"],
  };
};
