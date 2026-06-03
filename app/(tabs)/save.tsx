import { useState } from "react";
import { ActivityIndicator, Text, TextInput, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import Animated, { FadeInDown } from "react-native-reanimated";
import { PiggyBank } from "lucide-react-native";

import { PrimaryButton } from "@/components/ui/PrimaryButton";
import { AuroraText } from "@/components/ui/AuroraText";
import { AuroraBackground } from "@/components/ui/AuroraBackground";
import { useSave } from "@/hooks/useSave";
import { useCountUp } from "@/hooks/useCountUp";
import { formatUsd, usdToMicros } from "@/services/blockchain/paymentTx";
import { BRISK } from "@/theme/tokens";

// "Save" tab: the yield vault. Idle USDC earns in a blue-chip lender (mock on
// testnet, real adapter on mainnet) and stays instantly spendable.
export default function SaveScreen() {
  const { state, status, error, activate, deposit, withdraw } = useSave();
  const [amountText, setAmountText] = useState("");
  const shownValue = useCountUp(state.valueMicros);
  const micros = usdToMicros(Number(amountText || "0"));
  const busy = status === "working" || status === "loading";

  return (
    <View className="flex-1 bg-brisk-bg0">
      <AuroraBackground>
        <SafeAreaView edges={["top"]} className="flex-1 px-5 pt-10">
          <View className="flex-1 items-center justify-center">
            <Animated.View entering={FadeInDown.duration(500).springify()} className="items-center">
              <PiggyBank color={BRISK.accent} size={56} />
              <Text className="mt-4 text-sm uppercase tracking-[2px] text-brisk-subtext">
                Save balance
              </Text>
              <AuroraText className="mt-1 text-5xl font-inter-extrabold">
                {formatUsd(Math.round(shownValue))}
              </AuroraText>
              {state.vaultId && state.valueMicros > 0 ? (
                <View className="mt-3 flex-row items-center gap-4">
                  <Text className="text-sm text-brisk-subtext">
                    Principal {formatUsd(state.principalMicros)}
                  </Text>
                  <Text className="text-sm font-inter-semibold text-brisk-accent">
                    +{formatUsd(state.earnedMicros)} earned
                  </Text>
                </View>
              ) : null}
              <Text className="mt-2 text-center text-sm text-brisk-subtext">
                Earning {(state.apyBps / 100).toFixed(0)}% APY — spend straight from it anytime.
              </Text>
            </Animated.View>

            {status === "loading" ? (
              <ActivityIndicator className="mt-8" color={BRISK.accent} />
            ) : !state.vaultId ? (
              <View className="mt-8 w-full max-w-[360px]">
                <PrimaryButton label="Activate Save" onPress={activate} loading={busy} />
              </View>
            ) : (
              <View className="mt-8 w-full max-w-[360px]">
                <View className="flex-row items-center rounded-2xl border border-brisk-borderStrong bg-brisk-bg1/70 px-4 py-3">
                  <Text className="text-2xl font-inter-bold text-brisk-subtext">$</Text>
                  <TextInput
                    className="ml-1 flex-1 text-2xl font-inter-bold text-brisk-text"
                    placeholder="0.00"
                    placeholderTextColor={BRISK.placeholder}
                    keyboardType="decimal-pad"
                    value={amountText}
                    onChangeText={setAmountText}
                  />
                </View>
                <View className="mt-4 flex-row gap-3">
                  <View className="flex-1">
                    <PrimaryButton
                      label="Deposit"
                      onPress={() => deposit(micros)}
                      loading={busy}
                      disabled={micros <= 0}
                    />
                  </View>
                  <View className="flex-1">
                    <PrimaryButton
                      label="Withdraw"
                      variant="secondary"
                      onPress={() => withdraw(micros)}
                      loading={busy}
                      disabled={micros <= 0}
                    />
                  </View>
                </View>
              </View>
            )}

            {error ? (
              <Text className="mt-4 text-center text-xs text-brisk-danger">{error}</Text>
            ) : null}
          </View>
        </SafeAreaView>
      </AuroraBackground>
    </View>
  );
}
