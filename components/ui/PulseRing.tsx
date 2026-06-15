import { useEffect, type ReactNode } from "react";
import { View } from "react-native";
import Animated, {
  Easing,
  interpolate,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
} from "react-native-reanimated";

import { SoftGlow } from "@/components/ui/SoftGlow";
import { BRISK } from "@/theme/tokens";

/**
 * A looping pulse ring + soft inner glow around its children — signals
 * "live, hold near terminal" during the NFC tap (Pay reading / merchant
 * awaiting). Reanimated, runs on the UI thread.
 */
export function PulseRing({
  size = 64,
  color = BRISK.accent,
  children,
}: {
  size?: number;
  color?: string;
  children: ReactNode;
}) {
  const v = useSharedValue(0);

  useEffect(() => {
    v.value = withRepeat(
      withTiming(1, { duration: 1500, easing: Easing.out(Easing.ease) }),
      -1,
      false,
    );
  }, [v]);

  const ringStyle = useAnimatedStyle(() => ({
    transform: [{ scale: interpolate(v.value, [0, 1], [1, 2.3]) }],
    opacity: interpolate(v.value, [0, 1], [0.4, 0]),
  }));

  return (
    <View
      style={{
        width: size * 2.4,
        height: size * 2.4,
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      {/* Soft glow behind the icon so it reads as "glowing". */}
      <SoftGlow color={color} size={size * 2.4} opacity={0.4} style={{ position: "absolute" }} />
      <Animated.View
        style={[
          {
            position: "absolute",
            width: size,
            height: size,
            borderRadius: size / 2,
            borderWidth: 2,
            borderColor: color,
          },
          ringStyle,
        ]}
      />
      {children}
    </View>
  );
}
