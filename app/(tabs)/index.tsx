import { useCallback, useEffect, useState } from "react";
import { Pressable, RefreshControl, ScrollView, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import Animated, { FadeInDown } from "react-native-reanimated";
import { useRouter } from "expo-router";
import { useFocusEffect } from "@react-navigation/native";
import { Gift, Inbox, PiggyBank, Settings as SettingsIcon } from "lucide-react-native";

import { PrimaryButton } from "@/components/ui/PrimaryButton";
import { HeroAmount } from "@/components/ui/HeroAmount";
import { AuroraBackground } from "@/components/ui/AuroraBackground";
import { ListRow } from "@/components/ui/ListRow";
import { SectionLabel } from "@/components/ui/SectionLabel";
import { EmptyState } from "@/components/ui/EmptyState";
import { Skeleton } from "@/components/ui/Skeleton";
import { ModePill } from "@/components/ui/ModePill";
import { ActivityRow } from "@/components/ui/ActivityRow";
import { PulseRing } from "@/components/ui/PulseRing";
import { ProDashboard } from "@/components/screens/ProDashboard";
import { useAppModeStore } from "@/store/appModeStore";
import { useWallet } from "@/hooks/useWallet";
import { useSave } from "@/hooks/useSave";
import { useActivity } from "@/hooks/useActivity";
import { useMerchantDirectory } from "@/hooks/useMerchantDirectory";
import { useLiveYield } from "@/hooks/useLiveYield";
import { useTabBarClearance } from "@/hooks/useTabBarClearance";
import { formatUsd } from "@/services/blockchain/paymentTx";
import { formatApy, formatUsdPrecise, netApyBps } from "@/services/blockchain/yieldMath";
import { ENV } from "@/utils/constants";
import { STAGGER_MS, ICON } from "@/theme/scale";
import { useTheme } from "@/hooks/useTheme";

// Live-refresh cadence while the Wallet tab is focused.
const POLL_MS = 10_000;

export default function HomeScreen() {
  const theme = useTheme();
  const router = useRouter();
  const { usdcMicros, loading, refresh } = useWallet();
  const { state: save, refresh: refreshSave } = useSave();
  const { items, refresh: refreshActivity } = useActivity();
  const { nameFor, resolve } = useMerchantDirectory();
  const pro = useAppModeStore((s) => s.mode === "pro");
  const [refreshing, setRefreshing] = useState(false);
  const bottomPad = useTabBarClearance();
  const { liveValueMicros: saveValue, liveEarnedMicros: saveEarned } = useLiveYield(save);
  const saveActive = !!save.vaultId && save.principalMicros > 0;
  const saveNetApy = netApyBps(save.apyBps || ENV.briskApyBps, ENV.briskReserveFactorBps);

  const refreshAll = useCallback(
    () => Promise.all([refresh(), refreshSave(), refreshActivity()]),
    [refresh, refreshSave, refreshActivity],
  );

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await refreshAll();
    setRefreshing(false);
  }, [refreshAll]);

  // Warm the merchant directory so Activity shows business names, not 0x.
  useEffect(() => {
    resolve(items.map((it) => it.counterparty));
  }, [items, resolve]);

  // Refresh immediately on focus (e.g. returning from a payment) so the balance
  // is current at once, then keep it live by polling.
  useFocusEffect(
    useCallback(() => {
      void refreshAll();
      const id = setInterval(() => void refreshAll(), POLL_MS);
      return () => clearInterval(id);
    }, [refreshAll]),
  );

  return (
    <View className="flex-1 bg-brisk-bg0">
      <AuroraBackground>
        <SafeAreaView edges={["top"]} className="flex-1 px-5">
          {/* Fixed header: the Personal/Pro mode pill + a Settings entry point.
              Stays put as the body below swaps between the personal wallet and
              the Pro dashboard. */}
          <View className="flex-row items-center justify-between pb-4 pt-2">
            <ModePill />
            <Pressable
              onPress={() => router.push("/settings")}
              hitSlop={12}
              accessibilityRole="button"
              accessibilityLabel="Settings"
            >
              <SettingsIcon color={theme.subtext} size={ICON.header} />
            </Pressable>
          </View>

          {pro ? (
            <ProDashboard />
          ) : (
            <ScrollView
              contentContainerStyle={{ paddingBottom: bottomPad }}
              showsVerticalScrollIndicator={false}
              refreshControl={
                <RefreshControl
                  refreshing={refreshing}
                  onRefresh={onRefresh}
                  tintColor={theme.accent}
                />
              }
            >
              {/* Balance */}
              <Animated.View
                entering={FadeInDown.duration(500).springify()}
                className="items-center"
              >
                <Text className="text-center text-sm uppercase tracking-[2px] text-brisk-subtext">
                  Balance
                </Text>
                <View className="mt-1 items-center justify-center" style={{ minHeight: 76 }}>
                  {loading ? (
                    <Skeleton width={230} height={62} radius={16} />
                  ) : (
                    <HeroAmount micros={usdcMicros} tier="primary" />
                  )}
                </View>
                <Text className="mt-1 text-center text-sm text-brisk-subtext">
                  USDC · feeless on Sui
                </Text>
              </Animated.View>

              {/* Receive / Send */}
              <Animated.View
                entering={FadeInDown.duration(500).delay(STAGGER_MS).springify()}
                className="mt-8 flex-row gap-3"
              >
                <View className="flex-1">
                  <PrimaryButton label="Receive" onPress={() => router.push("/receive")} />
                </View>
                <View className="flex-1">
                  <PrimaryButton
                    label="Send"
                    variant="secondary"
                    onPress={() => router.push("/send")}
                  />
                </View>
              </Animated.View>

              {/* Your money — Save + Gift cards, grouped so they read as one set. */}
              <Animated.View
                entering={FadeInDown.duration(500)
                  .delay(STAGGER_MS * 2)
                  .springify()}
              >
                <SectionLabel className="mt-8">Your money</SectionLabel>
                <View className="mt-3">
                  <ListRow
                    onPress={() => router.push("/save")}
                    leading={
                      saveActive ? (
                        <PulseRing size={ICON.row}>
                          <PiggyBank color={theme.accent} size={ICON.row} />
                        </PulseRing>
                      ) : (
                        <PiggyBank color={theme.accent} size={ICON.row} />
                      )
                    }
                    title="Save"
                    subtitle={
                      saveActive
                        ? `+${formatUsdPrecise(saveEarned)} earned · ${formatApy(saveNetApy)} APY`
                        : save.vaultId
                          ? "Earning yield on idle dollars"
                          : "Not active yet"
                    }
                    value={formatUsd(Math.round(saveValue))}
                  />
                </View>
                <View className="mt-3">
                  <ListRow
                    onPress={() => router.push("/gift-cards")}
                    icon={Gift}
                    title="Gift cards"
                    subtitle="Store credit you can spend at a merchant"
                    chevron
                  />
                </View>
              </Animated.View>

              {/* Activity */}
              <Animated.View entering={FadeInDown.duration(500).delay(STAGGER_MS * 3)}>
                <SectionLabel className="mt-8">Activity</SectionLabel>
              </Animated.View>
              {items.length === 0 ? (
                <EmptyState
                  icon={Inbox}
                  subtitle="No payments yet. Received and sent USDC will show up here."
                />
              ) : (
                <View className="mt-3">
                  {items.map((it, i) => (
                    <ActivityRow
                      key={`${it.digest}-${i}`}
                      item={it}
                      index={i}
                      name={nameFor(it.counterparty)}
                    />
                  ))}
                </View>
              )}
            </ScrollView>
          )}
        </SafeAreaView>
      </AuroraBackground>
    </View>
  );
}
