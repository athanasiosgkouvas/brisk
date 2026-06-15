import { useState } from "react";
import { ActivityIndicator, Pressable, Text, TextInput, View } from "react-native";
import Animated, { FadeIn } from "react-native-reanimated";
import { useRouter } from "expo-router";
import * as Clipboard from "expo-clipboard";
import { ClipboardPaste } from "lucide-react-native";

import { Screen } from "@/components/ui/Screen";
import { PrimaryButton } from "@/components/ui/PrimaryButton";
import { SuccessSheet } from "@/components/ui/SuccessSheet";
import { ErrorText } from "@/components/ui/ErrorText";
import { useSend } from "@/hooks/useSend";
import { usdToMicros } from "@/services/blockchain/paymentTx";
import { useTheme } from "@/hooks/useTheme";

// Send / withdraw: cash out USDC to any Sui address — feeless. Paste the address,
// enter the amount, Face ID, done.
export default function SendScreen() {
  const theme = useTheme();
  const router = useRouter();
  const { status, error, send, reset } = useSend();
  const [to, setTo] = useState("");
  const [amountText, setAmountText] = useState("");
  const micros = usdToMicros(Number(amountText || "0"));
  const busy = status === "authorizing" || status === "sending";

  const close = () => {
    reset();
    router.back();
  };

  const paste = async () => setTo((await Clipboard.getStringAsync()).trim());

  return (
    <Screen title="Send" onClose={close}>
      {status === "done" ? (
        <View className="flex-1 items-center justify-center">
          <SuccessSheet
            amountMicros={micros}
            title="Sent"
            subtitle="no fee"
            footer={<PrimaryButton label="Done" onPress={close} />}
          />
        </View>
      ) : busy ? (
        <Animated.View
          entering={FadeIn.duration(300)}
          className="flex-1 items-center justify-center"
        >
          <ActivityIndicator color={theme.accent} size="large" />
          <Text className="mt-4 text-sm text-brisk-subtext">
            {status === "authorizing" ? "Authorizing…" : "Sending on Sui…"}
          </Text>
        </Animated.View>
      ) : (
        <View className="flex-1">
          <Text className="mb-2 text-sm text-brisk-subtext">Recipient address</Text>
          <View className="flex-row items-center rounded-2xl border border-brisk-borderStrong bg-brisk-bg1/70 px-4 py-3">
            <TextInput
              className="flex-1 text-base text-brisk-text"
              placeholder="0x…"
              placeholderTextColor={theme.placeholder}
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
              <ClipboardPaste color={theme.accent} size={18} />
              <Text className="ml-1 text-sm font-inter-semibold text-brisk-accent">Paste</Text>
            </Pressable>
          </View>

          <Text className="mb-2 mt-5 text-sm text-brisk-subtext">Amount</Text>
          <View className="flex-row items-center rounded-2xl border border-brisk-borderStrong bg-brisk-bg1/70 px-4 py-3">
            <Text className="text-2xl font-inter-bold text-brisk-subtext">$</Text>
            <TextInput
              className="ml-1 flex-1 text-2xl font-inter-bold text-brisk-text"
              placeholder="0.00"
              placeholderTextColor={theme.placeholder}
              keyboardType="decimal-pad"
              value={amountText}
              onChangeText={setAmountText}
              accessibilityLabel="Amount in US dollars"
              accessibilityHint="Enter the amount of USDC to send"
            />
          </View>

          {status === "error" ? <ErrorText className="mt-4">{error}</ErrorText> : null}

          <View className="mt-8">
            <PrimaryButton
              label="Send"
              onPress={() => void send(to, micros)}
              disabled={!to || micros <= 0}
            />
          </View>
          <Text className="mt-3 text-center text-xs text-brisk-subtext">
            Feeless — you&apos;re charged exactly the amount.
          </Text>
        </View>
      )}
    </Screen>
  );
}
