import { useCallback, useState } from "react";
import { Pressable, RefreshControl, ScrollView, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import Animated, { FadeInDown } from "react-native-reanimated";
import { useRouter } from "expo-router";
import { useFocusEffect } from "@react-navigation/native";
import * as Clipboard from "expo-clipboard";
import * as Haptics from "expo-haptics";
import { ArrowDownLeft, ArrowUpRight, Check, Copy, PiggyBank } from "lucide-react-native";

import { PrimaryButton } from "@/components/ui/PrimaryButton";
import { AuroraText } from "@/components/ui/AuroraText";
import { AuroraBackground } from "@/components/ui/AuroraBackground";
import { GlassCard } from "@/components/ui/GlassCard";
import { PulseRing } from "@/components/ui/PulseRing";
import { useWallet } from "@/hooks/useWallet";
import { useSave } from "@/hooks/useSave";
import { useActivity } from "@/hooks/useActivity";
import { useCountUp } from "@/hooks/useCountUp";
import { useLiveYield } from "@/hooks/useLiveYield";
import { formatUsd } from "@/services/blockchain/paymentTx";
import { formatApy, formatUsdPrecise, netApyBps } from "@/services/blockchain/yieldMath";
import { type ActivityItem } from "@/services/blockchain/receipts";
import { formatRelativeTime } from "@/utils/time";
import { ENV } from "@/utils/constants";
import { BRISK } from "@/theme/tokens";

function shortAddr(a: string): string {
  return a.length > 12 ? `${a.slice(0, 6)}…${a.slice(-4)}` : a;
}

// Live-refresh cadence while the Wallet tab is focused.
const POLL_MS = 10_000;

function ActivityRow({ item, index }: { item: ActivityItem; index: number }) {
  const received = item.direction === "received";
  const [copied, setCopied] = useState(false);

  const copyTx = useCallback(async () => {
    if (!item.digest) return;
    await Clipboard.setStringAsync(item.digest);
    void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }, [item.digest]);

  return (
    <Animated.View
      entering={FadeInDown.duration(400).delay(Math.min(index, 8) * 55)}
      className="mb-2"
    >
      {/* Translucent (no blur) — keeps the scrolling list smooth on Android. */}
      <GlassCard className="flex-row items-center px-4 py-3">
        {received ? (
          <ArrowDownLeft color={BRISK.accent} size={20} />
        ) : (
          <ArrowUpRight color={BRISK.subtext} size={20} />
        )}
        <View className="ml-3 flex-1">
          <View className="flex-row items-center">
            <Text className="text-sm text-brisk-text">{received ? "Received" : "Sent"}</Text>
            <Text className="ml-2 text-xs text-brisk-subtext">
              {formatRelativeTime(item.timestampMs)}
            </Text>
          </View>
          <Text className="text-xs text-brisk-subtext">
            {received ? "from" : "to"} {shortAddr(item.counterparty)}
          </Text>
          {item.digest ? (
            <Pressable
              onPress={copyTx}
              hitSlop={8}
              className="mt-1 flex-row items-center"
              accessibilityRole="button"
              accessibilityLabel={copied ? "Transaction digest copied" : "Copy transaction digest"}
            >
              {copied ? (
                <Check color={BRISK.accent} size={12} />
              ) : (
                <Copy color={BRISK.placeholder} size={12} />
              )}
              <Text
                className={`ml-1 text-[11px] ${copied ? "text-brisk-accent" : "text-brisk-subtext"}`}
              >
                {copied ? "Copied tx" : shortAddr(item.digest)}
              </Text>
            </Pressable>
          ) : null}
        </View>
        <Text
          className={`text-base font-inter-semibold ${received ? "text-brisk-accent" : "text-brisk-text"}`}
        >
          {received ? "+" : "−"}
          {formatUsd(item.amountMicros)}
        </Text>
      </GlassCard>
    </Animated.View>
  );
}

export default function HomeScreen() {
  const router = useRouter();
  const { usdcMicros, loading, refresh } = useWallet();
  const { state: save, refresh: refreshSave } = useSave();
  const { items, refresh: refreshActivity } = useActivity();
  const [refreshing, setRefreshing] = useState(false);
  const shownMicros = useCountUp(usdcMicros);
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

  // Poll while focused so balances/activity stay live without a manual pull.
  useFocusEffect(
    useCallback(() => {
      const id = setInterval(() => void refreshAll(), POLL_MS);
      return () => clearInterval(id);
    }, [refreshAll]),
  );

  return (
    <View className="flex-1 bg-brisk-bg0">
      <AuroraBackground>
        <SafeAreaView edges={["top"]} className="flex-1">
          <ScrollView
            contentContainerStyle={{ padding: 20, paddingBottom: 120 }}
            refreshControl={
              <RefreshControl
                refreshing={refreshing}
                onRefresh={onRefresh}
                tintColor={BRISK.accent}
              />
            }
          >
            {/* Balance */}
            <Animated.View entering={FadeInDown.duration(500).springify()} className="items-center">
              <Text className="text-center text-sm uppercase tracking-[2px] text-brisk-subtext">
                Balance
              </Text>
              <View className="mt-1 items-center">
                {loading ? (
                  <Text className="text-6xl font-inter-extrabold text-brisk-text">…</Text>
                ) : (
                  <AuroraText className="text-6xl font-inter-extrabold">
                    {formatUsd(Math.round(shownMicros))}
                  </AuroraText>
                )}
              </View>
              <Text className="mt-1 text-center text-sm text-brisk-subtext">
                USDC · feeless on Sui
              </Text>
            </Animated.View>

            {/* Receive / Send */}
            <Animated.View
              entering={FadeInDown.duration(500).delay(80).springify()}
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

            {/* Save summary */}
            <Animated.View entering={FadeInDown.duration(500).delay(140).springify()}>
              <Pressable className="mt-5" onPress={() => router.push("/save")}>
                <GlassCard className="flex-row items-center px-4 py-4" blur={false}>
                  {saveActive ? (
                    <PulseRing size={24}>
                      <PiggyBank color={BRISK.accent} size={24} />
                    </PulseRing>
                  ) : (
                    <PiggyBank color={BRISK.accent} size={24} />
                  )}
                  <View className="ml-3 flex-1">
                    <Text className="text-sm font-inter-semibold text-brisk-text">Save</Text>
                    <Text className="text-xs text-brisk-subtext">
                      {saveActive
                        ? `+${formatUsdPrecise(saveEarned)} earned · ${formatApy(saveNetApy)} APY`
                        : save.vaultId
                          ? "Earning yield on idle dollars"
                          : "Not active yet"}
                    </Text>
                  </View>
                  <Text className="text-base font-inter-semibold text-brisk-text">
                    {formatUsd(Math.round(saveValue))}
                  </Text>
                </GlassCard>
              </Pressable>
            </Animated.View>

            {/* Activity */}
            <Animated.View entering={FadeInDown.duration(500).delay(200)}>
              <Text className="mt-8 text-sm uppercase tracking-[2px] text-brisk-subtext">
                Activity
              </Text>
            </Animated.View>
            {items.length === 0 ? (
              <Text className="mt-3 text-sm text-brisk-subtext">No payments yet.</Text>
            ) : (
              <View className="mt-3">
                {items.map((it, i) => (
                  <ActivityRow key={`${it.digest}-${i}`} item={it} index={i} />
                ))}
              </View>
            )}
          </ScrollView>
        </SafeAreaView>
      </AuroraBackground>
    </View>
  );
}
