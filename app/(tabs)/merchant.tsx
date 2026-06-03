import { useState } from "react";
import { Text, TextInput, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import Animated, { FadeIn } from "react-native-reanimated";
import { Smartphone, Store } from "lucide-react-native";

import { PrimaryButton } from "@/components/ui/PrimaryButton";
import { AnimatedCheck } from "@/components/ui/AnimatedCheck";
import { AuroraText } from "@/components/ui/AuroraText";
import { AuroraBackground } from "@/components/ui/AuroraBackground";
import { PulseRing } from "@/components/ui/PulseRing";
import { useCharge } from "@/hooks/useCharge";
import { useCountUp } from "@/hooks/useCountUp";
import { isHceAvailable } from "@/services/nfc/hce";
import { openNfcSettings } from "@/services/nfc/reader";
import { formatUsd, usdToMicros } from "@/services/blockchain/paymentTx";
import { BRISK } from "@/theme/tokens";

// Merchant "Charge" tab = the Brisk Terminal (Android/HCE). Enter an amount,
// emulate the invoice tag, await settlement. iOS can't present a tag (HCE is
// Android-only), so it shows guidance to run the terminal on Android.
export default function ChargeScreen() {
  const { status, invoice, error, startCharge, cancel } = useCharge();
  const [amountText, setAmountText] = useState("");
  // Count the received amount up on the paid screen.
  const paidShown = useCountUp(status === "paid" && invoice ? invoice.amountMicros : 0, 700);

  if (!isHceAvailable) {
    return (
      <View className="flex-1 bg-brisk-bg0">
        <AuroraBackground>
          <SafeAreaView edges={["top"]} className="flex-1 px-5 pt-10">
            <View className="flex-1 items-center justify-center">
              <Smartphone color={BRISK.subtext} size={56} />
              <Text className="mt-6 text-xl font-inter-bold text-brisk-text">
                Terminal runs on Android
              </Text>
              <Text className="mt-2 text-center text-sm text-brisk-subtext">
                The Brisk Terminal emulates the tap tag via Android HCE. Run Charge on an Android
                device; customers tap to pay from iPhone or Android.
              </Text>
            </View>
          </SafeAreaView>
        </AuroraBackground>
      </View>
    );
  }

  const amountMicros = usdToMicros(Number(amountText || "0"));
  const canCharge = amountMicros > 0;

  return (
    <View className="flex-1 bg-brisk-bg0">
      <AuroraBackground>
        <SafeAreaView edges={["top"]} className="flex-1 px-5 pt-10">
          <View className="flex-1 items-center justify-center">
            {status === "idle" ? (
              <Animated.View
                entering={FadeIn.duration(300)}
                className="w-full max-w-[360px] items-center"
              >
                <Store color={BRISK.accent} size={56} />
                <Text className="mt-6 text-2xl font-inter-bold text-brisk-text">Charge</Text>
                <Text className="mt-2 text-center text-sm text-brisk-subtext">
                  Enter the amount, then have the customer tap.
                </Text>
                <View className="mt-8 w-full flex-row items-center rounded-2xl border border-brisk-borderStrong bg-brisk-bg1/70 px-5 py-4">
                  <Text className="text-3xl font-inter-bold text-brisk-subtext">$</Text>
                  <TextInput
                    className="ml-2 flex-1 text-3xl font-inter-bold text-brisk-text"
                    style={{ padding: 0 }}
                    placeholder="0.00"
                    placeholderTextColor={BRISK.placeholder}
                    keyboardType="decimal-pad"
                    value={amountText}
                    onChangeText={setAmountText}
                    autoFocus
                    accessibilityLabel="Charge amount in US dollars"
                    accessibilityHint="Enter the amount to charge the customer"
                  />
                </View>
                <View className="mt-8 w-full">
                  <PrimaryButton
                    label="Charge"
                    onPress={() => void startCharge(amountMicros)}
                    disabled={!canCharge}
                  />
                </View>
              </Animated.View>
            ) : null}

            {status === "preparing" ? (
              <Animated.View entering={FadeIn.duration(300)} className="items-center">
                <PulseRing size={56}>
                  <Store color={BRISK.accent} size={56} />
                </PulseRing>
                <Text className="mt-6 text-sm uppercase tracking-[2px] text-brisk-subtext">
                  Preparing terminal
                </Text>
                <Text className="mt-3 text-sm text-brisk-subtext">Setting up your merchant…</Text>
              </Animated.View>
            ) : null}

            {status === "awaiting" && invoice ? (
              <Animated.View entering={FadeIn.duration(300)} className="items-center">
                <PulseRing size={56}>
                  <Smartphone color={BRISK.accent} size={56} />
                </PulseRing>
                <Text className="mt-6 text-sm uppercase tracking-[2px] text-brisk-subtext">
                  Tap to pay
                </Text>
                <AuroraText className="mt-2 text-5xl font-inter-extrabold">
                  {formatUsd(invoice.amountMicros)}
                </AuroraText>
                <Text className="mt-3 text-sm text-brisk-subtext">
                  Waiting for the customer to tap…
                </Text>
                <View className="mt-8 w-full max-w-[360px]">
                  <PrimaryButton label="Cancel" variant="secondary" onPress={() => void cancel()} />
                </View>
              </Animated.View>
            ) : null}

            {status === "paid" && invoice ? (
              <Animated.View entering={FadeIn.duration(300)} className="items-center">
                <AnimatedCheck size={72} />
                <Text className="mt-5 text-2xl font-inter-bold text-brisk-text">Paid</Text>
                <AuroraText className="mt-1 text-3xl font-inter-extrabold">
                  {formatUsd(Math.round(paidShown))}
                </AuroraText>
                <Text className="mt-1 text-base text-brisk-subtext">received</Text>
                <View className="mt-8 w-full max-w-[360px]">
                  <PrimaryButton label="New charge" onPress={() => void cancel()} />
                </View>
              </Animated.View>
            ) : null}

            {status === "nfc_off" ? (
              <Animated.View entering={FadeIn.duration(300)} className="items-center">
                <Smartphone color={BRISK.subtext} size={56} />
                <Text className="mt-6 text-lg font-inter-semibold text-brisk-text">
                  Turn on NFC
                </Text>
                <Text className="mt-1 text-center text-sm text-brisk-subtext">
                  Enable NFC to present the tap tag to customers.
                </Text>
                <View className="mt-8 w-full max-w-[360px]">
                  <PrimaryButton label="Open NFC settings" onPress={() => void openNfcSettings()} />
                  <View className="mt-3">
                    <PrimaryButton label="Back" variant="secondary" onPress={() => void cancel()} />
                  </View>
                </View>
              </Animated.View>
            ) : null}

            {status === "timeout" || status === "error" ? (
              <Animated.View entering={FadeIn.duration(300)} className="items-center">
                <Text className="text-lg font-inter-semibold text-brisk-text">
                  {status === "timeout" ? "No payment yet" : "Charge didn’t complete"}
                </Text>
                <Text className="mt-1 text-center text-sm text-brisk-subtext">
                  {error ?? "Your customer can tap again to pay."}
                </Text>
                <View className="mt-8 w-full max-w-[360px]">
                  <PrimaryButton label="Try again" onPress={() => void cancel()} />
                </View>
              </Animated.View>
            ) : null}
          </View>
        </SafeAreaView>
      </AuroraBackground>
    </View>
  );
}
