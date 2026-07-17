import { ActivityIndicator, Pressable, Text, View } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import Animated from "react-native-reanimated";

import { hapticButtonPress } from "@/utils/haptics";
import { usePressScale } from "@/hooks/usePressScale";
import { useTheme } from "@/hooks/useTheme";
import { BRISK } from "@/theme/tokens";
import { SHADOW } from "@/theme/scale";

type Props = {
  label: string;
  onPress: () => void;
  loading?: boolean;
  disabled?: boolean;
  variant?: "primary" | "secondary";
};

// Aurora CTA: the primary variant is a gradient pill with a soft glow; secondary
// is frosted glass. Press feedback is a Reanimated spring scale. The public API
// is unchanged so every call site inherits the new look untouched.
export function PrimaryButton({
  label,
  onPress,
  loading = false,
  disabled = false,
  variant = "primary",
}: Props) {
  const theme = useTheme();
  const inactive = loading || disabled;
  // Keep the styled background (gradient/glass) while loading — only a truly
  // disabled button drops to flat slate.
  const showSlate = disabled && !loading;
  const isPrimary = variant === "primary";
  const { animatedStyle, onPressIn, onPressOut } = usePressScale({ disabled: inactive });

  // The primary label/spinner sits on the bright aurora gradient, so it stays
  // dark in BOTH themes (BRISK = dark) — never the themed bg0 (near-white in
  // light mode). The secondary label is on a themed glass surface, so it tracks
  // the theme's text color.
  const content = loading ? (
    <ActivityIndicator color={isPrimary ? BRISK.bg0 : theme.text} />
  ) : (
    <Text
      style={isPrimary ? { color: BRISK.bg0 } : { color: theme.text }}
      className="font-inter-semibold text-base"
    >
      {label}
    </Text>
  );

  const innerStyle = {
    alignItems: "center" as const,
    justifyContent: "center" as const,
    paddingVertical: 14,
    paddingHorizontal: 16,
  };

  return (
    <Animated.View style={[animatedStyle, isPrimary && !showSlate ? SHADOW.glow : null]}>
      <Pressable
        onPress={() => {
          void hapticButtonPress();
          onPress();
        }}
        onPressIn={onPressIn}
        onPressOut={onPressOut}
        disabled={inactive}
        accessibilityRole="button"
        accessibilityLabel={label}
        accessibilityState={{ disabled: inactive, busy: loading }}
        className="overflow-hidden rounded-2xl"
      >
        {showSlate ? (
          <View style={innerStyle} className="rounded-2xl bg-brisk-bg2">
            {content}
          </View>
        ) : isPrimary ? (
          <LinearGradient
            colors={BRISK.aurora}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 0 }}
            style={innerStyle}
          >
            {content}
          </LinearGradient>
        ) : (
          <View
            style={innerStyle}
            className="rounded-2xl border border-brisk-glassBorder bg-brisk-bg2/60"
          >
            {content}
          </View>
        )}
      </Pressable>
    </Animated.View>
  );
}
