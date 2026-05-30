import { useEffect } from "react";
import { View, type ViewStyle, StyleSheet } from "react-native";
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
  Easing,
  cancelAnimation,
} from "react-native-reanimated";

/**
 * Lightweight shimmer skeleton block. Used while async data on the Earn tab,
 * Social retention panel, and Position history list is loading — closes the
 * "demo vs real product" gap that an empty white box leaves.
 *
 * Built on react-native-reanimated (already a dep). No images, no extra
 * native modules. Cancels on unmount to keep CPU usage flat.
 */
export function Skeleton({
  height = 14,
  width,
  radius = 8,
  style,
  className,
}: {
  height?: number;
  width?: number | string;
  radius?: number;
  style?: ViewStyle;
  className?: string;
}) {
  const progress = useSharedValue(0);

  useEffect(() => {
    progress.value = 0;
    progress.value = withRepeat(
      withTiming(1, { duration: 1100, easing: Easing.inOut(Easing.ease) }),
      -1,
      true,
    );
    return () => cancelAnimation(progress);
  }, [progress]);

  const animatedStyle = useAnimatedStyle(() => ({
    opacity: 0.55 + progress.value * 0.4,
  }));

  return (
    <View
      className={className}
      style={[
        styles.base,
        { height, width: (width as ViewStyle["width"]) ?? "100%", borderRadius: radius },
        style,
      ]}
    >
      <Animated.View style={[StyleSheet.absoluteFillObject, styles.shimmer, animatedStyle]} />
    </View>
  );
}

const styles = StyleSheet.create({
  base: {
    backgroundColor: "#1A2A3D",
    overflow: "hidden",
  },
  shimmer: {
    backgroundColor: "#243A56",
  },
});
