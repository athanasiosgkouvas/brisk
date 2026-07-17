import { useEffect, type ReactNode } from "react";
import { StyleSheet, useWindowDimensions, View } from "react-native";
import Svg, { Defs, RadialGradient, Rect, Stop } from "react-native-svg";
import Animated, {
  Easing,
  interpolate,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
} from "react-native-reanimated";

import { BRISK } from "@/theme/tokens";

/**
 * Ambient aurora backdrop: soft radial-gradient glow orbs that drift and breathe
 * slowly over bg0. Radial falloff (vs a hard-edged circle) keeps it reading as
 * ambient light, not a disc. Cheap — animates transform/opacity only, no blur.
 */

// A single soft glow: a radial gradient (opaque center → transparent edge).
function GlowOrb({ color, size, id }: { color: string; size: number; id: string }) {
  return (
    <Svg width={size} height={size}>
      <Defs>
        <RadialGradient id={id} cx="50%" cy="50%" r="50%">
          <Stop offset="0%" stopColor={color} stopOpacity={0.9} />
          <Stop offset="45%" stopColor={color} stopOpacity={0.3} />
          <Stop offset="100%" stopColor={color} stopOpacity={0} />
        </RadialGradient>
      </Defs>
      <Rect x="0" y="0" width={size} height={size} fill={`url(#${id})`} />
    </Svg>
  );
}

export function AuroraBackground({
  children,
  intensity = "subtle",
}: {
  children?: ReactNode;
  intensity?: "subtle" | "vivid";
}) {
  const { width, height } = useWindowDimensions();
  const t = useSharedValue(0);
  const peak = intensity === "vivid" ? 0.45 : 0.28;
  const orb = width * 1.25;

  useEffect(() => {
    // Slow, reversing drift — one full cycle ~16s so motion is barely perceptible.
    t.value = withRepeat(
      withTiming(1, { duration: 16000, easing: Easing.inOut(Easing.ease) }),
      -1,
      true,
    );
  }, [t]);

  // Emerald glow drifts top-left; gentle breathe.
  const emerald = useAnimatedStyle(() => ({
    transform: [
      { translateX: interpolate(t.value, [0, 1], [-orb * 0.18, -orb * 0.04]) },
      { translateY: interpolate(t.value, [0, 1], [-orb * 0.1, -orb * 0.22]) },
      { scale: interpolate(t.value, [0, 1], [1, 1.08]) },
    ],
    opacity: interpolate(t.value, [0, 1], [peak, peak * 0.7]),
  }));
  // Deep-emerald glow drifts bottom-right, counter-phase.
  const emeraldDeep = useAnimatedStyle(() => ({
    transform: [
      { translateX: interpolate(t.value, [0, 1], [orb * 0.05, orb * 0.2]) },
      { translateY: interpolate(t.value, [0, 1], [orb * 0.05, -orb * 0.05]) },
      { scale: interpolate(t.value, [0, 1], [1.1, 0.98]) },
    ],
    opacity: interpolate(t.value, [0, 1], [peak * 0.7, peak]),
  }));
  // Mid-emerald glow lower-center, slow vertical sway — ties the two together.
  const emeraldMid = useAnimatedStyle(() => ({
    transform: [
      { translateX: interpolate(t.value, [0, 1], [-orb * 0.05, orb * 0.05]) },
      { translateY: interpolate(t.value, [0, 1], [orb * 0.02, orb * 0.12]) },
      { scale: interpolate(t.value, [0, 1], [0.95, 1.05]) },
    ],
    opacity: interpolate(t.value, [0, 1], [peak * 0.55, peak * 0.8]),
  }));

  const orbBase = { position: "absolute" as const, width: orb, height: orb };

  return (
    <View style={{ flex: 1 }}>
      <View style={StyleSheet.absoluteFill} pointerEvents="none">
        <Animated.View style={[orbBase, { left: -orb * 0.35, top: -orb * 0.3 }, emerald]}>
          <GlowOrb color={BRISK.aurora[0]} size={orb} id="auroraEmerald" />
        </Animated.View>
        <Animated.View style={[orbBase, { right: -orb * 0.4, bottom: height * 0.04 }, emeraldDeep]}>
          <GlowOrb color={BRISK.aurora[2]} size={orb} id="auroraDeep" />
        </Animated.View>
        <Animated.View
          style={[
            { ...orbBase, width: orb * 0.8, height: orb * 0.8 },
            { left: width * 0.1, bottom: -orb * 0.2 },
            emeraldMid,
          ]}
        >
          <GlowOrb color={BRISK.aurora[1]} size={orb * 0.8} id="auroraMid" />
        </Animated.View>
      </View>
      {children}
    </View>
  );
}
