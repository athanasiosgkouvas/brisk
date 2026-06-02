import { useCallback, useState } from "react";
import { Pressable, RefreshControl, ScrollView, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { useFocusEffect } from "@react-navigation/native";
import * as Clipboard from "expo-clipboard";
import * as Haptics from "expo-haptics";
import { ArrowDownLeft, ArrowUpRight, Check, Copy, PiggyBank } from "lucide-react-native";

import { PrimaryButton } from "@/components/ui/PrimaryButton";
import { useWallet } from "@/hooks/useWallet";
import { useSave } from "@/hooks/useSave";
import { useActivity } from "@/hooks/useActivity";
import { useCountUp } from "@/hooks/useCountUp";
import { formatUsd } from "@/services/blockchain/paymentTx";
import { type ActivityItem } from "@/services/blockchain/receipts";
import { formatRelativeTime } from "@/utils/time";

function shortAddr(a: string): string {
  return a.length > 12 ? `${a.slice(0, 6)}…${a.slice(-4)}` : a;
}

// Live-refresh cadence while the Wallet tab is focused.
const POLL_MS = 10_000;

function ActivityRow({ item }: { item: ActivityItem }) {
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
    <View className="mb-2 flex-row items-center rounded-2xl border border-[#1C2A3A] bg-brisk-bg1 px-4 py-3">
      {received ? (
        <ArrowDownLeft color="#00D98B" size={20} />
      ) : (
        <ArrowUpRight color="#8B98A5" size={20} />
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
          <Pressable onPress={copyTx} hitSlop={8} className="mt-1 flex-row items-center">
            {copied ? <Check color="#00D98B" size={12} /> : <Copy color="#5A6B7B" size={12} />}
            <Text
              className={`ml-1 text-[11px] ${copied ? "text-brisk-accent" : "text-brisk-subtext"}`}
            >
              {copied ? "Copied tx" : shortAddr(item.digest)}
            </Text>
          </Pressable>
        ) : null}
      </View>
      <Text
        className={`text-base font-semibold ${received ? "text-brisk-accent" : "text-brisk-text"}`}
      >
        {received ? "+" : "−"}
        {formatUsd(item.amountMicros)}
      </Text>
    </View>
  );
}

export default function HomeScreen() {
  const router = useRouter();
  const { usdcMicros, loading, refresh } = useWallet();
  const { state: save, refresh: refreshSave } = useSave();
  const { items, refresh: refreshActivity } = useActivity();
  const [refreshing, setRefreshing] = useState(false);
  const shownMicros = useCountUp(usdcMicros);

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
    <SafeAreaView edges={["top"]} className="flex-1 bg-brisk-bg0">
      <ScrollView
        contentContainerStyle={{ padding: 20, paddingBottom: 40 }}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#00D98B" />
        }
      >
        {/* Balance */}
        <Text className="text-center text-sm uppercase tracking-[2px] text-brisk-subtext">
          Balance
        </Text>
        <Text className="mt-1 text-center text-6xl font-bold text-brisk-text">
          {loading ? "…" : formatUsd(Math.round(shownMicros))}
        </Text>
        <Text className="mt-1 text-center text-sm text-brisk-subtext">USDC · feeless on Sui</Text>

        {/* Receive / Send */}
        <View className="mt-8 flex-row gap-3">
          <View className="flex-1">
            <PrimaryButton label="Receive" onPress={() => router.push("/receive")} />
          </View>
          <View className="flex-1">
            <PrimaryButton label="Send" variant="secondary" onPress={() => router.push("/send")} />
          </View>
        </View>

        {/* Save summary */}
        <Pressable
          onPress={() => router.push("/save")}
          className="mt-5 flex-row items-center rounded-2xl border border-[#1C2A3A] bg-brisk-bg1 px-4 py-4"
        >
          <PiggyBank color="#00D98B" size={24} />
          <View className="ml-3 flex-1">
            <Text className="text-sm text-brisk-text">Save</Text>
            <Text className="text-xs text-brisk-subtext">
              {save.vaultId ? "Earning yield on idle dollars" : "Not active yet"}
            </Text>
          </View>
          <Text className="text-base font-semibold text-brisk-text">
            {formatUsd(save.valueMicros)}
          </Text>
        </Pressable>

        {/* Activity */}
        <Text className="mt-8 text-sm uppercase tracking-[2px] text-brisk-subtext">Activity</Text>
        {items.length === 0 ? (
          <Text className="mt-3 text-sm text-brisk-subtext">No payments yet.</Text>
        ) : (
          <View className="mt-3">
            {items.map((it, i) => (
              <ActivityRow key={`${it.digest}-${i}`} item={it} />
            ))}
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}
