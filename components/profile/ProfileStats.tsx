import { Text, View } from "react-native";

import { useCountUp } from "@/hooks/useCountUp";
import type { PortfolioStats } from "@/types/position";
import { formatPercent } from "@/utils/formatting";

type Props = {
  stats: PortfolioStats;
  netPnlMicro?: number;
};

export function ProfileStats({ stats, netPnlMicro }: Props) {
  return (
    <View className="gap-3">
      {typeof netPnlMicro === "number" ? <WinningsTile netPnlMicro={netPnlMicro} /> : null}
      <View className="flex-row gap-3">
        <Stat label="Predictions" value={`${stats.totalPredictions}`} />
        <Stat label="Win Rate" value={formatPercent(stats.winRate)} />
      </View>
      <View className="flex-row gap-3">
        <Stat label="Current Streak" value={`${stats.currentStreak}`} />
        <Stat label="Pending" value={`${stats.pending}`} />
      </View>
    </View>
  );
}

function WinningsTile({ netPnlMicro }: { netPnlMicro: number }) {
  const animated = useCountUp(netPnlMicro / 1_000_000);
  const positive = animated >= 0;
  const label = `${positive ? "+" : "−"}$${Math.abs(animated).toFixed(2)}`;
  return (
    <View className="rounded-3xl border border-fathom-bull/30 bg-fathom-bg1 p-5">
      <Text className="text-[11px] uppercase tracking-wide text-fathom-subtext">Net winnings</Text>
      <Text className="mt-2 text-3xl font-bold" style={{ color: positive ? "#00D98B" : "#FF5A76" }}>
        {label}
      </Text>
      <Text className="mt-1 text-xs text-fathom-subtext">
        Lifetime payout minus stake across all settled trades.
      </Text>
    </View>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <View className="flex-1 rounded-2xl border border-[#27415A] bg-fathom-bg1 p-4">
      <Text className="text-[11px] uppercase tracking-wide text-fathom-subtext">{label}</Text>
      <Text className="mt-2 text-2xl font-bold text-fathom-text">{value}</Text>
    </View>
  );
}
