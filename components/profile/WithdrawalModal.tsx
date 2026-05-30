import { useState } from "react";
import { Modal, Pressable, Text, TextInput, View } from "react-native";

import { PrimaryButton } from "@/components/ui/PrimaryButton";
import { formatDusdc } from "@/utils/formatting";

type Props = {
  visible: boolean;
  balance: number;
  defaultAmount?: number;
  onClose: () => void;
  onSend: (recipient: string, amount: number) => Promise<void>;
};

export function WithdrawalModal({ visible, balance, defaultAmount = 1, onClose, onSend }: Props) {
  const [recipient, setRecipient] = useState("");
  const [amountText, setAmountText] = useState(String(defaultAmount));
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successDigest, setSuccessDigest] = useState<string | null>(null);

  const amount = Number(amountText);
  const amountValid = Number.isFinite(amount) && amount >= 0.1 && amount <= balance / 1_000_000;
  const recipientValid = recipient.startsWith("0x") && recipient.length >= 40;
  const canSend = amountValid && recipientValid && !loading;

  function handleClose() {
    setRecipient("");
    setAmountText(String(defaultAmount));
    setError(null);
    setSuccessDigest(null);
    setLoading(false);
    onClose();
  }

  async function handleSend() {
    setError(null);
    setSuccessDigest(null);
    setLoading(true);
    try {
      await onSend(recipient, amount);
      setSuccessDigest("Sent!");
      setRecipient("");
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Send failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={handleClose}>
      <View className="flex-1 items-center justify-center bg-black/60 px-5">
        <View className="w-full max-w-[420px] rounded-[28px] border border-[#315578] bg-fathom-bg1 p-5">
          <View className="flex-row items-center justify-between">
            <Text className="text-lg font-bold text-fathom-text">Send dUSDC</Text>
            <Pressable onPress={handleClose}>
              <Text className="text-sm font-semibold text-fathom-bull">Close</Text>
            </Pressable>
          </View>

          <View className="mt-3 rounded-2xl border border-[#24415A] bg-fathom-bg2 px-4 py-3">
            <Text className="text-[11px] uppercase tracking-wide text-fathom-subtext">
              Available
            </Text>
            <Text className="mt-1 text-base font-semibold text-fathom-text">
              {formatDusdc(balance)}
            </Text>
          </View>

          <Text className="mt-4 text-[11px] uppercase tracking-wide text-fathom-subtext">
            Recipient address
          </Text>
          <TextInput
            className="mt-2 rounded-2xl border border-[#24415A] bg-fathom-bg2 px-4 py-3 text-sm text-fathom-text"
            placeholder="0x..."
            placeholderTextColor="#4A6A80"
            value={recipient}
            onChangeText={setRecipient}
            autoCapitalize="none"
            autoCorrect={false}
          />

          <Text className="mt-4 text-[11px] uppercase tracking-wide text-fathom-subtext">
            Amount (dUSDC · min 0.1)
          </Text>
          <TextInput
            className="mt-2 rounded-2xl border border-[#24415A] bg-fathom-bg2 px-4 py-3 text-sm text-fathom-text"
            placeholder="1.0"
            placeholderTextColor="#4A6A80"
            value={amountText}
            onChangeText={setAmountText}
            keyboardType="decimal-pad"
          />

          {error ? <Text className="mt-3 text-xs text-fathom-bear">{error}</Text> : null}
          {successDigest ? (
            <Text className="mt-3 text-xs text-fathom-bull">✓ {successDigest}</Text>
          ) : null}

          <View className="mt-5">
            <PrimaryButton
              label={loading ? "Sending…" : "Send"}
              onPress={() => void handleSend()}
              disabled={!canSend}
              loading={loading}
            />
          </View>
        </View>
      </View>
    </Modal>
  );
}
