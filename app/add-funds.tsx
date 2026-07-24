import { useMemo, useState } from "react";
import { ActivityIndicator, Pressable, Text, View } from "react-native";
import Animated, { FadeInDown } from "react-native-reanimated";
import { useRouter } from "expo-router";

import { Screen } from "@/components/ui/Screen";
import { PrimaryButton } from "@/components/ui/PrimaryButton";
import { SuccessSheet } from "@/components/ui/SuccessSheet";
import { AmountField } from "@/components/ui/AmountField";
import { useOnramp } from "@/hooks/useOnramp";
import { useTheme } from "@/hooks/useTheme";

// Quick presets so the common case is one tap; the field stays editable.
const PRESETS = [20, 50, 100];

/**
 * Add funds — buy USDC on Sui with Coinbase's hosted onramp. Pick/enter an
 * amount, hand off to Coinbase (which owns card/Apple Pay/Google Pay + KYC),
 * then we watch the balance for the USDC to land. See hooks/useOnramp.ts.
 */
export default function AddFundsScreen() {
  const theme = useTheme();
  const router = useRouter();
  const { status, error, creditedMicros, start, reset } = useOnramp();
  const [amountText, setAmountText] = useState("");

  const amountUsd = Number(amountText || "0");
  const canContinue = useMemo(() => amountUsd >= 0, [amountUsd]);
  const starting = status === "starting";

  const onContinue = () => {
    // Amount is optional — Coinbase lets the user set it in-flow if omitted.
    void start(amountUsd > 0 ? amountUsd : undefined);
  };

  // ── Success: funds landed on-chain ──────────────────────────────────────
  if (status === "done") {
    return (
      <Screen title="Add funds" onClose={() => router.back()}>
        <View className="flex-1 justify-center">
          <SuccessSheet
            amountMicros={creditedMicros}
            title="Funds added"
            caption="Bought with Coinbase · settled on Sui as USDC."
            footer={<PrimaryButton label="Done" onPress={() => router.back()} />}
          />
        </View>
      </Screen>
    );
  }

  // ── Confirming: browser closed, watching the balance ────────────────────
  if (status === "confirming") {
    return (
      <Screen title="Add funds" onClose={() => router.back()}>
        <View className="flex-1 items-center justify-center px-6">
          <ActivityIndicator color={theme.accent} size="large" />
          <Text className="mt-6 text-lg font-inter-bold text-brisk-text">Finishing up…</Text>
          <Text className="mt-2 text-center text-sm text-brisk-subtext">
            Waiting for your USDC to land on Sui. This is usually quick.
          </Text>
        </View>
      </Screen>
    );
  }

  // ── Processing: returned but not landed within the watch window ─────────
  if (status === "processing") {
    return (
      <Screen title="Add funds" onClose={() => router.back()}>
        <View className="flex-1 items-center justify-center px-6">
          <Text className="text-2xl">⏳</Text>
          <Text className="mt-4 text-lg font-inter-bold text-brisk-text">On its way</Text>
          <Text className="mt-2 text-center text-sm text-brisk-subtext">
            Your purchase is processing. Your balance will update automatically once it settles.
          </Text>
          <View className="mt-8 w-full max-w-[360px]">
            <PrimaryButton label="Done" onPress={() => router.back()} />
          </View>
        </View>
      </Screen>
    );
  }

  // ── Entry: pick an amount + continue ────────────────────────────────────
  return (
    <Screen title="Add funds" onClose={() => router.back()} scroll bottomInset={40}>
      <Animated.View entering={FadeInDown.duration(500).springify()} className="pt-2">
        <Text className="text-center text-sm text-brisk-subtext">
          Buy USDC with a card or bank via Coinbase. It lands in your Brisk wallet on Sui.
        </Text>

        <View className="mt-6">
          <AmountField value={amountText} onChangeText={setAmountText} autoFocus />
        </View>

        <View className="mt-4 flex-row gap-2">
          {PRESETS.map((p) => {
            const active = amountUsd === p;
            return (
              <Pressable
                key={p}
                onPress={() => setAmountText(String(p))}
                accessibilityRole="button"
                accessibilityLabel={`Set amount to ${p} dollars`}
                className={`flex-1 items-center rounded-2xl border py-3 ${
                  active
                    ? "border-brisk-accent bg-brisk-accent/15"
                    : "border-brisk-glassBorder bg-brisk-bg1/60"
                }`}
              >
                <Text
                  className="font-inter-semibold text-base"
                  style={{ color: active ? theme.accent : theme.text }}
                >
                  ${p}
                </Text>
              </Pressable>
            );
          })}
        </View>

        {status === "canceled" ? (
          <Text className="mt-5 text-center text-sm text-brisk-subtext">
            Canceled — no charge was made. You can try again.
          </Text>
        ) : null}
        {status === "error" && error ? (
          <Text className="mt-5 text-center text-sm text-brisk-danger">{error}</Text>
        ) : null}

        <View className="mt-8">
          <PrimaryButton
            label={starting ? "Opening Coinbase…" : "Continue with Coinbase"}
            onPress={() => {
              if (status === "error" || status === "canceled") reset();
              onContinue();
            }}
            loading={starting}
            disabled={!canContinue}
          />
        </View>

        <Text className="mt-4 px-6 text-center text-xs text-brisk-subtext">
          You&apos;ll complete payment securely on Coinbase. USDC has zero on-ramp fees.
        </Text>
      </Animated.View>
    </Screen>
  );
}
