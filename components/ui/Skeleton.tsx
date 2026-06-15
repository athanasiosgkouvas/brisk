import { useEffect } from "react";
import type { DimensionValue } from "react-native";
import Animated, {
  Easing,
  interpolate,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
} from "react-native-reanimated";

/**
 * Loading placeholder: a rounded block that breathes (opacity pulse on the UI
 * thread — transform/opacity only, safe in lists). Shaped to match the final
 * content so first paint reads as "loading", not "broken/blank". Prefer this
 * over a bare spinner for structured first-load content (heroes, lists).
 */
export function Skeleton({
  width = "100%",
  height = 16,
  radius = 10,
  className,
}: {
  width?: DimensionValue;
  height?: number;
  radius?: number;
  className?: string;
}) {
  const pulse = useSharedValue(0);
  useEffect(() => {
    pulse.value = withRepeat(
      withTiming(1, { duration: 900, easing: Easing.inOut(Easing.ease) }),
      -1,
      true,
    );
  }, [pulse]);
  const style = useAnimatedStyle(() => ({
    opacity: interpolate(pulse.value, [0, 1], [0.35, 0.7]),
  }));
  return (
    <Animated.View
      className={`bg-brisk-bg2 ${className ?? ""}`}
      style={[{ width, height, borderRadius: radius }, style]}
    />
  );
}
