import { useMemo, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  RefreshControl,
  ScrollView,
  Text,
  TextInput,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import Animated, { FadeInDown } from "react-native-reanimated";
import { PiggyBank, ShieldCheck, TrendingUp } from "lucide-react-native";

import { PrimaryButton } from "@/components/ui/PrimaryButton";
import { AuroraText } from "@/components/ui/AuroraText";
import { AuroraBackground } from "@/components/ui/AuroraBackground";
import { GlassCard } from "@/components/ui/GlassCard";
import { PulseRing } from "@/components/ui/PulseRing";
import { StatChip } from "@/components/ui/StatChip";
import { Sparkline } from "@/components/ui/Sparkline";
import { PresetAmountRow } from "@/components/ui/PresetAmountRow";
import { SaveHistory } from "@/components/ui/SaveHistory";
import { useSave } from "@/hooks/useSave";
import { useWallet } from "@/hooks/useWallet";
import { useLiveYield } from "@/hooks/useLiveYield";
import { formatUsd, usdToMicros } from "@/services/blockchain/paymentTx";
import {
  formatApy,
  formatUsdPrecise,
  NATIONAL_AVG_APY_BPS,
  netApyBps,
  perDayMicros,
  perYearMicros,
} from "@/services/blockchain/yieldMath";
import { ENV } from "@/utils/constants";
import { hapticButtonPress } from "@/utils/haptics";
import { BRISK } from "@/theme/tokens";

// "Save" tab: the yield vault rebuilt as a real cToken money market (mock lender
// mirroring Suilend/Scallop). Idle USDC earns a compounding yield that ticks live;
// principal is always redeemable, and it stays instantly spendable.
export default function SaveScreen() {
  const { state, status, error, activate, deposit, withdraw, refresh } = useSave();
  const wallet = useWallet();
  const { liveValueMicros, liveEarnedMicros } = useLiveYield(state);
  const [amountText, setAmountText] = useState("");
  const [refreshing, setRefreshing] = useState(false);

  const micros = usdToMicros(Number(amountText || "0"));
  const busy = status === "working";
  const net = netApyBps(state.apyBps || ENV.briskApyBps, ENV.briskReserveFactorBps);
  const active = !!state.vaultId;
  const funded = active && state.valueMicros > 0;

  const onRefresh = async () => {
    setRefreshing(true);
    await Promise.all([refresh(), wallet.refresh()]);
    setRefreshing(false);
  };

  // A gently-rising curve ending at the current live value (24 daily steps back).
  const sparkPoints = useMemo(() => {
    const base = Math.max(liveValueMicros, 1);
    const perDay = perDayMicros(base, net);
    return Array.from({ length: 24 }, (_, i) => base - perDay * (23 - i));
  }, [liveValueMicros, net]);

  const APYvsBank = (
    <GlassCard className="mt-4 w-full p-4" glow>
      <View className="flex-row items-center">
        <TrendingUp color={BRISK.accent} size={20} />
        <Text className="ml-2 text-sm font-inter-semibold text-brisk-text">High-yield, on Sui</Text>
      </View>
      <View className="mt-3 flex-row items-end justify-between">
        <View>
          <Text className="text-xs text-brisk-subtext">Brisk Save</Text>
          <AuroraText className="text-2xl font-inter-extrabold">{formatApy(net)} APY</AuroraText>
        </View>
        <View className="items-end">
          <Text className="text-xs text-brisk-subtext">US bank average</Text>
          <Text className="text-2xl font-inter-bold text-brisk-subtext">
            {formatApy(NATIONAL_AVG_APY_BPS)}
          </Text>
        </View>
      </View>
      <Text className="mt-2 text-xs text-brisk-subtext">
        ~{Math.round(net / NATIONAL_AVG_APY_BPS)}× the national savings average.
      </Text>
    </GlassCard>
  );

  const Safety = (
    <GlassCard className="mt-4 w-full flex-row items-center p-4">
      <ShieldCheck color={BRISK.accent} size={22} />
      <Text className="ml-3 flex-1 text-xs text-brisk-subtext">
        Your principal is always redeemable and stays instantly spendable. Yield is supplied through
        a blue-chip lender (a mock market on testnet).
      </Text>
    </GlassCard>
  );

  return (
    <View className="flex-1 bg-brisk-bg0">
      <AuroraBackground>
        <SafeAreaView edges={["top"]} className="flex-1">
          <ScrollView
            contentContainerStyle={{ paddingHorizontal: 20, paddingTop: 24, paddingBottom: 48 }}
            showsVerticalScrollIndicator={false}
            refreshControl={
              <RefreshControl
                refreshing={refreshing}
                onRefresh={onRefresh}
                tintColor={BRISK.accent}
              />
            }
          >
            {/* Hero */}
            <Animated.View entering={FadeInDown.duration(500).springify()} className="items-center">
              <PulseRing size={56}>
                <PiggyBank color={BRISK.accent} size={52} />
              </PulseRing>
              <Text className="mt-4 text-sm uppercase tracking-[2px] text-brisk-subtext">
                Save balance
              </Text>
              <AuroraText className="mt-1 text-5xl font-inter-extrabold">
                {formatUsd(Math.round(liveValueMicros))}
              </AuroraText>
              {funded ? (
                <View className="mt-3 flex-row items-center gap-4">
                  <Text className="text-sm text-brisk-subtext">
                    Principal {formatUsd(state.principalMicros)}
                  </Text>
                  <Text className="text-sm font-inter-semibold text-brisk-accent">
                    +{formatUsdPrecise(liveEarnedMicros)} earned
                  </Text>
                </View>
              ) : (
                <Text className="mt-2 text-center text-sm text-brisk-subtext">
                  Earn {formatApy(net)} APY on idle dollars — spend straight from it anytime.
                </Text>
              )}
            </Animated.View>

            {status === "loading" ? (
              <ActivityIndicator className="mt-10" color={BRISK.accent} />
            ) : !active ? (
              <Animated.View entering={FadeInDown.duration(500).delay(120)} className="mt-6">
                {APYvsBank}
                {Safety}
                <View className="mt-6">
                  <PrimaryButton label="Activate Save" onPress={activate} loading={busy} />
                </View>
              </Animated.View>
            ) : (
              <>
                {funded ? (
                  <Animated.View entering={FadeInDown.duration(500).delay(100)}>
                    <GlassCard className="mt-6 w-full p-4" glow>
                      <Sparkline points={sparkPoints} />
                      <Text className="mt-1 text-center text-xs text-brisk-subtext">
                        Growing every second.
                      </Text>
                    </GlassCard>
                    <View className="mt-4 flex-row gap-3">
                      <StatChip
                        label="Per day"
                        value={`+${formatUsdPrecise(perDayMicros(liveValueMicros, net), 3)}`}
                        tone="accent"
                      />
                      <StatChip
                        label="Per year"
                        value={`+${formatUsd(perYearMicros(liveValueMicros, net))}`}
                        tone="accent"
                      />
                      <StatChip label="APY" value={formatApy(net)} />
                    </View>
                  </Animated.View>
                ) : null}

                {APYvsBank}

                {/* Quick actions */}
                <Animated.View entering={FadeInDown.duration(500).delay(160)} className="mt-6">
                  <View className="flex-row items-center rounded-2xl border border-brisk-borderStrong bg-brisk-bg1/70 px-4 py-3">
                    <Text className="text-2xl font-inter-bold text-brisk-subtext">$</Text>
                    <TextInput
                      className="ml-1 flex-1 text-2xl font-inter-bold text-brisk-text"
                      placeholder="0.00"
                      placeholderTextColor={BRISK.placeholder}
                      keyboardType="decimal-pad"
                      value={amountText}
                      onChangeText={setAmountText}
                      accessibilityLabel="Amount in US dollars"
                    />
                  </View>
                  <PresetAmountRow
                    options={[
                      { label: "$25", value: 25 },
                      { label: "$100", value: 100 },
                      {
                        label: "Max",
                        value: Math.floor(wallet.usdcMicros / 10 ** ENV.usdcDecimals),
                      },
                    ]}
                    onPick={(v) => setAmountText(String(v))}
                  />
                  <View className="mt-4 flex-row gap-3">
                    <View className="flex-1">
                      <PrimaryButton
                        label="Move to Save"
                        onPress={() => {
                          void hapticButtonPress();
                          deposit(micros);
                        }}
                        loading={busy}
                        disabled={micros <= 0 || micros > wallet.usdcMicros}
                      />
                    </View>
                    <View className="flex-1">
                      <PrimaryButton
                        label="Withdraw"
                        variant="secondary"
                        onPress={() => {
                          void hapticButtonPress();
                          withdraw(micros);
                        }}
                        loading={busy}
                        disabled={micros <= 0}
                      />
                    </View>
                  </View>
                  {funded ? (
                    <Pressable className="mt-3 py-2" onPress={() => withdraw(state.valueMicros)}>
                      <Text className="text-center text-sm text-brisk-subtext">
                        Withdraw all ({formatUsd(state.valueMicros)})
                      </Text>
                    </Pressable>
                  ) : null}
                </Animated.View>

                {Safety}
                <SaveHistory />
              </>
            )}

            {error ? (
              <Text className="mt-4 text-center text-xs text-brisk-danger">{error}</Text>
            ) : null}
          </ScrollView>
        </SafeAreaView>
      </AuroraBackground>
    </View>
  );
}
