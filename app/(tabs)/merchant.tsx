import { useState } from "react";
import { Text, TextInput, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Smartphone, Store } from "lucide-react-native";

import { PrimaryButton } from "@/components/ui/PrimaryButton";
import { AnimatedCheck } from "@/components/ui/AnimatedCheck";
import { PulseRing } from "@/components/ui/PulseRing";
import { useCharge } from "@/hooks/useCharge";
import { useCountUp } from "@/hooks/useCountUp";
import { isHceAvailable } from "@/services/nfc/hce";
import { formatUsd, usdToMicros } from "@/services/blockchain/paymentTx";

// Merchant "Charge" tab = the Brisk Terminal (Android/HCE). Enter an amount,
// emulate the invoice tag, await settlement. iOS can't present a tag, so it
// shows guidance (QR fallback lands in a later step).
export default function ChargeScreen() {
  const { status, invoice, error, startCharge, cancel } = useCharge();
  const [amountText, setAmountText] = useState("");
  // Count the received amount up on the paid screen.
  const paidShown = useCountUp(status === "paid" && invoice ? invoice.amountMicros : 0, 700);

  if (!isHceAvailable) {
    return (
      <SafeAreaView edges={["top"]} className="flex-1 bg-brisk-bg0 px-5 pt-10">
        <View className="flex-1 items-center justify-center">
          <Smartphone color="#8B98A5" size={56} />
          <Text className="mt-6 text-xl font-bold text-brisk-text">Terminal runs on Android</Text>
          <Text className="mt-2 text-center text-sm text-brisk-subtext">
            The Brisk Terminal emulates the tap tag via Android HCE. Run Charge on an Android
            device; customers tap to pay from iPhone or Android. (QR fallback coming next.)
          </Text>
        </View>
      </SafeAreaView>
    );
  }

  const amountMicros = usdToMicros(Number(amountText || "0"));
  const canCharge = amountMicros > 0;

  return (
    <SafeAreaView edges={["top"]} className="flex-1 bg-brisk-bg0 px-5 pt-10">
      <View className="flex-1 items-center justify-center">
        {status === "idle" ? (
          <View className="w-full max-w-[360px] items-center">
            <Store color="#00D98B" size={56} />
            <Text className="mt-6 text-2xl font-bold text-brisk-text">Charge</Text>
            <Text className="mt-2 text-center text-sm text-brisk-subtext">
              Enter the amount, then have the customer tap.
            </Text>
            <View className="mt-8 w-full flex-row items-center rounded-2xl border border-[#2C3E55] bg-brisk-bg1 px-5 py-4">
              <Text className="text-3xl font-bold text-brisk-subtext">$</Text>
              <TextInput
                className="ml-2 flex-1 text-3xl font-bold text-brisk-text"
                style={{ padding: 0 }}
                placeholder="0.00"
                placeholderTextColor="#5A6B7B"
                keyboardType="decimal-pad"
                value={amountText}
                onChangeText={setAmountText}
                autoFocus
              />
            </View>
            <View className="mt-8 w-full">
              <PrimaryButton
                label="Charge"
                onPress={() => void startCharge(amountMicros)}
                disabled={!canCharge}
              />
            </View>
          </View>
        ) : null}

        {status === "awaiting" && invoice ? (
          <View className="items-center">
            <PulseRing size={56}>
              <Smartphone color="#00D98B" size={56} />
            </PulseRing>
            <Text className="mt-6 text-sm uppercase tracking-[2px] text-brisk-subtext">
              Tap to pay
            </Text>
            <Text className="mt-2 text-5xl font-bold text-brisk-text">
              {formatUsd(invoice.amountMicros)}
            </Text>
            <Text className="mt-3 text-sm text-brisk-subtext">
              Waiting for the customer to tap…
            </Text>
            <View className="mt-8 w-full max-w-[360px]">
              <PrimaryButton label="Cancel" variant="secondary" onPress={() => void cancel()} />
            </View>
          </View>
        ) : null}

        {status === "paid" && invoice ? (
          <View className="items-center">
            <AnimatedCheck size={72} />
            <Text className="mt-5 text-2xl font-bold text-brisk-text">Paid</Text>
            <Text className="mt-1 text-3xl font-bold text-brisk-accent">
              {formatUsd(Math.round(paidShown))}
            </Text>
            <Text className="mt-1 text-base text-brisk-subtext">received</Text>
            <View className="mt-8 w-full max-w-[360px]">
              <PrimaryButton label="New charge" onPress={() => void cancel()} />
            </View>
          </View>
        ) : null}

        {status === "timeout" || status === "error" ? (
          <View className="items-center">
            <Text className="text-lg font-semibold text-brisk-text">
              {status === "timeout" ? "No payment detected" : "Charge failed"}
            </Text>
            {error ? (
              <Text className="mt-1 text-center text-sm text-brisk-subtext">{error}</Text>
            ) : null}
            <View className="mt-8 w-full max-w-[360px]">
              <PrimaryButton label="Try again" onPress={() => void cancel()} />
            </View>
          </View>
        ) : null}
      </View>
    </SafeAreaView>
  );
}
