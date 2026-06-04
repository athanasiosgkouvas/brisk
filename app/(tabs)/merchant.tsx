import { useState } from "react";
import { Pressable, Share, Text, TextInput, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import Animated, { FadeIn } from "react-native-reanimated";
import QRCode from "react-native-qrcode-svg";
import { LinearGradient } from "expo-linear-gradient";
import * as Clipboard from "expo-clipboard";
import { Check, Copy, Share2, Smartphone, Store } from "lucide-react-native";

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

// Merchant "Charge" tab. Two ways to get paid:
//  - Tap (Android/HCE): emulate the invoice tag, customer taps to read.
//  - Payment link (all platforms, incl. iOS): mint a shareable link, send it
//    over any channel, and the customer pays remotely with one tap.
// Both await on-chain settlement and flip to the same "paid" screen.
export default function ChargeScreen() {
  const { status, invoice, linkUrl, error, startCharge, createLink, cancel } = useCharge();
  const [amountText, setAmountText] = useState("");
  const [copied, setCopied] = useState(false);
  // Count the received amount up on the paid screen.
  const paidShown = useCountUp(status === "paid" && invoice ? invoice.amountMicros : 0, 700);

  const amountMicros = usdToMicros(Number(amountText || "0"));
  const canCharge = amountMicros > 0;

  const copyLink = async () => {
    if (!linkUrl) return;
    await Clipboard.setStringAsync(linkUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  const shareLink = async () => {
    if (!linkUrl || !invoice) return;
    await Share.share({
      message: `Pay ${formatUsd(invoice.amountMicros)} with Brisk: ${linkUrl}`,
    }).catch(() => {});
  };

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
                  {isHceAvailable
                    ? "Enter the amount — have the customer tap, or send a payment link."
                    : "Enter the amount, then send the customer a payment link to pay."}
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
                  {isHceAvailable ? (
                    <PrimaryButton
                      label="Charge by tap"
                      onPress={() => void startCharge(amountMicros)}
                      disabled={!canCharge}
                    />
                  ) : null}
                  <View className={isHceAvailable ? "mt-3" : ""}>
                    <PrimaryButton
                      label="Create payment link"
                      variant={isHceAvailable ? "secondary" : "primary"}
                      onPress={() => void createLink(amountMicros)}
                      disabled={!canCharge}
                    />
                  </View>
                </View>
              </Animated.View>
            ) : null}

            {status === "preparing" ? (
              <Animated.View entering={FadeIn.duration(300)} className="items-center">
                <PulseRing size={56}>
                  <Store color={BRISK.accent} size={56} />
                </PulseRing>
                <Text className="mt-6 text-sm uppercase tracking-[2px] text-brisk-subtext">
                  Preparing
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

            {status === "link" && invoice && linkUrl ? (
              <Animated.View
                entering={FadeIn.duration(300)}
                className="w-full max-w-[360px] items-center"
              >
                <Text className="text-sm uppercase tracking-[2px] text-brisk-subtext">
                  Payment link
                </Text>
                <AuroraText className="mt-2 text-4xl font-inter-extrabold">
                  {formatUsd(invoice.amountMicros)}
                </AuroraText>
                {/* White QR card for scannability (matches Receive). */}
                <LinearGradient
                  colors={BRISK.aurora}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 1 }}
                  style={{ borderRadius: 24, padding: 3, marginTop: 20 }}
                >
                  <View className="rounded-3xl bg-white p-4" accessible accessibilityRole="image">
                    <QRCode value={linkUrl} size={180} />
                  </View>
                </LinearGradient>

                <View className="mt-6 w-full flex-row gap-3">
                  <View className="flex-1">
                    <Pressable
                      onPress={copyLink}
                      className="flex-row items-center justify-center rounded-2xl border border-brisk-borderStrong bg-brisk-bg1/70 px-4 py-3"
                      accessibilityRole="button"
                      accessibilityLabel={copied ? "Link copied" : "Copy payment link"}
                    >
                      {copied ? (
                        <Check color={BRISK.accent} size={18} />
                      ) : (
                        <Copy color={BRISK.text} size={18} />
                      )}
                      <Text className="ml-2 font-inter-semibold text-brisk-text">
                        {copied ? "Copied" : "Copy"}
                      </Text>
                    </Pressable>
                  </View>
                  <View className="flex-1">
                    <Pressable
                      onPress={shareLink}
                      className="flex-row items-center justify-center rounded-2xl border border-brisk-borderStrong bg-brisk-bg1/70 px-4 py-3"
                      accessibilityRole="button"
                      accessibilityLabel="Share payment link"
                    >
                      <Share2 color={BRISK.text} size={18} />
                      <Text className="ml-2 font-inter-semibold text-brisk-text">Share</Text>
                    </Pressable>
                  </View>
                </View>

                <Text className="mt-5 text-sm text-brisk-subtext">Waiting for payment…</Text>
                <View className="mt-4 w-full">
                  <PrimaryButton label="Done" variant="secondary" onPress={() => void cancel()} />
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
                  Enable NFC to present the tap tag — or create a payment link instead.
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
