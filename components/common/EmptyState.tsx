import { Text, View } from "react-native";

type Props = {
  title: string;
  subtitle?: string;
};

export function EmptyState({ title, subtitle }: Props) {
  return (
    <View className="rounded-2xl border border-[#1C2A3A] bg-fathom-bg1 p-5">
      <Text className="text-base font-semibold text-fathom-text">{title}</Text>
      {subtitle ? <Text className="mt-1 text-sm text-fathom-subtext">{subtitle}</Text> : null}
    </View>
  );
}
