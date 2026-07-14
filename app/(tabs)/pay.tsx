import { Pressable, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import Animated, { FadeIn } from "react-native-reanimated";
import { SmartphoneNfc, XCircle } from "lucide-react-native";

import { PrimaryButton } from "@/components/ui/PrimaryButton";
import { AuroraBackground } from "@/components/ui/AuroraBackground";
import { PulseRing } from "@/components/ui/PulseRing";
import { PayConfirm } from "@/components/pay/PayConfirm";
import { usePay } from "@/hooks/usePay";
import { usePayFlow } from "@/hooks/usePayFlow";
import { openNfcSettings } from "@/services/nfc/reader";
import { useTheme } from "@/hooks/useTheme";

// Customer "Pay" tab (iOS + Android). Tap the Brisk Terminal -> review ->
// Confirm & Pay -> feeless settlement. The whole point of the app. The review →
// settle → done/error tail is the shared PayConfirm; this screen only owns the
// NFC-read head.
export default function PayScreen() {
  const theme = useTheme();
  const { status, invoice, error, tapToRead, settle, reset, cancel } = usePay();
  const flow = usePayFlow();

  // Start a fresh read: clear any prior tail state, then read the tag.
  const onTap = () => {
    flow.reset();
    void tapToRead();
  };

  // Return to idle for a fresh tap (used by cancel, done, and settle-error).
  const toIdle = () => {
    flow.reset();
    reset();
  };

  return (
    <View className="flex-1 bg-brisk-bg0">
      <AuroraBackground>
        <SafeAreaView edges={["top"]} className="flex-1 px-5 pt-10">
          <View className="flex-1 items-center justify-center">
            {/* Once an invoice is read, hand off to the shared pay tail. */}
            {status === "review" && invoice ? (
              <PayConfirm
                state={flow.state}
                amountMicros={invoice.amountMicros}
                eyebrow="Pay"
                payeeLabel={`to ${invoice.merchant}`}
                confirmLabel="Confirm & Pay"
                onConfirm={() => void flow.confirm({ settle })}
                onCancel={toIdle}
                success={{
                  subtitle: `to ${invoice.merchant}`,
                  caption: flow.result?.receiptIssued
                    ? "Settled on Sui in seconds — on-chain receipt minted, zero gas."
                    : "Settled on Sui in seconds — zero gas.",
                  footer: <PrimaryButton label="Done" onPress={toIdle} />,
                }}
                errorMessage={flow.error}
                errorHint="Nothing was charged — give it another tap."
                onRetry={toIdle}
              />
            ) : null}

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
                    onPress={onTap}
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
                  <Pressable className="mt-3 py-3" onPress={onTap}>
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
                  <PrimaryButton label="Try again" onPress={toIdle} />
                </View>
              </Animated.View>
            ) : null}
          </View>
        </SafeAreaView>
      </AuroraBackground>
    </View>
  );
}
