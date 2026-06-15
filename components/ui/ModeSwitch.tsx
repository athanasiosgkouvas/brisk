import { Pressable, Text, View } from "react-native";

import { useAppMode } from "@/hooks/useAppMode";
import type { AppMode } from "@/store/appModeStore";

const OPTIONS: { mode: AppMode; label: string }[] = [
  { mode: "personal", label: "Personal" },
  { mode: "pro", label: "Pro" },
];

/**
 * Segmented Personal/Pro control pinned to the top of the home screen. Flipping
 * it swaps the tab bar + reskins the dashboard (see app/(tabs)/_layout.tsx).
 *
 * `onRequestMode` lets a caller intercept the selection — e.g. to run one-time
 * Pro activation (register merchant + create the first till) before committing
 * the switch. When omitted, the change is applied immediately.
 */
export function ModeSwitch({ onRequestMode }: { onRequestMode?: (mode: AppMode) => void }) {
  const { mode, setMode } = useAppMode();

  const select = (next: AppMode) => {
    if (next === mode) return;
    if (onRequestMode) onRequestMode(next);
    else setMode(next);
  };

  return (
    <View className="flex-row gap-1 rounded-2xl border border-brisk-border bg-brisk-bg1/60 p-1">
      {OPTIONS.map((opt) => {
        const selected = opt.mode === mode;
        return (
          <Pressable
            key={opt.mode}
            onPress={() => select(opt.mode)}
            className={`flex-1 rounded-xl px-4 py-2 ${
              selected
                ? "bg-brisk-accent/15 border border-brisk-accent"
                : "border border-transparent"
            }`}
            accessibilityRole="button"
            accessibilityState={{ selected }}
            accessibilityLabel={`${opt.label} mode`}
          >
            <Text
              className={`text-center text-sm font-inter-semibold ${
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
