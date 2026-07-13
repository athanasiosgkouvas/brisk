import { Text } from "react-native";
import Animated, { FadeInDown } from "react-native-reanimated";
import { useRouter } from "expo-router";

import { Screen } from "@/components/ui/Screen";
import { ShareSheet } from "@/components/ui/ShareSheet";
import { useAuth } from "@/hooks/useAuth";

// Receive / top up: show the user's address as a QR + copy. Anyone can send USDC
// to it (testnet: get test USDC from the Circle faucet). Fiat on/off-ramp is next.
export default function ReceiveScreen() {
  const router = useRouter();
  const { session } = useAuth();
  const address = session?.address ?? "";

  return (
    <Screen title="Receive" onClose={() => router.back()}>
      <Animated.View
        entering={FadeInDown.duration(500).springify()}
        className="flex-1 items-center justify-center"
      >
        <ShareSheet
          value={address}
          qrSize={220}
          copyLabel="Copy address"
          qrAccessibilityLabel="QR code of your Brisk receiving address"
        />

        <Text className="mt-6 text-center text-sm text-brisk-subtext">Your Brisk address</Text>
        <Text className="mt-2 px-6 text-center text-sm text-brisk-text" selectable>
          {address}
        </Text>

        <Text className="mt-8 px-8 text-center text-xs text-brisk-subtext">
          Send USDC to this address to top up. On testnet, get test USDC from the Circle faucet
          (faucet.circle.com → Sui).
        </Text>
      </Animated.View>
    </Screen>
  );
}
