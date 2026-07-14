import { useCallback, useEffect, useState } from "react";
import { Pressable, RefreshControl, ScrollView, Text, View } from "react-native";
import Animated, { FadeInDown } from "react-native-reanimated";
import { useRouter } from "expo-router";
import { useFocusEffect } from "@react-navigation/native";
import { Landmark, PiggyBank, Plus, Sparkles, Store } from "lucide-react-native";

import { HeroAmount } from "@/components/ui/HeroAmount";
import { ListRow } from "@/components/ui/ListRow";
import { SectionLabel } from "@/components/ui/SectionLabel";
import { PrimaryButton } from "@/components/ui/PrimaryButton";
import { ActivityRow } from "@/components/ui/ActivityRow";
import { useTills } from "@/hooks/useTills";
import { useWallet } from "@/hooks/useWallet";
import { useSave } from "@/hooks/useSave";
import { useActivity } from "@/hooks/useActivity";
import { useMerchantDirectory } from "@/hooks/useMerchantDirectory";
import { useMerchantProfile } from "@/hooks/useMerchantProfile";
import { useTabBarClearance } from "@/hooks/useTabBarClearance";
import { useLiveYield } from "@/hooks/useLiveYield";
import { formatUsd } from "@/services/blockchain/paymentTx";
import { STAGGER_MS, ICON } from "@/theme/scale";
import { useTheme } from "@/hooks/useTheme";

function shortAddr(a: string): string {
  return a.length > 12 ? `${a.slice(0, 6)}…${a.slice(-4)}` : a;
}

const POLL_MS = 10_000;

/**
 * Pro home: the merchant's business view. The hero shows the TOTAL balance
 * across everything — treasury liquid + Save + all receiving accounts (tills).
 * Below, a single itemized "Accounts" list breaks that down: Treasury, Save,
 * then each receiving account with a per-account "Move to treasury" action.
 * This is where merchant tools (business identity, gift cards, fees) slot in.
 */
export function ProDashboard() {
  const theme = useTheme();
  const router = useRouter();
  const { usdcMicros, refresh: refreshWallet } = useWallet();
  const { state: save, refresh: refreshSave } = useSave();
  const { liveValueMicros: saveValue } = useLiveYield(save);
  const { items: activity, refresh: refreshActivity } = useActivity();
  const { nameFor, logoFor, resolve } = useMerchantDirectory();
  const { name: businessName } = useMerchantProfile();
  const { tills, refresh: refreshTills } = useTills();
  const [refreshing, setRefreshing] = useState(false);
  const bottomPad = useTabBarClearance();

  const pendingMicros = tills.reduce((sum, t) => sum + t.balanceMicros, 0);
  // Only surface receiving accounts that actually hold funds; empty ones are
  // hidden (managed from the Tills screen via "Manage").
  const fundedTills = tills.filter((t) => t.balanceMicros > 0);
  const totalMicros = usdcMicros + saveValue + pendingMicros;

  const refreshAll = useCallback(
    () => Promise.all([refreshWallet(), refreshSave(), refreshTills(), refreshActivity()]),
    [refreshWallet, refreshSave, refreshTills, refreshActivity],
  );

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await refreshAll();
    setRefreshing(false);
  }, [refreshAll]);

  // Warm the merchant directory so Activity shows business names, not 0x.
  useEffect(() => {
    resolve(activity.map((it) => it.counterparty));
  }, [activity, resolve]);

  useFocusEffect(
    useCallback(() => {
      // Refresh right away on focus (e.g. coming back from a tap-to-pay sale)
      // so the total is current immediately — then keep it live by polling.
      void refreshAll();
      const id = setInterval(() => void refreshAll(), POLL_MS);
      return () => clearInterval(id);
    }, [refreshAll]),
  );

  return (
    <ScrollView
      contentContainerStyle={{ paddingBottom: bottomPad }}
      showsVerticalScrollIndicator={false}
      refreshControl={
        <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={theme.accent} />
      }
    >
      {/* Business name → Business hub (quiet affordance; the canonical entry is
          the Business tools card below). */}
      {businessName ? (
        <Pressable
          onPress={() => router.push("/business")}
          className="mb-1 items-center"
          hitSlop={8}
        >
          <Text className="text-center text-sm font-inter-semibold text-brisk-text">
            {businessName}
          </Text>
        </Pressable>
      ) : null}

      {/* Total balance across all accounts */}
      <Animated.View entering={FadeInDown.duration(500).springify()} className="items-center">
        <Text className="text-center text-sm uppercase tracking-[2px] text-brisk-subtext">
          Total balance
        </Text>
        <HeroAmount micros={totalMicros} tier="primary" className="mt-1" />
        <Text className="mt-1 text-center text-sm text-brisk-subtext">
          Across treasury, savings & receiving accounts
        </Text>
      </Animated.View>

      {/* Accounts — itemized: Treasury, Save, then each receiving account. */}
      <Animated.View entering={FadeInDown.duration(500).delay(STAGGER_MS).springify()}>
        <SectionLabel
          className="mt-7"
          action={
            <Pressable onPress={() => router.push("/tills")} hitSlop={8}>
              <Text className="text-xs font-inter-semibold text-brisk-accent">Manage</Text>
            </Pressable>
          }
        >
          Accounts
        </SectionLabel>

        {/* Treasury (own liquid funds) */}
        <View className="mt-3">
          <ListRow
            icon={Landmark}
            title="Treasury"
            subtitle="Private balance"
            value={formatUsd(usdcMicros)}
          />
        </View>

        {/* Save (treasury earning yield) */}
        <View className="mt-3">
          <ListRow
            onPress={() => router.push("/save")}
            icon={PiggyBank}
            title="Save"
            subtitle="Earning yield"
            value={formatUsd(Math.round(saveValue))}
          />
        </View>

        {/* Receiving accounts (tills) — only those holding funds */}
        {fundedTills.map((t, i) => (
          <Animated.View
            key={t.tillId}
            entering={FadeInDown.duration(400).delay(Math.min(i, 8) * STAGGER_MS)}
            className="mt-3"
          >
            {/* Read-only overview — sweeping ("Move to treasury") lives on the
                Tills screen (the canonical home), reached via "Manage". */}
            <ListRow
              icon={Store}
              title={t.name}
              subtitle={`${shortAddr(t.tillId)} · sweeps to ${shortAddr(t.treasury)}`}
              value={formatUsd(t.balanceMicros)}
              valueClassName="text-brisk-accent"
            />
          </Animated.View>
        ))}

        {tills.length === 0 ? (
          <Pressable
            onPress={() => router.push("/tills")}
            className="mt-3 flex-row items-center justify-center rounded-2xl border border-brisk-borderStrong bg-brisk-bg1/70 px-4 py-4"
          >
            <Plus color={theme.accent} size={ICON.inlineAction} />
            <Text className="ml-2 text-sm font-inter-semibold text-brisk-accent">
              Create your first receiving account
            </Text>
          </Pressable>
        ) : null}
      </Animated.View>

      {/* Collect — the two ways to get paid, side by side. ERP terminal sits
          next to New charge (not hidden) since it's the primary in-store flow. */}
      <Animated.View
        entering={FadeInDown.duration(500)
          .delay(STAGGER_MS * 2)
          .springify()}
        className="mt-7 flex-row gap-3"
      >
        <View className="flex-1">
          <PrimaryButton label="New charge" onPress={() => router.push("/merchant")} />
        </View>
        <View className="flex-1">
          <PrimaryButton
            label="ERP terminal"
            variant="secondary"
            onPress={() => router.push("/terminal")}
          />
        </View>
      </Animated.View>

      {/* Business tools — canonical entry to the Business hub. */}
      <Animated.View
        entering={FadeInDown.duration(500)
          .delay(STAGGER_MS * 3)
          .springify()}
        className="mt-3"
      >
        <ListRow
          onPress={() => router.push("/business")}
          icon={Sparkles}
          title="Business tools"
          subtitle="Business name, gift cards & fees"
          chevron
        />
      </Animated.View>

      {/* Activity — on-chain money movements (sweeps, sends, receives). */}
      {activity.length > 0 ? (
        <Animated.View
          entering={FadeInDown.duration(500)
            .delay(STAGGER_MS * 4)
            .springify()}
        >
          <SectionLabel
            className="mt-8"
            action={
              <Pressable onPress={() => router.push("/activity")} hitSlop={8}>
                <Text className="text-xs font-inter-semibold text-brisk-accent">See all</Text>
              </Pressable>
            }
          >
            Activity
          </SectionLabel>
          <View className="mt-3">
            {activity.map((it, i) => (
              <ActivityRow
                key={`${it.digest}-${i}`}
                item={it}
                index={i}
                name={nameFor(it.counterparty)}
                logoUrl={logoFor(it.counterparty)}
              />
            ))}
          </View>
        </Animated.View>
      ) : null}
    </ScrollView>
  );
}
