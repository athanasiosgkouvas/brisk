import { useState } from "react";
import { Pressable, RefreshControl, ScrollView, Text, TextInput, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import Animated, { FadeInDown } from "react-native-reanimated";
import { PiggyBank, TrendingUp } from "lucide-react-native";

import { PrimaryButton } from "@/components/ui/PrimaryButton";
import { AuroraText } from "@/components/ui/AuroraText";
import { HeroAmount } from "@/components/ui/HeroAmount";
import { AuroraBackground } from "@/components/ui/AuroraBackground";
import { GlassCard } from "@/components/ui/GlassCard";
import { Skeleton } from "@/components/ui/Skeleton";
import { PulseRing } from "@/components/ui/PulseRing";
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
} from "@/services/blockchain/yieldMath";
import { ENV } from "@/utils/constants";
import { STAGGER_MS } from "@/theme/scale";
import { hapticButtonPress } from "@/utils/haptics";
import { useTheme } from "@/hooks/useTheme";
import { useTabBarClearance } from "@/hooks/useTabBarClearance";

// "Save" tab: the yield vault rebuilt as a real cToken money market (mock lender
// mirroring Suilend/Scallop). Idle USDC earns a compounding yield that ticks live;
// principal is always redeemable, and it stays instantly spendable.
export default function SaveScreen() {
  const theme = useTheme();
  const { state, status, error, activate, deposit, withdraw, refresh } = useSave();
  const wallet = useWallet();
  const { liveValueMicros, liveEarnedMicros } = useLiveYield(state);
  const [amountText, setAmountText] = useState("");
  const [refreshing, setRefreshing] = useState(false);
  const bottomPad = useTabBarClearance();

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

  // The single value pitch shown only before Save is activated — merges the
  // bank comparison and a one-line safety note so the marketing lives in exactly
  // one place (the funded screen carries none of it).
  const ValuePitch = (
    <GlassCard className="mt-6 w-full p-4" glow sheen>
      <View className="flex-row items-center">
        <TrendingUp color={theme.accent} size={20} />
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
      <Text className="mt-3 text-xs text-brisk-subtext">
        ~{Math.round(net / NATIONAL_AVG_APY_BPS)}× the national average. Your principal is always
        redeemable and stays instantly spendable.
      </Text>
    </GlassCard>
  );

  return (
    <View className="flex-1 bg-brisk-bg0">
      <AuroraBackground>
        <SafeAreaView edges={["top"]} className="flex-1">
          <ScrollView
            contentContainerStyle={{
              paddingHorizontal: 20,
              paddingTop: 24,
              paddingBottom: bottomPad,
            }}
            showsVerticalScrollIndicator={false}
            refreshControl={
              <RefreshControl
                refreshing={refreshing}
                onRefresh={onRefresh}
                tintColor={theme.accent}
              />
            }
          >
            {/* Hero */}
            <Animated.View entering={FadeInDown.duration(500).springify()} className="items-center">
              <PulseRing size={56}>
                <PiggyBank color={theme.accent} size={52} />
              </PulseRing>
              <Text className="mt-4 text-sm uppercase tracking-[1.5px] text-brisk-subtext font-mono-medium">
                Save balance
              </Text>
              <HeroAmount
                micros={Math.round(liveValueMicros)}
                tier="focused"
                fromZero
                className="mt-1"
              />
              {funded ? (
                <>
                  {/* Live earnings — ticks up every second; the heart of Save. */}
                  <Text className="mt-2 text-base font-inter-semibold text-brisk-accent">
                    +{formatUsdPrecise(liveEarnedMicros)} earned
                  </Text>
                  <Text className="mt-0.5 text-xs text-brisk-subtext">
                    Principal {formatUsd(state.principalMicros)}
                  </Text>
                  {/* The one and only rate surface on the funded screen. */}
                  <Text className="mt-2 text-xs text-brisk-subtext">
                    {formatApy(net)} APY · +
                    {formatUsdPrecise(perDayMicros(liveValueMicros, net), 3)}
                    /day
                  </Text>
                </>
              ) : (
                <Text className="mt-2 text-center text-sm text-brisk-subtext">
                  Earn {formatApy(net)} APY on idle dollars — spend straight from it anytime.
                </Text>
              )}
            </Animated.View>

            {status === "loading" ? (
              <View className="mt-6">
                <Skeleton height={92} radius={16} />
                <View className="mt-4">
                  <Skeleton height={64} radius={16} />
                </View>
              </View>
            ) : !active ? (
              <Animated.View
                entering={FadeInDown.duration(500).delay(STAGGER_MS * 2)}
                className="mt-6"
              >
                {ValuePitch}
                <View className="mt-6">
                  <PrimaryButton label="Activate Save" onPress={activate} loading={busy} />
                </View>
              </Animated.View>
            ) : (
              <>
                {/* Quick actions — directly under the hero; the funded screen is
                    just balance → actions → history, no marketing. */}
                <Animated.View
                  entering={FadeInDown.duration(500).delay(STAGGER_MS)}
                  className="mt-8"
                >
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
