import { useState } from "react";
import { Pressable, RefreshControl, ScrollView, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import Animated, { FadeInDown } from "react-native-reanimated";
import { PiggyBank, TrendingUp } from "lucide-react-native";

import { PrimaryButton } from "@/components/ui/PrimaryButton";
import { HeroAmount } from "@/components/ui/HeroAmount";
import { AuroraBackground } from "@/components/ui/AuroraBackground";
import { AmountField } from "@/components/ui/AmountField";
import { GlassCard } from "@/components/ui/GlassCard";
import { Skeleton } from "@/components/ui/Skeleton";
import { PulseRing } from "@/components/ui/PulseRing";
import { SoftGlow } from "@/components/ui/SoftGlow";
import { Stat } from "@/components/ui/Stat";
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
import { DURATION, HERO_EYEBROW, staggerDelay } from "@/theme/scale";
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
      <View className="mt-4 flex-row justify-around">
        <Stat label="Brisk Save" value={`${formatApy(net)}`} aurora />
        <Stat label="US bank avg" value={`${formatApy(NATIONAL_AVG_APY_BPS)}`} tone="subtext" />
        <Stat
          label="the average"
          value={`~${Math.round(net / NATIONAL_AVG_APY_BPS)}×`}
          tone="accent"
        />
      </View>
      {/* Make the pitch concrete — what $1,000 earns in a year here. */}
      <Text className="mt-4 text-center text-sm text-brisk-text">
        On $1,000 you'd earn{" "}
        <Text className="font-inter-bold text-brisk-accent">
          ~{formatUsd(perYearMicros(usdToMicros(1000), net))}/yr
        </Text>
      </Text>
      <Text className="mt-2 text-center text-xs text-brisk-subtext">
        Your principal is always redeemable and stays instantly spendable.
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
            <Animated.View
              entering={FadeInDown.duration(DURATION.slow).springify()}
              className="items-center"
            >
              <PulseRing size={56}>
                <PiggyBank color={theme.accent} size={52} />
              </PulseRing>
              <Text className={`mt-4 ${HERO_EYEBROW}`}>Save balance</Text>
              <View className="mt-1 items-center justify-center">
                {/* Glowing-vault ambient lift behind the balance. */}
                <View className="absolute inset-0 items-center justify-center" pointerEvents="none">
                  <SoftGlow color={theme.accent} size={280} opacity={0.2} />
                </View>
                <HeroAmount micros={Math.round(liveValueMicros)} tier="focused" fromZero />
              </View>
              {funded ? (
                <>
                  {/* Live earnings — ticks up every second; the heart of Save.
                      Kept a plain Text (NOT AuroraText): it re-renders ~8fps and
                      MaskedView is per-instance expensive → jank. */}
                  <Text className="mt-3 text-2xl font-inter-extrabold text-brisk-accent">
                    +{formatUsdPrecise(liveEarnedMicros)} earned
                  </Text>
                  <View className="mt-4 w-full flex-row justify-around">
                    <Stat label="APY" value={formatApy(net)} tone="accent" />
                    <Stat
                      label="Per day"
                      value={`+${formatUsdPrecise(perDayMicros(liveValueMicros, net), 3)}`}
                    />
                    <Stat label="Principal" value={formatUsd(state.principalMicros)} />
                  </View>
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
                entering={FadeInDown.duration(DURATION.slow).delay(staggerDelay(2))}
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
                  entering={FadeInDown.duration(DURATION.slow).delay(staggerDelay(1))}
                  className="mt-8"
                >
                  <View className="rounded-2xl border border-brisk-borderStrong bg-brisk-bg1/70 px-4 py-3">
                    <AmountField value={amountText} onChangeText={setAmountText} tier="compact" />
                  </View>
                  {/* Make the deposit feel rewarding before you commit. */}
                  {micros > 0 ? (
                    <Text className="mt-2 text-center text-xs text-brisk-subtext">
                      +{formatUsdPrecise(perDayMicros(liveValueMicros + micros, net), 3)}/day after
                      this deposit
                    </Text>
                  ) : null}
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
