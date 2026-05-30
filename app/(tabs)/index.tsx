import { Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { QrCode } from "lucide-react-native";

import { useAuth } from "@/hooks/useAuth";

// Customer "Pay" tab. Phase 1 wires: scan QR / tap NFC -> review amount ->
// Face ID -> gasless send_funds<USDC>. For now, a placeholder confirming the
// authenticated session is live.
export default function PayScreen() {
  const { session } = useAuth();

  return (
    <SafeAreaView edges={["top"]} className="flex-1 bg-brisk-bg0 px-5 pt-10">
      <View className="flex-1 items-center justify-center">
        <QrCode color="#00D98B" size={56} />
        <Text className="mt-6 text-2xl font-bold text-brisk-text">Pay</Text>
        <Text className="mt-2 text-center text-sm text-brisk-subtext">
          Scan a merchant&apos;s QR (or tap) to pay in USDC — no gas, exact amount.
        </Text>
        {session ? (
          <Text className="mt-8 text-center text-xs text-brisk-subtext" selectable>
            {session.address}
          </Text>
        ) : null}
      </View>
    </SafeAreaView>
  );
}
