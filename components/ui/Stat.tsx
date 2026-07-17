import { Text, View, type StyleProp, type ViewStyle } from "react-native";

import { AuroraText } from "@/components/ui/AuroraText";

/**
 * A small label-over-value cell for stat rows (Save pitch / projection, hero
 * sub-stats). `aurora` fills the value with the gradient — use ONLY for static
 * numerals (MaskedView is expensive; never for a live-ticking value). `tone`
 * picks a plain text color otherwise.
 */
export function Stat({
  label,
  value,
  aurora = false,
  tone = "text",
  align = "center",
  style,
}: {
  label: string;
  value: string;
  aurora?: boolean;
  tone?: "text" | "accent" | "subtext";
  align?: "center" | "left";
  style?: StyleProp<ViewStyle>;
}) {
  const toneClass =
    tone === "accent"
      ? "text-brisk-accent"
      : tone === "subtext"
        ? "text-brisk-subtext"
        : "text-brisk-text";
  const alignClass = align === "center" ? "items-center" : "items-start";

  return (
    <View className={alignClass} style={style}>
      {aurora ? (
        <AuroraText className="font-inter-extrabold text-xl">{value}</AuroraText>
      ) : (
        <Text className={`font-inter-extrabold text-xl ${toneClass}`}>{value}</Text>
      )}
      <Text className="mt-1 text-center text-xs uppercase tracking-[1px] text-brisk-subtext font-mono-medium">
        {label}
      </Text>
    </View>
  );
}
