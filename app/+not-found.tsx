import { Link, Stack } from "expo-router";
import { Text, View } from "react-native";

export default function NotFoundScreen() {
  return (
    <>
      <Stack.Screen options={{ title: "Not Found" }} />
      <View className="flex-1 items-center justify-center bg-fathom-bg0 px-5">
        <Text className="text-lg font-semibold text-fathom-text">Route not found.</Text>
        <Link href="/" className="mt-4 text-fathom-bull">
          Return to swipe
        </Link>
      </View>
    </>
  );
}
