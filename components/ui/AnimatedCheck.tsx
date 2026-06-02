import { useEffect, useState } from "react";
import { Animated, Easing, View } from "react-native";
import { Check } from "lucide-react-native";

/**
 * Success check that springs in with an expanding ring behind it — the
 * "Paid ✓" hero moment. Built on RN's Animated (native driver), no extra deps.
 */
export function AnimatedCheck({ size = 72, color = "#00D98B" }: { size?: number; color?: string }) {
  const [scale] = useState(() => new Animated.Value(0));
  const [ring] = useState(() => new Animated.Value(0));

  useEffect(() => {
    Animated.spring(scale, {
      toValue: 1,
      friction: 5,
      tension: 140,
      useNativeDriver: true,
    }).start();
    Animated.timing(ring, {
      toValue: 1,
      duration: 700,
      easing: Easing.out(Easing.quad),
      useNativeDriver: true,
    }).start();
  }, [scale, ring]);

  const ringScale = ring.interpolate({ inputRange: [0, 1], outputRange: [0.7, 2.1] });
  const ringOpacity = ring.interpolate({ inputRange: [0, 1], outputRange: [0.5, 0] });

  return (
    <View
      style={{ width: size * 2, height: size * 2, alignItems: "center", justifyContent: "center" }}
    >
      <Animated.View
        style={{
          position: "absolute",
          width: size,
          height: size,
          borderRadius: size / 2,
          borderWidth: 2,
          borderColor: color,
          transform: [{ scale: ringScale }],
          opacity: ringOpacity,
        }}
      />
      <Animated.View
        style={{
          width: size,
          height: size,
          borderRadius: size / 2,
          backgroundColor: color,
          alignItems: "center",
          justifyContent: "center",
          transform: [{ scale }],
        }}
      >
        <Check color="#07111A" size={size * 0.6} strokeWidth={3} />
      </Animated.View>
    </View>
  );
}
