import type { ComponentType } from "react";
import { Pressable, Text, View } from "react-native";
import type { LucideProps } from "lucide-react-native";
import { LinearGradient } from "expo-linear-gradient";
import Animated from "react-native-reanimated";

import { usePressScale } from "@/hooks/usePressScale";
import { hapticButtonPress } from "@/utils/haptics";
import { useTheme } from "@/hooks/useTheme";
import { BRISK } from "@/theme/tokens";
import { SHADOW } from "@/theme/scale";

/**
 * A wallet-style quick action: an icon disc over a label on a tappable tile.
 * `glass` is the frosted default; `gradient` is the loud aurora CTA (used for
 * the single primary action on a screen, e.g. Send). Shares the app press-scale
 * + button haptic so it feels identical to PrimaryButton.
 */
export function QuickAction({
  label,
  Icon,
  onPress,
  variant = "glass",
}: {
  label: string;
  Icon: ComponentType<LucideProps>;
  onPress: () => void;
  variant?: "glass" | "gradient";
}) {
  const theme = useTheme();
  const { animatedStyle, onPressIn, onPressOut } = usePressScale();
  const isGradient = variant === "gradient";
  const iconColor = isGradient ? BRISK.bg0 : theme.accent;
  const labelColor = isGradient ? BRISK.bg0 : theme.text;

  return (
    <Animated.View style={[animatedStyle, isGradient ? SHADOW.glow : null]} className="flex-1">
      <Pressable
        onPress={() => {
          void hapticButtonPress();
          onPress();
        }}
        onPressIn={onPressIn}
        onPressOut={onPressOut}
        accessibilityRole="button"
        accessibilityLabel={label}
        className="overflow-hidden rounded-2xl"
      >
        {isGradient ? (
          <LinearGradient colors={BRISK.aurora} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}>
            <View className="items-center gap-2 px-4 py-4">
              <View className="h-11 w-11 items-center justify-center rounded-full bg-black/10">
                <Icon color={iconColor} size={22} />
              </View>
              <Text className="font-inter-semibold text-base" style={{ color: labelColor }}>
                {label}
              </Text>
            </View>
          </LinearGradient>
        ) : (
          <View className="items-center gap-2 rounded-2xl border border-brisk-glassBorder bg-brisk-bg1/60 px-4 py-4">
            <View className="h-11 w-11 items-center justify-center rounded-full bg-brisk-accent/15">
              <Icon color={iconColor} size={22} />
            </View>
            <Text className="font-inter-semibold text-base" style={{ color: labelColor }}>
              {label}
            </Text>
          </View>
        )}
      </Pressable>
    </Animated.View>
  );
}
