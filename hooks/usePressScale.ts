import { useAnimatedStyle, useSharedValue, withSpring } from "react-native-reanimated";

/**
 * The app's standard tactile press-scale — a Reanimated spring that dips a
 * pressable to 0.97 while held and springs back on release. Extracted from
 * PrimaryButton so every pressable surface (buttons, list rows, tiles) shares
 * the exact same feel. Spread `onPressIn`/`onPressOut` onto a Pressable and put
 * `animatedStyle` on the wrapping Animated.View.
 */
export function usePressScale({
  to = 0.97,
  disabled = false,
}: { to?: number; disabled?: boolean } = {}) {
  const scale = useSharedValue(1);
  const animatedStyle = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));

  const onPressIn = () => {
    if (disabled) return;
    // Mutating a Reanimated shared value in a handler is the intended API.
    // eslint-disable-next-line react-hooks/immutability
    scale.value = withSpring(to, { damping: 15, stiffness: 400 });
  };
  const onPressOut = () => {
    // eslint-disable-next-line react-hooks/immutability
    scale.value = withSpring(1, { damping: 15, stiffness: 400 });
  };

  return { animatedStyle, onPressIn, onPressOut };
}
