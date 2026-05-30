import { Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Store } from "lucide-react-native";

// Merchant "Charge" tab. Phase 1 wires: enter amount -> show QR (Invoice
// payload) -> listen for settlement -> "Paid". Phase 2 adds on-chain Receipt.
export default function ChargeScreen() {
  return (
    <SafeAreaView edges={["top"]} className="flex-1 bg-brisk-bg0 px-5 pt-10">
      <View className="flex-1 items-center justify-center">
        <Store color="#00D98B" size={56} />
        <Text className="mt-6 text-2xl font-bold text-brisk-text">Charge</Text>
        <Text className="mt-2 text-center text-sm text-brisk-subtext">
          Enter an amount and show the QR. Funds land instantly — settlement in under a second.
        </Text>
      </View>
    </SafeAreaView>
  );
}
