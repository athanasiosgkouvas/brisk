import { memo, useCallback, useEffect, useMemo, useState } from "react";
import { ActivityIndicator, FlatList, RefreshControl, Text, View } from "react-native";
import { useRouter } from "expo-router";
import { ArrowDownLeft, ArrowUpRight, Inbox, Sparkles } from "lucide-react-native";

import { Screen } from "@/components/ui/Screen";
import { GlassCard } from "@/components/ui/GlassCard";
import { EmptyState } from "@/components/ui/EmptyState";
import { ActivityRow } from "@/components/ui/ActivityRow";
import { useAuth } from "@/hooks/useAuth";
import { useMerchantDirectory } from "@/hooks/useMerchantDirectory";
import { queryActivityPage, type ActivityItem } from "@/services/blockchain/receipts";
import { getSaveHistory, type SaveHistoryItem } from "@/services/blockchain/saveAccount";
import { formatUsd } from "@/services/blockchain/paymentTx";
import { formatRelativeTime } from "@/utils/time";
import { useTheme } from "@/hooks/useTheme";

// Transactions fetched per page (scanned for USDC movements). Loading more on
// scroll keeps us from fetching the whole history up front.
const PAGE = 20;

const SAVE_META = {
  deposit: { label: "Moved to Save", icon: ArrowDownLeft, tone: "accent" },
  withdraw: { label: "Withdrawn", icon: ArrowUpRight, tone: "text" },
  activate: { label: "Activated Save", icon: Sparkles, tone: "subtext" },
} as const;

type Row =
  | { type: "usdc"; ts: number; key: string; item: ActivityItem }
  | { type: "save"; ts: number; key: string; item: SaveHistoryItem };

// "All activity": one place that interleaves on-chain USDC movements (sent /
// received) with Save deposits/withdrawals by time. USDC history paginates on
// scroll (cursor-based); Save history is small and loaded once. The two data
// systems are kept separate (Save ops pair with a pool object, not an address)
// and merged only for display.
export default function ActivityScreen() {
  const theme = useTheme();
  const router = useRouter();
  const { session } = useAuth();
  const { nameFor, logoFor, resolve, invalidate } = useMerchantDirectory();
  const [usdc, setUsdc] = useState<ActivityItem[]>([]);
  const [save, setSave] = useState<SaveHistoryItem[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(true);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const loadInitial = useCallback(async () => {
    if (!session) return;
    const [page, s] = await Promise.all([
      queryActivityPage(session.address, { last: PAGE }),
      getSaveHistory(session.address).catch(() => [] as SaveHistoryItem[]),
    ]);
    setUsdc(page.items);
    setCursor(page.nextCursor);
    setHasMore(page.hasMore);
    setSave(s);
    setLoading(false);
  }, [session]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void loadInitial();
  }, [loadInitial]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    // Force counterparties' names/photos to re-resolve (a pull-to-refresh means
    // "give me the latest"); the warm-up effect below refetches once items land.
    invalidate(usdc.map((it) => it.counterparty));
    await loadInitial();
    setRefreshing(false);
  }, [loadInitial, invalidate, usdc]);

  // Warm the merchant directory so counterparties show business names, not 0x.
  useEffect(() => {
    resolve(usdc.map((it) => it.counterparty));
  }, [usdc, resolve]);

  const loadMore = useCallback(async () => {
    if (!session || loadingMore || !hasMore) return;
    setLoadingMore(true);
    try {
      const page = await queryActivityPage(session.address, { last: PAGE, before: cursor });
      setUsdc((prev) => {
        const seen = new Set(prev.map((i) => i.digest));
        return [...prev, ...page.items.filter((i) => !seen.has(i.digest))];
      });
      setCursor(page.nextCursor);
      setHasMore(page.hasMore);
    } finally {
      setLoadingMore(false);
    }
  }, [session, loadingMore, hasMore, cursor]);

  const rows = useMemo<Row[]>(() => {
    const merged: Row[] = [
      ...usdc.map((it) => ({
        type: "usdc" as const,
        ts: it.timestampMs,
        key: `u-${it.digest}`,
        item: it,
      })),
      ...save.map((it, i) => ({
        type: "save" as const,
        ts: it.timestampMs,
        key: `s-${it.digest}-${i}`,
        item: it,
      })),
    ];
    return merged.sort((a, b) => b.ts - a.ts);
  }, [usdc, save]);

  return (
    <Screen title="Activity" onClose={() => router.back()}>
      {loading ? (
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator color={theme.accent} />
        </View>
      ) : (
        <FlatList
          style={{ flex: 1 }}
          data={rows}
          keyExtractor={(r) => r.key}
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{ paddingTop: 8, paddingBottom: 40 }}
          onEndReached={() => void loadMore()}
          onEndReachedThreshold={0.5}
          initialNumToRender={12}
          windowSize={11}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={onRefresh}
              tintColor={theme.accent}
            />
          }
          // renderItem is intentionally inline (not a stable useCallback): the
          // merchant directory resolves names/logos asynchronously and repaints
          // via a parent re-render, so the row props must be recomputed here each
          // render. ActivityRow/SaveRow are memoized, so unchanged rows still bail.
          renderItem={({ item: row, index }) =>
            row.type === "usdc" ? (
              <ActivityRow
                item={row.item}
                index={index}
                name={nameFor(row.item.counterparty)}
                logoUrl={logoFor(row.item.counterparty)}
              />
            ) : (
              <SaveRow item={row.item} />
            )
          }
          ListEmptyComponent={
            <EmptyState
              icon={Inbox}
              subtitle="No activity yet. Payments, sends, and Save moves will show up here."
            />
          }
          ListFooterComponent={
            loadingMore ? (
              <View className="py-6">
                <ActivityIndicator color={theme.accent} />
              </View>
            ) : null
          }
        />
      )}
    </Screen>
  );
}

/** One Save deposit/withdraw/activation row (mirrors SaveHistory's row style). */
const SaveRow = memo(function SaveRow({ item }: { item: SaveHistoryItem }) {
  const theme = useTheme();
  const m = SAVE_META[item.kind];
  const Icon = m.icon;
  return (
    <GlassCard className="mb-2 flex-row items-center px-4 py-3" blur={false}>
      <Icon color={theme[m.tone]} size={18} />
      <View className="ml-3 flex-1">
        <Text className="text-sm font-inter-semibold text-brisk-text">{m.label}</Text>
        <Text className="text-xs text-brisk-subtext">{formatRelativeTime(item.timestampMs)}</Text>
      </View>
      {item.amountMicros > 0 ? (
        <Text
          className={`text-base font-inter-semibold ${
            item.kind === "withdraw" ? "text-brisk-text" : "text-brisk-accent"
          }`}
        >
          {item.kind === "withdraw" ? "−" : "+"}
          {formatUsd(item.amountMicros)}
        </Text>
      ) : null}
    </GlassCard>
  );
});
