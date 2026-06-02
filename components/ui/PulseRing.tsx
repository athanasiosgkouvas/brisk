import { useEffect, useState, type ReactNode } from "react";
import { Animated, Easing, View } from "react-native";

/**
 * A looping pulse ring around its children — signals "live, hold near terminal"
 * during the NFC tap (Pay reading / merchant awaiting). RN Animated, native driver.
 */
export function PulseRing({
  size = 64,
  color = "#00D98B",
  children,
}: {
  size?: number;
  color?: string;
  children: ReactNode;
}) {
  const [v] = useState(() => new Animated.Value(0));

  useEffect(() => {
    const loop = Animated.loop(
      Animated.timing(v, {
        toValue: 1,
        duration: 1500,
        easing: Easing.out(Easing.ease),
        useNativeDriver: true,
      }),
    );
    loop.start();
    return () => loop.stop();
  }, [v]);

  const scale = v.interpolate({ inputRange: [0, 1], outputRange: [1, 2.3] });
  const opacity = v.interpolate({ inputRange: [0, 1], outputRange: [0.4, 0] });

  return (
    <View
      style={{
        width: size * 2.4,
        height: size * 2.4,
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <Animated.View
        style={{
          position: "absolute",
          width: size,
          height: size,
          borderRadius: size / 2,
          borderWidth: 2,
          borderColor: color,
          transform: [{ scale }],
          opacity,
        }}
      />
      {children}
    </View>
  );
}
