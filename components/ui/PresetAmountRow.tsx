import { Pressable, Text, View } from "react-native";

/** A row of tappable preset pills (e.g. $25 / $100 / Max) that fill an amount. */
export function PresetAmountRow({
  options,
  onPick,
}: {
  options: { label: string; value: number }[];
  onPick: (value: number) => void;
}) {
  return (
    <View className="mt-2 flex-row gap-2">
      {options.map((o) => (
        <Pressable
          key={o.label}
          onPress={() => onPick(o.value)}
          className="flex-1 rounded-xl border border-brisk-borderStrong bg-brisk-bg1/70 py-2"
          accessibilityRole="button"
          accessibilityLabel={`Preset ${o.label}`}
        >
          <Text className="text-center text-sm font-inter-semibold text-brisk-text">{o.label}</Text>
        </Pressable>
      ))}
    </View>
  );
}
