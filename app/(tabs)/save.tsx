import { Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { PiggyBank } from "lucide-react-native";

// "Save" tab. Phase 3 wires the yield vault: deposit/withdraw a Save bucket
// that earns in a blue-chip lender (mock on testnet, real adapter on mainnet),
// with instant withdraw-and-pay at spend time.
export default function SaveScreen() {
  return (
    <SafeAreaView edges={["top"]} className="flex-1 bg-brisk-bg0 px-5 pt-10">
      <View className="flex-1 items-center justify-center">
        <PiggyBank color="#00D98B" size={56} />
        <Text className="mt-6 text-2xl font-bold text-brisk-text">Save</Text>
        <Text className="mt-2 text-center text-sm text-brisk-subtext">
          Move idle dollars to Save and earn yield — spend straight from it anytime.
        </Text>
      </View>
    </SafeAreaView>
  );
}
