import { useState } from "react";
import { Pressable, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import QRCode from "react-native-qrcode-svg";
import * as Clipboard from "expo-clipboard";
import { Check, Copy, X } from "lucide-react-native";

import { useAuth } from "@/hooks/useAuth";

// Receive / top up: show the user's address as a QR + copy. Anyone can send USDC
// to it (testnet: get test USDC from the Circle faucet). Fiat on/off-ramp is v2 —
// see docs/ONRAMP_OFFRAMP.md.
export default function ReceiveScreen() {
  const router = useRouter();
  const { session } = useAuth();
  const [copied, setCopied] = useState(false);
  const address = session?.address ?? "";

  const copy = async () => {
    await Clipboard.setStringAsync(address);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  return (
    <SafeAreaView edges={["top"]} className="flex-1 bg-brisk-bg0 px-5">
      <View className="flex-row items-center justify-between py-4">
        <Text className="text-lg font-bold text-brisk-text">Receive</Text>
        <Pressable onPress={() => router.back()} hitSlop={12}>
          <X color="#8B98A5" size={24} />
        </Pressable>
      </View>

      <View className="flex-1 items-center justify-center">
        <View className="rounded-3xl bg-white p-5">
          {address ? <QRCode value={address} size={220} /> : null}
        </View>

        <Text className="mt-6 text-center text-sm text-brisk-subtext">Your Brisk address</Text>
        <Text className="mt-2 px-6 text-center text-sm text-brisk-text" selectable>
          {address}
        </Text>

        <Pressable
          onPress={copy}
          className="mt-5 flex-row items-center rounded-2xl border border-[#2C3E55] bg-brisk-bg1 px-5 py-3"
        >
          {copied ? <Check color="#00D98B" size={18} /> : <Copy color="#F5F7FA" size={18} />}
          <Text className="ml-2 font-semibold text-brisk-text">
            {copied ? "Copied" : "Copy address"}
          </Text>
        </Pressable>

        <Text className="mt-8 px-8 text-center text-xs text-brisk-subtext">
          Send USDC to this address to top up. On testnet, get test USDC from the Circle faucet
          (faucet.circle.com → Sui).
        </Text>
      </View>
    </SafeAreaView>
  );
}
