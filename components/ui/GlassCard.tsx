import type { ReactNode } from "react";
import { Platform, StyleSheet, View, type StyleProp, type ViewStyle } from "react-native";
import { BlurView } from "expo-blur";
import { LinearGradient } from "expo-linear-gradient";

import { useThemeMode } from "@/hooks/useTheme";
import { BRISK } from "@/theme/tokens";

/**
 * Frosted-glass surface: a translucent tinted card with a hairline border.
 *
 * Android caveat — real BlurView is expensive and janks in scrolling lists, so
 * `blur` defaults to true only on iOS. For repeated rows (e.g. the activity
 * list) leave blur off; it falls back to a translucent view. Use real blur only
 * for standalone hero cards. Never animate the blur intensity.
 */
export function GlassCard({
  children,
  className,
  style,
  intensity = 24,
  blur = Platform.OS === "ios",
  sheen = false,
  glow = false,
}: {
  children?: ReactNode;
  className?: string;
  style?: StyleProp<ViewStyle>;
  intensity?: number;
  blur?: boolean;
  sheen?: boolean;
  // Soft ambient lift — opt-in for standalone cards (avoid in long lists).
  glow?: boolean;
}) {
  const { scheme } = useThemeMode();
  return (
    <View
      className={`overflow-hidden rounded-2xl border border-brisk-glassBorder ${className ?? ""}`}
      style={[
        // iOS-only soft lift. Android elevation needs a solid background on this
        // same (overflow-hidden, transparent) view, where it renders as a
        // mismatched rectangular shadow — so we skip elevation here.
        glow
          ? {
              shadowColor: BRISK.glow,
              shadowOpacity: 0.18,
              shadowRadius: 22,
              shadowOffset: { width: 0, height: 10 },
            }
          : null,
        style,
      ]}
    >
      {blur ? (
        <>
          <BlurView intensity={intensity} tint={scheme} style={StyleSheet.absoluteFill} />
          <View style={StyleSheet.absoluteFill} className="bg-brisk-glass" />
        </>
      ) : (
        <View style={StyleSheet.absoluteFill} className="bg-brisk-bg1/80" />
      )}
      {sheen ? (
        <LinearGradient
          colors={["rgba(255,255,255,0.08)", "rgba(255,255,255,0)"]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={StyleSheet.absoluteFill}
          pointerEvents="none"
        />
      ) : null}
      {children}
    </View>
  );
}
