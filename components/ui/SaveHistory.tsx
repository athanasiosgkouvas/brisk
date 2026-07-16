import { Text, View } from "react-native";
import { ArrowDownLeft, ArrowUpRight, Sparkles } from "lucide-react-native";

import { GlassCard } from "@/components/ui/GlassCard";
import { useSaveHistory } from "@/hooks/useSaveHistory";
import { useTheme } from "@/hooks/useTheme";
import { formatUsd } from "@/services/blockchain/paymentTx";
import { formatRelativeTime } from "@/utils/time";

// Icon tint resolves against the active palette at render (see SaveHistory).
const META = {
  deposit: { label: "Moved to Save", icon: ArrowDownLeft, tone: "accent" },
  withdraw: { label: "Withdrawn", icon: ArrowUpRight, tone: "text" },
  activate: { label: "Activated Save", icon: Sparkles, tone: "subtext" },
} as const;

/** Save-specific activity: the user's deposits / withdrawals / activation. */
export function SaveHistory() {
  const theme = useTheme();
  const { items, loading } = useSaveHistory();
  if (loading || items.length === 0) return null;

  return (
    <View className="mt-8">
      <Text className="text-sm uppercase tracking-[1.5px] text-brisk-subtext font-mono-medium">
        Save activity
      </Text>
      <View className="mt-3">
        {items.map((it, i) => {
          const m = META[it.kind];
          const Icon = m.icon;
          const iconColor = theme[m.tone];
          return (
            <GlassCard
              key={`${it.digest}-${i}`}
              className="mb-2 flex-row items-center px-4 py-3"
              blur={false}
            >
              <Icon color={iconColor} size={18} />
              <View className="ml-3 flex-1">
                <Text className="text-sm font-inter-semibold text-brisk-text">{m.label}</Text>
                <Text className="text-xs text-brisk-subtext">
                  {formatRelativeTime(it.timestampMs)}
                </Text>
              </View>
              {it.amountMicros > 0 ? (
                <Text
                  className={`text-base font-inter-semibold ${it.kind === "withdraw" ? "text-brisk-text" : "text-brisk-accent"}`}
                >
                  {it.kind === "withdraw" ? "−" : "+"}
                  {formatUsd(it.amountMicros)}
                </Text>
              ) : null}
            </GlassCard>
          );
        })}
      </View>
    </View>
  );
}
