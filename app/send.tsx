import { useState } from "react";
import { Pressable, Text, TextInput, View } from "react-native";
import { useRouter } from "expo-router";
import * as Clipboard from "expo-clipboard";
import { ClipboardPaste } from "lucide-react-native";

import { Screen } from "@/components/ui/Screen";
import { PrimaryButton } from "@/components/ui/PrimaryButton";
import { ErrorText } from "@/components/ui/ErrorText";
import { PayConfirm } from "@/components/pay/PayConfirm";
import { useSend } from "@/hooks/useSend";
import { usePayFlow } from "@/hooks/usePayFlow";
import { usdToMicros } from "@/services/blockchain/paymentTx";
import { useTheme } from "@/hooks/useTheme";

function shortAddr(a: string): string {
  return a.length > 12 ? `${a.slice(0, 6)}…${a.slice(-4)}` : a;
}

// Send / withdraw: cash out USDC to any Sui address — feeless. Paste the address
// and amount, review, Face ID on confirm, done. The review → settle → done tail
// is the shared PayConfirm; this screen owns the address/amount form.
export default function SendScreen() {
  const theme = useTheme();
  const router = useRouter();
  const { validate, authorize, settle } = useSend();
  const flow = usePayFlow();
  const [to, setTo] = useState("");
  const [amountText, setAmountText] = useState("");
  const [reviewing, setReviewing] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const micros = usdToMicros(Number(amountText || "0"));

  const close = () => router.back();
  const paste = async () => setTo((await Clipboard.getStringAsync()).trim());

  // Form → review: validate, then hand off to the shared tail.
  const onReview = () => {
    const err = validate(to, micros);
    if (err) {
      setFormError(err);
      return;
    }
    setFormError(null);
    flow.reset();
    setReviewing(true);
  };

  const backToForm = () => {
    flow.reset();
    setReviewing(false);
  };

  return (
    <Screen title="Send" onClose={close}>
      {reviewing ? (
        <View className="flex-1 items-center justify-center">
          <PayConfirm
            state={flow.state}
            amountMicros={micros}
            eyebrow="Send"
            payeeLabel={`to ${shortAddr(to)}`}
            confirmLabel="Confirm & Pay"
            settlingLabel="Sending on Sui…"
            onConfirm={() =>
              void flow.confirm({
                authorize: () => authorize(micros),
                settle: () => settle(to, micros),
              })
            }
            onCancel={backToForm}
            success={{
              title: "Sent",
              subtitle: "no fee",
              footer: <PrimaryButton label="Done" onPress={close} />,
            }}
            errorMessage={flow.error}
            errorHint="Nothing was sent — check the details and try again."
            onRetry={backToForm}
            retryLabel="Back"
          />
        </View>
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

          {formError ? <ErrorText className="mt-4">{formError}</ErrorText> : null}

          <View className="mt-8">
            <PrimaryButton label="Review" onPress={onReview} disabled={!to || micros <= 0} />
          </View>
          <Text className="mt-3 text-center text-xs text-brisk-subtext">
            Feeless — you&apos;re charged exactly the amount.
          </Text>
        </View>
      )}
    </Screen>
  );
}
