import { useState } from "react";
import { ScrollView, Text, TextInput, View } from "react-native";
import Animated, { FadeInDown } from "react-native-reanimated";
import { useRouter } from "expo-router";
import { Smartphone } from "lucide-react-native";

import { Screen } from "@/components/ui/Screen";
import { ShareSheet } from "@/components/ui/ShareSheet";
import { PrimaryButton } from "@/components/ui/PrimaryButton";
import { HeroAmount } from "@/components/ui/HeroAmount";
import { SuccessSheet } from "@/components/ui/SuccessSheet";
import { PulseRing } from "@/components/ui/PulseRing";
import { useAuth } from "@/hooks/useAuth";
import { useUsername } from "@/hooks/useUsername";
import { useReceiveTap } from "@/hooks/useReceiveTap";
import { isHceAvailable } from "@/services/nfc/hce";
import { openNfcSettings } from "@/services/nfc/reader";
import { usdToMicros } from "@/services/blockchain/paymentTx";
import { useTheme } from "@/hooks/useTheme";

// Receive: show the address QR (works everywhere) AND — on Android — a "receive
// by tap" that presents a merchant-less P2P invoice so a friend can tap-to-pay
// an exact amount with no Business setup on either side.
export default function ReceiveScreen() {
  const theme = useTheme();
  const router = useRouter();
  const { session } = useAuth();
  const { alias } = useUsername();
  const address = session?.address ?? "";
  const tap = useReceiveTap();
  const [amountText, setAmountText] = useState("");
  const micros = usdToMicros(Number(amountText || "0"));

  const close = () => {
    void tap.cancel();
    router.back();
  };

  return (
    <Screen title="Receive" onClose={close}>
      {tap.status === "idle" ? (
        <ScrollView
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{ paddingBottom: 40 }}
        >
          <Animated.View
            entering={FadeInDown.duration(500).springify()}
            className="items-center pt-2"
          >
            <ShareSheet
              value={address}
              qrSize={200}
              copyLabel="Copy address"
              qrAccessibilityLabel="QR code of your Brisk receiving address"
            />
            {alias ? (
              <>
                <Text className="mt-5 text-center text-xs uppercase tracking-[2px] text-brisk-subtext">
                  You&apos;re
                </Text>
                <Text className="mt-1 text-center text-xl font-inter-bold text-brisk-text">
                  {alias}
                </Text>
                <Text className="mt-3 text-center text-xs text-brisk-subtext">
                  Your Brisk address
                </Text>
              </>
            ) : (
              <Text className="mt-5 text-center text-sm text-brisk-subtext">
                Your Brisk address
              </Text>
            )}
            <Text className="mt-2 px-6 text-center text-sm text-brisk-text" selectable>
              {address}
            </Text>
          </Animated.View>

          {/* Friend-to-friend receive by tap (Android/HCE). */}
          {isHceAvailable ? (
            <Animated.View
              entering={FadeInDown.duration(500).delay(80).springify()}
              className="mt-8 rounded-2xl border border-brisk-border bg-brisk-bg1/40 p-4"
            >
              <Text className="text-xs uppercase tracking-[2px] text-brisk-subtext">
                Get paid by tap
              </Text>
              <Text className="mt-1 text-xs text-brisk-subtext">
                Enter an amount and have your friend tap their phone to pay you — no address, no
                setup.
              </Text>
              <View className="mt-3 flex-row items-center rounded-2xl border border-brisk-borderStrong bg-brisk-bg1/70 px-5 py-4">
                <Text className="text-3xl font-inter-bold text-brisk-subtext">$</Text>
                <TextInput
                  className="ml-2 flex-1 text-3xl font-inter-bold text-brisk-text"
                  style={{ padding: 0 }}
                  placeholder="0.00"
                  placeholderTextColor={theme.placeholder}
                  keyboardType="decimal-pad"
                  value={amountText}
                  onChangeText={setAmountText}
                  accessibilityLabel="Amount to request in US dollars"
                />
              </View>
              <View className="mt-3">
                <PrimaryButton
                  label="Receive by tap"
                  onPress={() => void tap.startReceive(micros)}
                  disabled={micros <= 0}
                />
              </View>
            </Animated.View>
          ) : null}

          <Text className="mt-8 px-8 text-center text-xs text-brisk-subtext">
            Send USDC to this address to top up. On testnet, get test USDC from the Circle faucet
            (faucet.circle.com → Sui).
          </Text>
        </ScrollView>
      ) : (
        <View className="flex-1 items-center justify-center">
          {tap.status === "awaiting" ? (
            <Animated.View entering={FadeInDown.duration(300)} className="items-center">
              <PulseRing size={56}>
                <Smartphone color={theme.accent} size={52} />
              </PulseRing>
              <Text className="mt-6 text-sm uppercase tracking-[2px] text-brisk-subtext">
                Ready to receive
              </Text>
              <HeroAmount
                micros={tap.amountMicros}
                tier="focused"
                countUp={false}
                className="mt-2"
              />
              <Text className="mt-3 text-center text-sm text-brisk-subtext">
                Have your friend tap their phone to pay you…
              </Text>
              <View className="mt-8 w-full max-w-[360px]">
                <PrimaryButton
                  label="Cancel"
                  variant="secondary"
                  onPress={() => void tap.cancel()}
                />
              </View>
            </Animated.View>
          ) : null}

          {tap.status === "paid" ? (
            <SuccessSheet
              amountMicros={tap.amountMicros}
              subtitle="received"
              footer={<PrimaryButton label="Done" onPress={() => void tap.cancel()} />}
            />
          ) : null}

          {tap.status === "nfc_off" ? (
            <Animated.View entering={FadeInDown.duration(300)} className="items-center">
              <Smartphone color={theme.subtext} size={52} />
              <Text className="mt-6 text-lg font-inter-semibold text-brisk-text">Turn on NFC</Text>
              <Text className="mt-1 text-center text-sm text-brisk-subtext">
                Enable NFC to get paid by tap — or share your address / QR instead.
              </Text>
              <View className="mt-8 w-full max-w-[360px]">
                <PrimaryButton label="Open NFC settings" onPress={() => void openNfcSettings()} />
                <View className="mt-3">
                  <PrimaryButton
                    label="Back"
                    variant="secondary"
                    onPress={() => void tap.cancel()}
                  />
                </View>
              </View>
            </Animated.View>
          ) : null}

          {tap.status === "timeout" || tap.status === "error" ? (
            <Animated.View entering={FadeInDown.duration(300)} className="items-center">
              <Text className="text-lg font-inter-semibold text-brisk-text">
                {tap.status === "timeout" ? "No payment yet" : "Something went wrong"}
              </Text>
              <Text className="mt-1 text-center text-sm text-brisk-subtext">
                {tap.error ?? "Your friend can tap again to pay you."}
              </Text>
              <View className="mt-8 w-full max-w-[360px]">
                <PrimaryButton label="Try again" onPress={() => void tap.cancel()} />
              </View>
            </Animated.View>
          ) : null}
        </View>
      )}
    </Screen>
  );
}
