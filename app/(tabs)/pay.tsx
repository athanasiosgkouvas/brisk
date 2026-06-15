import { ActivityIndicator, Pressable, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import Animated, { FadeIn } from "react-native-reanimated";
import { SmartphoneNfc, XCircle } from "lucide-react-native";

import { PrimaryButton } from "@/components/ui/PrimaryButton";
import { HeroAmount } from "@/components/ui/HeroAmount";
import { SuccessSheet } from "@/components/ui/SuccessSheet";
import { AuroraBackground } from "@/components/ui/AuroraBackground";
import { PulseRing } from "@/components/ui/PulseRing";
import { usePay } from "@/hooks/usePay";
import { openNfcSettings } from "@/services/nfc/reader";
import { useTheme } from "@/hooks/useTheme";

// Customer "Pay" tab (iOS + Android). Tap the Brisk Terminal -> review ->
// Confirm & Pay -> feeless settlement. The whole point of the app.
export default function PayScreen() {
  const theme = useTheme();
  const { status, invoice, result, error, tapToRead, confirmAndPay, reset, cancel } = usePay();

  return (
    <View className="flex-1 bg-brisk-bg0">
      <AuroraBackground>
        <SafeAreaView edges={["top"]} className="flex-1 px-5 pt-10">
          <View className="flex-1 items-center justify-center">
            {status === "idle" || status === "reading" ? (
              <Animated.View entering={FadeIn.duration(300)} className="items-center">
                <PulseRing size={64} color={status === "reading" ? theme.accent : theme.bg2}>
                  <SmartphoneNfc color={theme.accent} size={64} />
                </PulseRing>
                <Text className="mt-6 text-2xl font-inter-bold text-brisk-text">Tap to pay</Text>
                <Text className="mt-2 text-center text-sm text-brisk-subtext">
                  Hold your phone near the Brisk Terminal — pay in USDC, no gas, exact amount.
                </Text>
                <View className="mt-8 w-full max-w-[360px]">
                  <PrimaryButton
                    label={status === "reading" ? "Hold near terminal…" : "Tap to pay"}
                    onPress={() => void tapToRead()}
                    loading={status === "reading"}
                  />
                  {status === "reading" ? (
                    <Pressable className="mt-3 py-3" onPress={cancel}>
                      <Text className="text-center text-sm text-brisk-subtext">Cancel</Text>
                    </Pressable>
                  ) : null}
                </View>
              </Animated.View>
            ) : null}

            {status === "review" && invoice ? (
              <Animated.View
                entering={FadeIn.duration(300)}
                className="w-full max-w-[360px] items-center"
              >
                <Text className="text-sm uppercase tracking-[2px] text-brisk-subtext">Pay</Text>
                <HeroAmount
                  micros={invoice.amountMicros}
                  tier="focused"
                  countUp={false}
                  className="mt-2"
                />
                <Text className="mt-2 text-base text-brisk-subtext">to {invoice.merchant}</Text>
                <View className="mt-8 w-full">
                  <PrimaryButton label="Confirm & Pay" onPress={() => void confirmAndPay()} />
                  <Pressable className="mt-3 py-3" onPress={reset}>
                    <Text className="text-center text-sm text-brisk-subtext">Cancel</Text>
                  </Pressable>
                </View>
              </Animated.View>
            ) : null}

            {status === "paying" ? (
              <Animated.View entering={FadeIn.duration(300)} className="items-center">
                <ActivityIndicator color={theme.accent} size="large" />
                <Text className="mt-4 text-sm text-brisk-subtext">Settling on Sui…</Text>
              </Animated.View>
            ) : null}

            {status === "done" && result && invoice ? (
              <SuccessSheet
                amountMicros={invoice.amountMicros}
                subtitle={`to ${invoice.merchant}`}
                caption={
                  result.receiptIssued
                    ? "Settled on Sui in seconds — on-chain receipt minted, zero gas."
                    : "Settled on Sui in seconds — zero gas."
                }
                footer={<PrimaryButton label="Done" onPress={reset} />}
              />
            ) : null}

            {status === "nfc_off" ? (
              <Animated.View entering={FadeIn.duration(300)} className="items-center">
                <SmartphoneNfc color={theme.subtext} size={64} />
                <Text className="mt-4 text-lg font-inter-semibold text-brisk-text">
                  Turn on NFC
                </Text>
                <Text className="mt-1 text-center text-sm text-brisk-subtext">
                  Brisk needs NFC to tap and pay. Enable it in settings, then try again.
                </Text>
                <View className="mt-8 w-full max-w-[360px]">
                  <PrimaryButton label="Open NFC settings" onPress={() => void openNfcSettings()} />
                  <Pressable className="mt-3 py-3" onPress={() => void tapToRead()}>
                    <Text className="text-center text-sm text-brisk-subtext">Try again</Text>
                  </Pressable>
                </View>
              </Animated.View>
            ) : null}

            {status === "error" ? (
              <Animated.View entering={FadeIn.duration(300)} className="items-center">
                <XCircle color={theme.danger} size={64} />
                <Text className="mt-4 text-lg font-inter-semibold text-brisk-text">
                  That didn&apos;t go through
                </Text>
                <Text className="mt-1 text-center text-sm text-brisk-subtext">{error}</Text>
                <Text className="mt-1 text-center text-xs text-brisk-subtext">
                  Nothing was charged — give it another tap.
                </Text>
                <View className="mt-8 w-full max-w-[360px]">
                  <PrimaryButton label="Try again" onPress={reset} />
                </View>
              </Animated.View>
            ) : null}
          </View>
        </SafeAreaView>
      </AuroraBackground>
    </View>
  );
}
