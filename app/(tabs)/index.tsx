import { useCallback, useState } from "react";
import { RefreshControl, ScrollView, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { ArrowDownLeft, ArrowUpRight, PiggyBank } from "lucide-react-native";

import { PrimaryButton } from "@/components/ui/PrimaryButton";
import { useWallet } from "@/hooks/useWallet";
import { useSave } from "@/hooks/useSave";
import { useActivity } from "@/hooks/useActivity";
import { formatUsd } from "@/services/blockchain/paymentTx";

function shortAddr(a: string): string {
  return a.length > 12 ? `${a.slice(0, 6)}…${a.slice(-4)}` : a;
}

export default function HomeScreen() {
  const router = useRouter();
  const { usdcMicros, loading, refresh } = useWallet();
  const { state: save } = useSave();
  const { items, refresh: refreshActivity } = useActivity();
  const [refreshing, setRefreshing] = useState(false);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await Promise.all([refresh(), refreshActivity()]);
    setRefreshing(false);
  }, [refresh, refreshActivity]);

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
          {loading ? "…" : formatUsd(usdcMicros)}
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
        <View className="mt-5 flex-row items-center rounded-2xl border border-[#1C2A3A] bg-brisk-bg1 px-4 py-4">
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
        </View>

        {/* Activity */}
        <Text className="mt-8 text-sm uppercase tracking-[2px] text-brisk-subtext">Activity</Text>
        {items.length === 0 ? (
          <Text className="mt-3 text-sm text-brisk-subtext">No payments yet.</Text>
        ) : (
          <View className="mt-3">
            {items.map((it, i) => {
              const received = it.direction === "received";
              return (
                <View
                  key={`${it.digest}-${i}`}
                  className="mb-2 flex-row items-center rounded-2xl border border-[#1C2A3A] bg-brisk-bg1 px-4 py-3"
                >
                  {received ? (
                    <ArrowDownLeft color="#00D98B" size={20} />
                  ) : (
                    <ArrowUpRight color="#8B98A5" size={20} />
                  )}
                  <View className="ml-3 flex-1">
                    <Text className="text-sm text-brisk-text">
                      {received ? "Received" : "Sent"}
                    </Text>
                    <Text className="text-xs text-brisk-subtext">
                      {received ? "from" : "to"} {shortAddr(it.counterparty)}
                    </Text>
                  </View>
                  <Text
                    className={`text-base font-semibold ${received ? "text-brisk-accent" : "text-brisk-text"}`}
                  >
                    {received ? "+" : "−"}
                    {formatUsd(it.amountMicros)}
                  </Text>
                </View>
              );
            })}
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}
