import { useState } from "react";
import { Modal, Pressable, Text, TextInput, View } from "react-native";

import { useSettingsStore } from "@/store/settingsStore";

type Props = {
  /** dUSDC balance in micros. */
  balanceMicro: number;
  balanceLoading?: boolean;
};

const PRESETS = [1, 5, 10, 25];
const MIN_BET = 0.1;

/**
 * Persistent header row for the Swipe screen: wallet balance + tappable
 * stake chip. Solves two issues at once:
 *   1. The previous stake/info line lived *below* the deck and got
 *      covered by swipe-animations. Putting it above the deck means it's
 *      always visible.
 *   2. The user asked for an easy way to view balance + change bet size
 *      without leaving the swipe flow.
 */
export function SessionBetBar({ balanceMicro, balanceLoading = false }: Props) {
  const { betAmount, setBetAmount } = useSettingsStore();
  const [sheetOpen, setSheetOpen] = useState(false);
  const [customInput, setCustomInput] = useState(String(betAmount));
  const [error, setError] = useState<string | null>(null);

  const commitCustom = () => {
    const val = Number(customInput.trim());
    if (!Number.isFinite(val) || val < MIN_BET) {
      setError(`Minimum stake is ${MIN_BET} dUSDC`);
      return;
    }
    setBetAmount(val);
    setError(null);
    setSheetOpen(false);
  };

  return (
    <View className="mb-3 flex-row items-center gap-2 rounded-2xl border border-[#27415A] bg-fathom-bg1 px-3 py-2">
      <View className="flex-1">
        <Text className="text-[10px] uppercase tracking-[2px] text-fathom-subtext">Balance</Text>
        <Text className="mt-0.5 text-sm font-semibold text-fathom-text">
          {balanceLoading ? "..." : `${(balanceMicro / 1_000_000).toFixed(2)} dUSDC`}
        </Text>
      </View>
      <Pressable
        onPress={() => {
          setCustomInput(String(betAmount));
          setSheetOpen(true);
        }}
        className="rounded-xl border border-[#2A4A66] bg-fathom-bg2 px-3 py-2"
      >
        <Text className="text-[10px] uppercase tracking-[2px] text-fathom-subtext">Stake</Text>
        <Text className="mt-0.5 text-sm font-semibold text-fathom-bull">{betAmount} dUSDC</Text>
      </Pressable>

      <Modal
        visible={sheetOpen}
        transparent
        animationType="fade"
        onRequestClose={() => setSheetOpen(false)}
      >
        <Pressable
          onPress={() => setSheetOpen(false)}
          className="flex-1 items-center justify-center bg-black/60 px-6"
        >
          <Pressable
            onPress={(e) => e.stopPropagation()}
            className="w-full max-w-[360px] rounded-3xl border border-[#27415A] bg-fathom-bg1 p-5"
          >
            <Text className="text-[11px] uppercase tracking-[2px] text-fathom-subtext">
              Set stake per swipe
            </Text>
            <Text className="mt-1 text-2xl font-bold text-fathom-text">{betAmount} dUSDC</Text>
            <View className="mt-4 flex-row flex-wrap gap-2">
              {PRESETS.map((p) => (
                <Pressable
                  key={p}
                  onPress={() => {
                    setBetAmount(p);
                    setError(null);
                    setCustomInput(String(p));
                  }}
                  className={`rounded-xl border px-3 py-2 ${
                    betAmount === p
                      ? "border-fathom-bull bg-[#0F231E]"
                      : "border-[#2A4A66] bg-fathom-bg2"
                  }`}
                >
                  <Text
                    className={`text-sm font-semibold ${
                      betAmount === p ? "text-fathom-bull" : "text-fathom-text"
                    }`}
                  >
                    {p}
                  </Text>
                </Pressable>
              ))}
            </View>

            <Text className="mt-4 text-[10px] uppercase tracking-[2px] text-fathom-subtext">
              Custom (min {MIN_BET} dUSDC)
            </Text>
            <TextInput
              className="mt-2 rounded-xl border border-[#2A4A66] bg-fathom-bg2 px-3 py-2 text-base font-semibold text-fathom-text"
              value={customInput}
              onChangeText={(t) => {
                setCustomInput(t);
                setError(null);
              }}
              keyboardType="decimal-pad"
              selectTextOnFocus
              onSubmitEditing={commitCustom}
              returnKeyType="done"
            />
            {error ? <Text className="mt-1 text-xs text-fathom-bear">{error}</Text> : null}
            <View className="mt-4 flex-row gap-2">
              <Pressable
                onPress={() => setSheetOpen(false)}
                className="flex-1 rounded-xl border border-[#2A4A66] bg-fathom-bg2 px-3 py-2"
              >
                <Text className="text-center text-sm font-semibold text-fathom-text">Cancel</Text>
              </Pressable>
              <Pressable
                onPress={commitCustom}
                className="flex-1 rounded-xl bg-fathom-bull px-3 py-2"
              >
                <Text className="text-center text-sm font-semibold text-[#07111A]">Save</Text>
              </Pressable>
            </View>
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}
