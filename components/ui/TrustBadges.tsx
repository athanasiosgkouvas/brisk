import { Text, View } from "react-native";

type Props = {
  note?: string;
};

const BADGES = ["0% fees", "Instant settlement", "Your control"] as const;

export function TrustBadges({ note }: Props) {
  return (
    <View className="gap-3">
      <View className="flex-row flex-wrap gap-2">
        {BADGES.map((badge) => (
          <View
            key={badge}
            className="rounded-full border border-[#24415A] bg-[#0A1A28] px-3 py-1.5"
          >
            <Text className="text-[11px] font-semibold uppercase tracking-wide text-fathom-text">
              {badge}
            </Text>
          </View>
        ))}
      </View>
      {note ? <Text className="text-xs leading-5 text-fathom-subtext">{note}</Text> : null}
    </View>
  );
}
