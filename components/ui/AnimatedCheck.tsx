import { useEffect } from "react";
import { StyleSheet, View } from "react-native";
import { Check } from "lucide-react-native";
import { LinearGradient } from "expo-linear-gradient";
import Animated, {
  Easing,
  interpolate,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withRepeat,
  withSpring,
  withTiming,
} from "react-native-reanimated";

import { SoftGlow } from "@/components/ui/SoftGlow";
import { BRISK } from "@/theme/tokens";

/**
 * Success check that springs in over an aurora disc, with an expanding ring and
 * a looping shimmer sweep — the "Paid ✓" hero moment. Reanimated, UI thread.
 */
export function AnimatedCheck({ size = 72 }: { size?: number; color?: string }) {
  const scale = useSharedValue(0);
  const ring = useSharedValue(0);
  const shimmer = useSharedValue(0);

  useEffect(() => {
    scale.value = withSpring(1, { damping: 9, stiffness: 140, mass: 0.6 });
    ring.value = withTiming(1, { duration: 700, easing: Easing.out(Easing.quad) });
    shimmer.value = withDelay(
      300,
      withRepeat(withTiming(1, { duration: 1600, easing: Easing.inOut(Easing.ease) }), -1, false),
    );
  }, [scale, ring, shimmer]);

  const discStyle = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));
  const ringStyle = useAnimatedStyle(() => ({
    transform: [{ scale: interpolate(ring.value, [0, 1], [0.7, 2.1]) }],
    opacity: interpolate(ring.value, [0, 1], [0.5, 0]),
  }));
  const shimmerStyle = useAnimatedStyle(() => ({
    transform: [
      { translateX: interpolate(shimmer.value, [0, 1], [-size, size]) },
      { rotate: "20deg" },
    ],
  }));

  return (
    <View
      style={{ width: size * 2, height: size * 2, alignItems: "center", justifyContent: "center" }}
    >
      {/* Soft aurora halo behind the check. */}
      <SoftGlow
        color={BRISK.aurora[0]}
        size={size * 2}
        opacity={0.5}
        style={{ position: "absolute" }}
      />
      <Animated.View
        style={[
          {
            position: "absolute",
            width: size,
            height: size,
            borderRadius: size / 2,
            borderWidth: 2,
            borderColor: BRISK.aurora[0],
          },
          ringStyle,
        ]}
      />
      <Animated.View
        style={[
          {
            width: size,
            height: size,
            borderRadius: size / 2,
            overflow: "hidden",
            alignItems: "center",
            justifyContent: "center",
          },
          discStyle,
        ]}
      >
        <LinearGradient
          colors={BRISK.aurora}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={StyleSheet.absoluteFill}
        />
        <Animated.View
          style={[
            {
              position: "absolute",
              width: size * 0.45,
              height: size * 2,
              backgroundColor: "rgba(255,255,255,0.35)",
            },
            shimmerStyle,
          ]}
        />
        <Check color={BRISK.bg0} size={size * 0.6} strokeWidth={3} />
      </Animated.View>
    </View>
  );
}
