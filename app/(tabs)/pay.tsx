import { Pressable, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import Animated, { FadeIn } from "react-native-reanimated";
import { useRouter } from "expo-router";
import { QrCode, SmartphoneNfc } from "lucide-react-native";

import { PrimaryButton } from "@/components/ui/PrimaryButton";
import { AuroraBackground } from "@/components/ui/AuroraBackground";
import { BusinessAvatar } from "@/components/ui/BusinessAvatar";
import { PulseRing } from "@/components/ui/PulseRing";
import { StatusView } from "@/components/ui/StatusView";
import { PayConfirm } from "@/components/pay/PayConfirm";
import { usePay } from "@/hooks/usePay";
import { usePayFlow } from "@/hooks/usePayFlow";
import { openNfcSettings } from "@/services/nfc/reader";
import { CONTENT_MAX, DURATION, ICON } from "@/theme/scale";
import { useTheme } from "@/hooks/useTheme";

// Customer "Pay" tab (iOS + Android). Tap the Brisk Terminal -> review ->
// Confirm & Pay -> feeless settlement. The whole point of the app. The review →
// settle → done/error tail is the shared PayConfirm; this screen only owns the
// NFC-read head.
export default function PayScreen() {
  const theme = useTheme();
  const router = useRouter();
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
                headerSlot={
                  <BusinessAvatar
                    seed={invoice.merchantId ?? invoice.merchant}
                    label={invoice.merchant?.[0]?.toUpperCase()}
                  />
                }
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
              <Animated.View entering={FadeIn.duration(DURATION.fast)} className="items-center">
                <PulseRing size={64} color={status === "reading" ? theme.accent : theme.bg2}>
                  <SmartphoneNfc color={theme.accent} size={64} />
                </PulseRing>
                <Text className="mt-6 text-2xl font-inter-bold text-brisk-text">Tap to pay</Text>
                <Text className="mt-2 text-center text-sm text-brisk-subtext">
                  Hold your phone near the Brisk Terminal — pay in USDC, no gas, exact amount.
                </Text>
                <View style={{ maxWidth: CONTENT_MAX }} className="mt-8 w-full">
                  <PrimaryButton
                    label={status === "reading" ? "Hold near terminal…" : "Tap to pay"}
                    onPress={onTap}
                    loading={status === "reading"}
                  />
                  {status === "reading" ? (
                    <Pressable className="mt-3 py-3" onPress={cancel}>
                      <Text className="text-center text-sm text-brisk-subtext">Cancel</Text>
                    </Pressable>
                  ) : (
                    <Pressable
                      className="mt-3 flex-row items-center justify-center py-3"
                      onPress={() => router.push("/scan")}
                      accessibilityRole="button"
                      accessibilityLabel="Scan a QR code"
                    >
                      <QrCode color={theme.accent} size={ICON.inlineAction} />
                      <Text className="ml-2 text-center text-sm font-inter-semibold text-brisk-accent">
                        Scan a QR code
                      </Text>
                    </Pressable>
                  )}
                </View>
              </Animated.View>
            ) : null}

            {status === "nfc_off" ? (
              <StatusView
                variant="neutral"
                Icon={SmartphoneNfc}
                glyphTone="subtext"
                title="Turn on NFC"
                message="Brisk needs NFC to tap and pay. Enable it in settings, then try again."
                actions={
                  <>
                    <PrimaryButton
                      label="Open NFC settings"
                      onPress={() => void openNfcSettings()}
                    />
                    <PrimaryButton label="Try again" variant="secondary" onPress={onTap} />
                  </>
                }
              />
            ) : null}

            {status === "error" ? (
              <StatusView
                variant="error"
                title="That didn’t go through"
                message={error ?? "Nothing was charged — give it another tap."}
                actions={<PrimaryButton label="Try again" onPress={toIdle} />}
              />
            ) : null}
          </View>
        </SafeAreaView>
      </AuroraBackground>
    </View>
  );
}
