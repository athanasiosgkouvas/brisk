import { useEffect } from "react";
import { Pressable, Text, View } from "react-native";
import Animated, { useAnimatedStyle, useSharedValue, withSpring } from "react-native-reanimated";

import { hapticSelect } from "@/utils/haptics";
import { useTheme } from "@/hooks/useTheme";

const TRACK_W = 44;
const TRACK_H = 26;
const THUMB = 20;
const PAD = 3;
const TRAVEL = TRACK_W - THUMB - PAD * 2;

/**
 * Controlled switch — the app's single toggle. The thumb springs across the
 * track and the track color crossfades accent↔border; parent owns the value.
 * Fires a selection haptic on change. Replaces the hand-rolled switch that used
 * to live in the Charge screen.
 */
export function Toggle({
  value,
  onValueChange,
  disabled = false,
}: {
  value: boolean;
  onValueChange: (next: boolean) => void;
  disabled?: boolean;
}) {
  const theme = useTheme();
  const p = useSharedValue(value ? 1 : 0);

  useEffect(() => {
     
    p.value = withSpring(value ? 1 : 0, { damping: 15, stiffness: 400 });
  }, [value, p]);

  const thumbStyle = useAnimatedStyle(() => ({ transform: [{ translateX: p.value * TRAVEL }] }));
  const trackStyle = useAnimatedStyle(() => ({
    backgroundColor: p.value > 0.5 ? theme.accent : theme.borderStrong,
  }));

  return (
    <Pressable
      onPress={() => {
        if (disabled) return;
        void hapticSelect();
        onValueChange(!value);
      }}
      disabled={disabled}
      accessibilityRole="switch"
      accessibilityState={{ checked: value, disabled }}
      hitSlop={8}
      style={{ opacity: disabled ? 0.5 : 1 }}
    >
      <Animated.View
        style={[
          {
            width: TRACK_W,
            height: TRACK_H,
            borderRadius: TRACK_H / 2,
            padding: PAD,
            justifyContent: "center",
          },
          trackStyle,
        ]}
      >
        <Animated.View
          style={[
            {
              width: THUMB,
              height: THUMB,
              borderRadius: THUMB / 2,
              backgroundColor: "#FFFFFF",
            },
            thumbStyle,
          ]}
        />
      </Animated.View>
    </Pressable>
  );
}

/**
 * A framed label + optional description with a trailing Toggle — the reusable
 * "setting row" unit. Tapping anywhere on the row toggles it.
 */
export function ToggleRow({
  label,
  description,
  value,
  onValueChange,
  disabled = false,
}: {
  label: string;
  description?: string;
  value: boolean;
  onValueChange: (next: boolean) => void;
  disabled?: boolean;
}) {
  return (
    <Pressable
      onPress={() => {
        if (disabled) return;
        void hapticSelect();
        onValueChange(!value);
      }}
      disabled={disabled}
      className="flex-row items-center justify-between rounded-2xl border border-brisk-border bg-brisk-bg1/40 px-4 py-3"
    >
      <View className="mr-3 flex-1">
        <Text className="font-inter-semibold text-base text-brisk-text">{label}</Text>
        {description ? (
          <Text className="mt-0.5 text-sm text-brisk-subtext">{description}</Text>
        ) : null}
      </View>
      <Toggle value={value} onValueChange={onValueChange} disabled={disabled} />
    </Pressable>
  );
}
