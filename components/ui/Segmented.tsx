import { Pressable, Text, View } from "react-native";
import type { LucideIcon } from "lucide-react-native";

import { hapticSelect } from "@/utils/haptics";
import { useTheme } from "@/hooks/useTheme";

export type SegmentedOption<T extends string> = {
  value: T;
  label: string;
  Icon?: LucideIcon;
};

/**
 * Generic segmented control — the single implementation behind the mode pill,
 * the Settings mode/theme switches, and inline pickers (e.g. link expiry).
 * Uses per-item background selection (no measured sliding indicator) so it's a
 * drop-in with no onLayout timing. Fires a selection haptic on change; the
 * parent decides whether to commit the value (so activation intercepts stay in
 * the caller).
 *
 *  - `pill`  — rounded-full container, inline row (header ModePill).
 *  - `block` — rounded-2xl container, equal-width items (Settings switches).
 */
export function Segmented<T extends string>({
  options,
  value,
  onChange,
  variant = "block",
}: {
  options: SegmentedOption<T>[];
  value: T;
  onChange: (next: T) => void;
  variant?: "pill" | "block";
}) {
  const theme = useTheme();
  const isPill = variant === "pill";

  return (
    <View
      className={`flex-row border border-brisk-border bg-brisk-bg1/60 p-1 ${
        isPill ? "rounded-full" : "gap-1 rounded-2xl"
      }`}
    >
      {options.map((opt) => {
        const selected = opt.value === value;
        const color = selected ? theme.accent : theme.subtext;
        const itemBase = isPill
          ? "flex-row items-center justify-center rounded-full px-4 py-2"
          : "flex-1 flex-row items-center justify-center rounded-xl px-4 py-2";
        const itemState = selected
          ? isPill
            ? "bg-brisk-accent/15"
            : "border border-brisk-accent bg-brisk-accent/15"
          : isPill
            ? ""
            : "border border-transparent";
        return (
          <Pressable
            key={opt.value}
            onPress={() => {
              if (opt.value === value) return;
              void hapticSelect();
              onChange(opt.value);
            }}
            className={`${itemBase} ${itemState}`}
            accessibilityRole="button"
            accessibilityState={{ selected }}
            accessibilityLabel={opt.label}
          >
            {opt.Icon ? <opt.Icon color={color} size={15} /> : null}
            <Text
              className={`text-sm font-inter-semibold ${opt.Icon ? "ml-1.5" : ""} ${
                selected ? "text-brisk-accent" : "text-brisk-subtext"
              }`}
            >
              {opt.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}
