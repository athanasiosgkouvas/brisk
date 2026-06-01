import { ActivityIndicator, Pressable, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { CheckCircle2, QrCode, XCircle } from "lucide-react-native";

import { PrimaryButton } from "@/components/ui/PrimaryButton";
import { usePay } from "@/hooks/usePay";
import { formatUsd } from "@/services/blockchain/paymentTx";

// Customer "Pay" tab (iOS + Android). Tap the Brisk Terminal -> review ->
// Confirm & Pay -> feeless settlement. The whole point of the app.
export default function PayScreen() {
  const { status, invoice, result, error, tapToRead, confirmAndPay, reset } = usePay();

  return (
    <SafeAreaView edges={["top"]} className="flex-1 bg-brisk-bg0 px-5 pt-10">
      <View className="flex-1 items-center justify-center">
        {status === "idle" || status === "reading" ? (
          <>
            <QrCode color="#00D98B" size={64} />
            <Text className="mt-6 text-2xl font-bold text-brisk-text">Tap to pay</Text>
            <Text className="mt-2 text-center text-sm text-brisk-subtext">
              Hold your phone to the Brisk Terminal. Pay in USDC — no gas, exact amount.
            </Text>
            <View className="mt-8 w-full max-w-[360px]">
              <PrimaryButton
                label={status === "reading" ? "Hold near terminal…" : "Tap to pay"}
                onPress={() => void tapToRead()}
                loading={status === "reading"}
              />
            </View>
          </>
        ) : null}

        {status === "review" && invoice ? (
          <View className="w-full max-w-[360px] items-center">
            <Text className="text-sm uppercase tracking-[2px] text-brisk-subtext">Pay</Text>
            <Text className="mt-2 text-5xl font-bold text-brisk-text">
              {formatUsd(invoice.amountMicros)}
            </Text>
            <Text className="mt-2 text-base text-brisk-subtext">to {invoice.merchant}</Text>
            <View className="mt-8 w-full">
              <PrimaryButton label="Confirm & Pay" onPress={() => void confirmAndPay()} />
              <Pressable className="mt-3 py-3" onPress={reset}>
                <Text className="text-center text-sm text-brisk-subtext">Cancel</Text>
              </Pressable>
            </View>
          </View>
        ) : null}

        {status === "paying" ? (
          <View className="items-center">
            <ActivityIndicator color="#00D98B" size="large" />
            <Text className="mt-4 text-sm text-brisk-subtext">Settling on Sui…</Text>
          </View>
        ) : null}

        {status === "done" && result && invoice ? (
          <View className="items-center">
            <CheckCircle2 color="#00D98B" size={64} />
            <Text className="mt-4 text-2xl font-bold text-brisk-text">Paid</Text>
            <Text className="mt-1 text-base text-brisk-subtext">
              {formatUsd(invoice.amountMicros)} to {invoice.merchant}
            </Text>
            <Text className="mt-1 text-xs text-brisk-subtext">
              {result.method === "gasless" ? "Gasless transfer" : "Sponsored — you paid no gas"}
            </Text>
            <View className="mt-8 w-full max-w-[360px]">
              <PrimaryButton label="Done" onPress={reset} />
            </View>
          </View>
        ) : null}

        {status === "error" ? (
          <View className="items-center">
            <XCircle color="#FF5A76" size={64} />
            <Text className="mt-4 text-lg font-semibold text-brisk-text">Something went wrong</Text>
            <Text className="mt-1 text-center text-sm text-brisk-subtext">{error}</Text>
            <View className="mt-8 w-full max-w-[360px]">
              <PrimaryButton label="Try again" onPress={reset} />
            </View>
          </View>
        ) : null}
      </View>
    </SafeAreaView>
  );
}
