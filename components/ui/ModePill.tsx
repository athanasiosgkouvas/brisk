import { Pressable, Text, View } from "react-native";

import { useAppMode } from "@/hooks/useAppMode";
import { useProActivation } from "@/hooks/useProActivation";
import type { AppMode } from "@/store/appModeStore";

const OPTIONS: { mode: AppMode; label: string }[] = [
  { mode: "personal", label: "Personal" },
  { mode: "pro", label: "Pro" },
];

/**
 * Compact Personal/Pro segmented pill for the home header — surfaces the
 * dual-mode product instead of burying the toggle in Settings. Reuses the same
 * Pro-activation flow (`useProActivation().requestMode`) as the Settings switch,
 * so first-time Pro still routes through `/pro-setup`.
 */
export function ModePill() {
  const { mode } = useAppMode();
  const { requestMode } = useProActivation();

  return (
    <View className="flex-row rounded-full border border-brisk-border bg-brisk-bg1/60 p-0.5">
      {OPTIONS.map((opt) => {
        const selected = opt.mode === mode;
        return (
          <Pressable
            key={opt.mode}
            onPress={() => opt.mode !== mode && requestMode(opt.mode)}
            className={`rounded-full px-3 py-1.5 ${selected ? "bg-brisk-accent/15" : ""}`}
            accessibilityRole="button"
            accessibilityState={{ selected }}
            accessibilityLabel={`${opt.label} mode`}
          >
            <Text
              className={`text-xs font-inter-semibold ${selected ? "text-brisk-accent" : "text-brisk-subtext"}`}
            >
              {opt.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}
