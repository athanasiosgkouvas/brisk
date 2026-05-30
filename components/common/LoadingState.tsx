import { ActivityIndicator, Text, View } from "react-native";

export function LoadingState({ label = "Loading..." }: { label?: string }) {
  return (
    <View className="items-center justify-center py-10">
      <ActivityIndicator color="#00D98B" />
      <Text className="mt-3 text-sm text-fathom-subtext">{label}</Text>
    </View>
  );
}
