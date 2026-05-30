import { Text, View } from "react-native";

export function ErrorBanner({ message }: { message: string }) {
  return (
    <View className="rounded-2xl border border-[#5A1C2A] bg-[#2B1118] p-4">
      <Text className="text-sm text-[#FF9CB0]">{message}</Text>
    </View>
  );
}
