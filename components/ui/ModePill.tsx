import { Pressable, Text, View } from "react-native";
import { Store, Wallet } from "lucide-react-native";

import { useAppMode } from "@/hooks/useAppMode";
import { useProActivation } from "@/hooks/useProActivation";
import { useTheme } from "@/hooks/useTheme";
import type { AppMode } from "@/store/appModeStore";

const OPTIONS: { mode: AppMode; label: string; Icon: typeof Wallet }[] = [
  { mode: "personal", label: "Personal", Icon: Wallet },
  { mode: "pro", label: "Business", Icon: Store },
];

/**
 * Prominent Personal/Business segmented control for the home header — the
 * primary way to switch between the personal wallet and the merchant tools, so
 * the dual-mode product is obvious rather than buried in Settings. Reuses the
 * same activation flow (`useProActivation().requestMode`) as the Settings
 * switch, so first-time Business still routes through `/pro-setup`.
 */
export function ModePill() {
  const { mode } = useAppMode();
  const { requestMode } = useProActivation();
  const theme = useTheme();

  return (
    <View className="flex-row rounded-full border border-brisk-border bg-brisk-bg1/60 p-1">
      {OPTIONS.map((opt) => {
        const selected = opt.mode === mode;
        const color = selected ? theme.accent : theme.subtext;
        return (
          <Pressable
            key={opt.mode}
            onPress={() => opt.mode !== mode && requestMode(opt.mode)}
            className={`flex-row items-center rounded-full px-4 py-2 ${
              selected ? "bg-brisk-accent/15" : ""
            }`}
            accessibilityRole="button"
            accessibilityState={{ selected }}
            accessibilityLabel={`${opt.label} mode`}
          >
            <opt.Icon color={color} size={15} />
            <Text
              className={`ml-1.5 text-sm font-inter-semibold ${
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
