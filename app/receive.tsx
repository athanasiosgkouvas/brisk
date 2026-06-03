import { useState } from "react";
import { Pressable, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import Animated, { FadeInDown } from "react-native-reanimated";
import { useRouter } from "expo-router";
import QRCode from "react-native-qrcode-svg";
import { LinearGradient } from "expo-linear-gradient";
import * as Clipboard from "expo-clipboard";
import { Check, Copy, X } from "lucide-react-native";

import { AuroraBackground } from "@/components/ui/AuroraBackground";
import { useAuth } from "@/hooks/useAuth";
import { BRISK } from "@/theme/tokens";

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
    <View className="flex-1 bg-brisk-bg0">
      <AuroraBackground>
        <SafeAreaView edges={["top"]} className="flex-1 px-5">
          <View className="flex-row items-center justify-between py-4">
            <Text className="text-lg font-inter-bold text-brisk-text">Receive</Text>
            <Pressable onPress={() => router.back()} hitSlop={12}>
              <X color={BRISK.subtext} size={24} />
            </Pressable>
          </View>

          <View className="flex-1 items-center justify-center">
            {/* Aurora-glow frame around the (white, for scannability) QR card. */}
            <Animated.View
              entering={FadeInDown.duration(500).springify()}
              style={{
                shadowColor: BRISK.glow,
                shadowOpacity: 0.4,
                shadowRadius: 24,
                shadowOffset: { width: 0, height: 8 },
                elevation: 10,
              }}
            >
              <LinearGradient
                colors={BRISK.aurora}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={{ borderRadius: 28, padding: 3 }}
              >
                <View
                  className="rounded-3xl bg-white p-5"
                  accessible
                  accessibilityRole="image"
                  accessibilityLabel="QR code of your Brisk receiving address"
                >
                  {address ? <QRCode value={address} size={220} /> : null}
                </View>
              </LinearGradient>
            </Animated.View>

            <Text className="mt-6 text-center text-sm text-brisk-subtext">Your Brisk address</Text>
            <Text className="mt-2 px-6 text-center text-sm text-brisk-text" selectable>
              {address}
            </Text>

            <Pressable
              onPress={copy}
              className="mt-5 flex-row items-center rounded-2xl border border-brisk-borderStrong bg-brisk-bg1/70 px-5 py-3"
              accessibilityRole="button"
              accessibilityLabel={copied ? "Address copied" : "Copy your Brisk address"}
            >
              {copied ? (
                <Check color={BRISK.accent} size={18} />
              ) : (
                <Copy color={BRISK.text} size={18} />
              )}
              <Text className="ml-2 font-inter-semibold text-brisk-text">
                {copied ? "Copied" : "Copy address"}
              </Text>
            </Pressable>

            <Text className="mt-8 px-8 text-center text-xs text-brisk-subtext">
              Send USDC to this address to top up. On testnet, get test USDC from the Circle faucet
              (faucet.circle.com → Sui).
            </Text>
          </View>
        </SafeAreaView>
      </AuroraBackground>
    </View>
  );
}
