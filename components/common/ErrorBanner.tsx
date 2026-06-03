import { Text, View } from "react-native";

export function ErrorBanner({ message }: { message: string }) {
  return (
    <View className="rounded-2xl border border-brisk-danger/30 bg-brisk-danger/10 p-4">
      <Text className="text-sm text-brisk-danger">{message}</Text>
    </View>
  );
}
