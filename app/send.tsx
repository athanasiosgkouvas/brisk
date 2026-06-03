import { useState } from "react";
import { ActivityIndicator, Pressable, Text, TextInput, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import * as Clipboard from "expo-clipboard";
import { CheckCircle2, ClipboardPaste, X, XCircle } from "lucide-react-native";

import { PrimaryButton } from "@/components/ui/PrimaryButton";
import { useSend } from "@/hooks/useSend";
import { formatUsd, usdToMicros } from "@/services/blockchain/paymentTx";

// Send / withdraw: cash out USDC to any Sui address — feeless. Paste the address,
// enter the amount, Face ID, done.
export default function SendScreen() {
  const router = useRouter();
  const { status, error, send, reset } = useSend();
  const [to, setTo] = useState("");
  const [amountText, setAmountText] = useState("");
  const micros = usdToMicros(Number(amountText || "0"));
  const busy = status === "authorizing" || status === "sending";

  const paste = async () => setTo((await Clipboard.getStringAsync()).trim());

  return (
    <SafeAreaView edges={["top"]} className="flex-1 bg-brisk-bg0 px-5">
      <View className="flex-row items-center justify-between py-4">
        <Text className="text-lg font-bold text-brisk-text">Send</Text>
        <Pressable
          onPress={() => {
            reset();
            router.back();
          }}
          hitSlop={12}
        >
          <X color="#8B98A5" size={24} />
        </Pressable>
      </View>

      {status === "done" ? (
        <View className="flex-1 items-center justify-center">
          <CheckCircle2 color="#00D98B" size={64} />
          <Text className="mt-4 text-2xl font-bold text-brisk-text">Sent</Text>
          <Text className="mt-1 text-base text-brisk-subtext">{formatUsd(micros)} — no fee</Text>
          <View className="mt-8 w-full max-w-[360px]">
            <PrimaryButton
              label="Done"
              onPress={() => {
                reset();
                router.back();
              }}
            />
          </View>
        </View>
      ) : busy ? (
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator color="#00D98B" size="large" />
          <Text className="mt-4 text-sm text-brisk-subtext">
            {status === "authorizing" ? "Authorizing…" : "Sending on Sui…"}
          </Text>
        </View>
      ) : (
        <View className="flex-1">
          <Text className="mb-2 text-sm text-brisk-subtext">Recipient address</Text>
          <View className="flex-row items-center rounded-2xl border border-[#2C3E55] bg-brisk-bg1 px-4 py-3">
            <TextInput
              className="flex-1 text-base text-brisk-text"
              placeholder="0x…"
              placeholderTextColor="#5A6B7B"
              value={to}
              onChangeText={setTo}
              autoCapitalize="none"
              autoCorrect={false}
              accessibilityLabel="Recipient Sui address"
              accessibilityHint="Paste or type the address to send USDC to"
            />
            <Pressable
              onPress={paste}
              hitSlop={8}
              className="ml-2 flex-row items-center"
              accessibilityRole="button"
              accessibilityLabel="Paste address from clipboard"
            >
              <ClipboardPaste color="#00D98B" size={18} />
              <Text className="ml-1 text-sm font-semibold text-brisk-accent">Paste</Text>
            </Pressable>
          </View>

          <Text className="mb-2 mt-5 text-sm text-brisk-subtext">Amount</Text>
          <View className="flex-row items-center rounded-2xl border border-[#2C3E55] bg-brisk-bg1 px-4 py-3">
            <Text className="text-2xl font-bold text-brisk-subtext">$</Text>
            <TextInput
              className="ml-1 flex-1 text-2xl font-bold text-brisk-text"
              placeholder="0.00"
              placeholderTextColor="#5A6B7B"
              keyboardType="decimal-pad"
              value={amountText}
              onChangeText={setAmountText}
              accessibilityLabel="Amount in US dollars"
              accessibilityHint="Enter the amount of USDC to send"
            />
          </View>

          {status === "error" && error ? (
            <View className="mt-4 flex-row items-center">
              <XCircle color="#FF5A76" size={16} />
              <Text className="ml-2 text-sm text-brisk-danger">{error}</Text>
            </View>
          ) : null}

          <View className="mt-8">
            <PrimaryButton
              label="Send"
              onPress={() => void send(to, micros)}
              disabled={!to || micros <= 0}
            />
          </View>
          <Text className="mt-3 text-center text-xs text-brisk-subtext">
            Feeless — you're charged exactly the amount.
          </Text>
        </View>
      )}
    </SafeAreaView>
  );
}
