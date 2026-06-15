import { Text, View } from "react-native";

/** Compact stat pill: small uppercase label over a bold value. Used for the Save
 *  projections row (+$/day, $/yr, APY). */
export function StatChip({
  label,
  value,
  tone = "neutral",
}: {
  label: string;
  value: string;
  tone?: "neutral" | "accent";
}) {
  return (
    <View className="flex-1 items-center rounded-2xl border border-brisk-borderStrong bg-brisk-bg1/70 px-2 py-3">
      <Text className="text-[10px] uppercase tracking-[1px] text-brisk-subtext">{label}</Text>
      <Text
        className={`mt-1 text-base font-inter-bold ${tone === "accent" ? "text-brisk-accent" : "text-brisk-text"}`}
      >
        {value}
      </Text>
    </View>
  );
}
