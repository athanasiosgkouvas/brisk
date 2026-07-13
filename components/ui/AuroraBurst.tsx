import { useEffect } from "react";
import { View } from "react-native";
import Animated, {
  Easing,
  interpolate,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from "react-native-reanimated";

import { BRISK } from "@/theme/tokens";

/**
 * A one-shot celebratory particle burst behind the "Paid ✓" moment: a ring of
 * aurora-tinted dots springs outward and fades, once, on mount. Pure Reanimated
 * (no new deps), UI-thread, purely decorative — layered behind the AnimatedCheck.
 * Understated: quick, soft, on-brand — a spark, not a confetti cannon.
 */
export function AuroraBurst({
  size = 72,
  count = 10,
  radius = size * 1.6,
}: {
  size?: number;
  count?: number;
  radius?: number;
}) {
  const t = useSharedValue(0);

  useEffect(() => {
    t.value = withTiming(1, { duration: 900, easing: Easing.out(Easing.cubic) });
  }, [t]);

  const box = size * 2;
  return (
    <View
      pointerEvents="none"
      style={{
        position: "absolute",
        width: box,
        height: box,
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      {Array.from({ length: count }).map((_, i) => {
        const angle = (i / count) * Math.PI * 2;
        const dx = Math.cos(angle) * radius;
        const dy = Math.sin(angle) * radius;
        const color = BRISK.aurora[i % BRISK.aurora.length];
        const dot = 6 + (i % 3); // 6–8px, slight size variety
        return <Dot key={i} t={t} dx={dx} dy={dy} color={color} dot={dot} />;
      })}
    </View>
  );
}

function Dot({
  t,
  dx,
  dy,
  color,
  dot,
}: {
  t: { value: number };
  dx: number;
  dy: number;
  color: string;
  dot: number;
}) {
  const style = useAnimatedStyle(() => {
    // Ease outward with a touch of overshoot, then settle; fade + shrink as it flies.
    const travel = interpolate(t.value, [0, 0.7, 1], [0, 1.08, 1]);
    return {
      transform: [
        { translateX: dx * travel },
        { translateY: dy * travel },
        { scale: interpolate(t.value, [0, 0.2, 1], [0, 1, 0.4]) },
      ],
      opacity: interpolate(t.value, [0, 0.15, 0.75, 1], [0, 1, 0.9, 0]),
    };
  });

  return (
    <Animated.View
      style={[
        {
          position: "absolute",
          width: dot,
          height: dot,
          borderRadius: dot / 2,
          backgroundColor: color,
        },
        style,
      ]}
    />
  );
}
