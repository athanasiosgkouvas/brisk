import { Link, Stack } from "expo-router";
import { Text, View } from "react-native";

export default function NotFoundScreen() {
  return (
    <>
      <Stack.Screen options={{ title: "Not Found" }} />
      <View className="flex-1 items-center justify-center bg-brisk-bg0 px-5">
        <Text className="text-lg font-inter-semibold text-brisk-text">Route not found.</Text>
        <Link href="/" className="mt-4 font-inter-semibold text-brisk-accent">
          Return to Wallet
        </Link>
      </View>
    </>
  );
}
