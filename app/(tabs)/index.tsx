import { useEffect, useMemo, useRef, useState } from "react";
import { Platform, Pressable, Text, View, useWindowDimensions } from "react-native";
import { useQuery } from "@tanstack/react-query";
import Swiper from "react-native-deck-swiper";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { SlidersHorizontal } from "lucide-react-native";

import { AuthGateScreen } from "@/components/common/AuthGateScreen";
import { MarketSwipeCard } from "@/components/cards/MarketSwipeCard";
import { RangeMarketSwipeCard } from "@/components/cards/RangeMarketSwipeCard";
import { EmptyState } from "@/components/common/EmptyState";
import { ErrorBanner } from "@/components/common/ErrorBanner";
import { LoadingState } from "@/components/common/LoadingState";
import { FiltersSheet } from "@/components/markets/FiltersSheet";
import { TIMEFRAME_WINDOW_MS, type MarketFilterValue } from "@/components/markets/MarketFilters";
import { MarketPreviewModal } from "@/components/markets/MarketPreviewModal";
import { SessionBetBar } from "@/components/markets/SessionBetBar";
import { SmartBetBar } from "@/components/markets/SmartBetBar";
import { DeepBookTicker } from "@/components/markets/DeepBookTicker";
import { PrimaryButton } from "@/components/ui/PrimaryButton";
import { useAuth } from "@/hooks/useAuth";
import { useMarkets } from "@/hooks/useMarkets";
import { usePredict } from "@/hooks/usePredict";
import { useSettlementPolling } from "@/hooks/useSettlementPolling";
import { useThemes } from "@/hooks/useThemes";
import { suiClient } from "@/services/blockchain/suiClient";
import { usePortfolioStore } from "@/store/portfolioStore";
import { useSettingsStore } from "@/store/settingsStore";
import { ENV } from "@/utils/constants";
import { hapticSwipeReleaseNo, hapticSwipeReleaseYes } from "@/utils/haptics";
import type { MarketCard, MarketKind } from "@/types/market";

// One visible card at a time. Previously stackSize=3 caused the cards
// behind the top to render full content (titles, odds, expiry text) that
// bled through visually around the edges. Showing one card eliminates
// the bleed entirely without needing per-card silhouette logic.
const STACK_SIZE = 1;
const STACK_SEPARATION = 0;
const TIMEFRAME_ORDER: MarketFilterValue[] = ["Quick", "Today", "Week", "Month"];

type SwipeMode = "binary" | "range";

export default function SwipeScreen() {
  const insets = useSafeAreaInsets();
  const { height: windowHeight } = useWindowDimensions();
  const { session, status, login, errorMessage } = useAuth();
  const { markets, isLoading, isError, refetch, removeTopMarket } = useMarkets();
  const { submitPrediction, lastError, isSubmitting, smartBetNote } = usePredict();
  const betAmount = useSettingsStore((s) => s.betAmount);
  const pauseTrading = useSettingsStore((s) => s.pauseTrading);
  const setPauseTrading = useSettingsStore((s) => s.setPauseTrading);
  const history = usePortfolioStore((s) => s.history);
  useSettlementPolling(Boolean(session));
  const swiperRef = useRef<Swiper<MarketCard> | null>(null);
  const [swipeBias, setSwipeBias] = useState(0);
  const [mode, setMode] = useState<SwipeMode>("binary");
  const [selectedTimeframe, setSelectedTimeframe] = useState<MarketFilterValue | null>(null);
  const [selectedThemeId, setSelectedThemeId] = useState<string | null>(null);
  const [previewMarket, setPreviewMarket] = useState<MarketCard | null>(null);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [nowMs, setNowMs] = useState(() => Date.now());
  const { themes } = useThemes();
  const { width } = useWindowDimensions();
  const deckWidth = Math.min(width - 32, 420);
  const cardWidth = Math.max(deckWidth - 40, 300);

  const balanceQuery = useQuery({
    queryKey: ["dusdc-balance", session?.address],
    enabled: Boolean(session?.address),
    queryFn: async () => {
      if (!session) return 0;
      const balance = await suiClient.getBalance({
        owner: session.address,
        coinType: ENV.dusdcType,
      });
      return Number(balance.totalBalance ?? "0");
    },
    refetchInterval: 10_000,
  });

  useEffect(() => {
    const timer = setInterval(() => setNowMs(Date.now()), 1_000);
    return () => clearInterval(timer);
  }, []);

  const selectedTheme = useMemo(
    () => themes.find((t) => t.id === selectedThemeId) ?? null,
    [themes, selectedThemeId],
  );

  /** Markets in the current mode (binary vs range). */
  const modeMarkets = useMemo(
    () => markets.filter((m) => (m.kind as MarketKind) === mode),
    [markets, mode],
  );

  /**
   * Markets the user has already bet on stay out of the deck — they're either
   * pending, settled, or claimed in Profile. Avoids showing the same market
   * back to the user. Matches by `marketId` in portfolio history.
   */
  const betMarketIds = useMemo(() => {
    const ids = new Set<string>();
    for (const item of history) {
      if (item.marketId) ids.add(item.marketId);
    }
    return ids;
  }, [history]);

  /** Count of active (in-window, not yet bet on) markets per timeframe. */
  const counts = useMemo(() => {
    const tally: Record<MarketFilterValue, number> = {
      Quick: 0,
      Today: 0,
      Week: 0,
      Month: 0,
    };
    for (const m of modeMarkets) {
      if (betMarketIds.has(m.id)) continue;
      const dt = m.expiryTimestamp - nowMs;
      if (dt <= 0) continue;
      if (dt <= TIMEFRAME_WINDOW_MS.Quick) tally.Quick++;
      if (dt <= TIMEFRAME_WINDOW_MS.Today) tally.Today++;
      if (dt <= TIMEFRAME_WINDOW_MS.Week) tally.Week++;
      if (dt <= TIMEFRAME_WINDOW_MS.Month) tally.Month++;
    }
    return tally;
  }, [modeMarkets, betMarketIds, nowMs]);

  /**
   * Pick a sensible default timeframe: the shortest non-empty window. This
   * way the user doesn't land on an empty "Quick" view just because there
   * are no <1h markets right now — short-term cards still surface as soon
   * as they appear, but the user sees today/week/month if not.
   */
  const effectiveTimeframe: MarketFilterValue = useMemo(() => {
    if (selectedTimeframe) return selectedTimeframe;
    for (const t of TIMEFRAME_ORDER) {
      if (counts[t] > 0) return t;
    }
    return "Today";
  }, [selectedTimeframe, counts]);

  /** Filter markets by mode + timeframe + theme + bet-history. */
  const filteredMarkets = useMemo(() => {
    const window = TIMEFRAME_WINDOW_MS[effectiveTimeframe];
    const themeFilter = selectedTheme ? new Set(selectedTheme.marketIds) : null;
    return modeMarkets.filter((m) => {
      if (betMarketIds.has(m.id)) return false;
      const dt = m.expiryTimestamp - nowMs;
      if (dt <= 0 || dt > window) return false;
      if (themeFilter && !themeFilter.has(m.id)) return false;
      return true;
    });
  }, [modeMarkets, betMarketIds, nowMs, effectiveTimeframe, selectedTheme]);

  const topCards = useMemo(() => filteredMarkets.slice(0, 12), [filteredMarkets]);

  /**
   * Why is the deck empty right now? We branch the empty-state copy so the
   * user knows whether to wait, change a filter, or come back tomorrow.
   *
   *   `nothing-live`  : backend has no markets at all (rare, RPC/indexer issue).
   *   `all-bet`       : every market in the current mode that's still in
   *                     window has already been bet on this session — the
   *                     user "swept the deck."
   *   `filtered-out`  : there ARE markets in the current mode, but the
   *                     active timeframe/theme filter excludes them all.
   *   `mode-empty`    : no markets exist in the current mode (binary/range)
   *                     regardless of filter.
   */
  const emptyDeckKind: EmptyDeckKind = useMemo(() => {
    if (markets.length === 0) return "nothing-live";
    if (modeMarkets.length === 0) return "mode-empty";
    const inWindowNotBet = modeMarkets.filter(
      (m) => !betMarketIds.has(m.id) && m.expiryTimestamp - nowMs > 0,
    );
    if (inWindowNotBet.length === 0) return "all-bet";
    return "filtered-out";
  }, [markets, modeMarkets, betMarketIds, nowMs]);

  if (!session) {
    return (
      <AuthGateScreen
        title="Swipe"
        subtitle="Make directional calls in one gesture. Sign in to unlock live cards."
        ctaLabel="Continue with Google"
        loading={status === "loading"}
        onPress={() => void login()}
        errorMessage={errorMessage}
        chipText={`Right = YES · Left = NO · Stake ${betAmount} dUSDC`}
      />
    );
  }

  const handleSwipedLeft = (index: number) => {
    if (isSubmitting) return;
    const market = topCards[index];
    if (!market) return;
    setSwipeBias(0);
    void hapticSwipeReleaseNo();
    if (market.kind === "range") {
      removeTopMarket(market.id);
      return;
    }
    removeTopMarket(market.id);
    void submitPrediction(market, "NO");
  };

  const handleSwipedRight = (index: number) => {
    if (isSubmitting) return;
    const market = topCards[index];
    if (!market) return;
    setSwipeBias(0);
    void hapticSwipeReleaseYes();
    removeTopMarket(market.id);
    void submitPrediction(market, market.kind === "range" ? "BOUNDED" : "YES");
  };

  /** Skip dismisses the top card without minting any position. */
  const handleSkip = () => {
    const top = topCards[0];
    if (!top) return;
    setSwipeBias(0);
    removeTopMarket(top.id);
  };

  const overlayLabels =
    mode === "range"
      ? {
          left: makeOverlay("SKIP", "#9BB2C9", { side: "left" }),
          right: makeOverlay("BOUNDED", "#00D98B", { side: "right" }),
        }
      : {
          left: makeOverlay("NO", "#FF5A76", { side: "left" }),
          right: makeOverlay("YES", "#00D98B", { side: "right" }),
        };

  // Reserve room for the SessionBetBar + filter button row + top header.
  // The card itself is ~420; we constrain the deck container so it never
  // sits behind the system tab bar.
  const tabBarHeight = Platform.OS === "web" ? 72 : 58 + insets.bottom;
  const chromeAbove = 130; // header + bet bar + filters row + paddings
  const reloadButton = 56;
  const deckHeight = Math.min(
    460,
    Math.max(320, windowHeight - chromeAbove - reloadButton - tabBarHeight),
  );

  return (
    <SafeAreaView edges={["top"]} className="flex-1 bg-fathom-bg0">
      <MarketPreviewModal
        market={previewMarket}
        stake={betAmount}
        onClose={() => setPreviewMarket(null)}
      />
      <FiltersSheet
        visible={filtersOpen}
        onClose={() => setFiltersOpen(false)}
        mode={mode}
        onSelectMode={setMode}
        timeframe={effectiveTimeframe}
        onSelectTimeframe={(v) => setSelectedTimeframe(v)}
        timeframeCounts={counts}
        themes={themes}
        selectedThemeId={selectedThemeId}
        onSelectTheme={setSelectedThemeId}
      />
      <View className="mx-auto w-full max-w-[460px] flex-1 px-4 pt-2">
        {/* Compact header — title + count */}
        <View className="mb-2 flex-row items-end justify-between px-1">
          <Text className="text-[11px] uppercase tracking-[2px] text-fathom-subtext">Fathom</Text>
          <Text className="text-[11px] text-fathom-subtext">
            {topCards.length} live · {mode} · {effectiveTimeframe.toLowerCase()}
          </Text>
        </View>

        {/* Persistent balance + stake bar */}
        <SessionBetBar
          balanceMicro={balanceQuery.data ?? 0}
          balanceLoading={balanceQuery.isLoading}
        />

        {/* Live DeepBook SUI/DBUSDC orderbook ticker — the real book the
            Smart Bet spot leg trades against. */}
        <DeepBookTicker />

        {/* DeepBook Smart Bet: opt-in single-PTB composition (Predict mint
            + enforced DeepBook Spot leg). Headline beat for the DeepBook track. */}
        <SmartBetBar />

        {/* Single Filters button — themes / mode / timeframe live in a sheet
            to keep the deck unobstructed. */}
        <Pressable
          onPress={() => setFiltersOpen(true)}
          className="mb-2 flex-row items-center justify-between rounded-2xl border border-[#27415A] bg-fathom-bg1 px-3 py-2"
        >
          <View className="flex-row items-center gap-2">
            <SlidersHorizontal color="#8B98A5" size={16} />
            <Text className="text-[12px] font-semibold text-fathom-text">Filters</Text>
          </View>
          <Text className="text-[11px] text-fathom-subtext">
            {selectedTheme ? selectedTheme.name : "All themes"}
          </Text>
        </Pressable>

        {lastError ? (
          <View className="mb-2">
            <ErrorBanner message={lastError} />
          </View>
        ) : null}

        {smartBetNote ? (
          <View className="mb-2 rounded-xl border border-amber-500/30 bg-amber-500/10 px-3 py-2">
            <Text className="text-xs text-amber-300">{smartBetNote}</Text>
          </View>
        ) : null}

        {isLoading ? <LoadingState label="Loading active markets..." /> : null}

        {!isLoading && isError ? (
          <EmptyState
            title="Couldn't load markets."
            subtitle="The Predict server may be unavailable. Pull to retry."
          />
        ) : null}

        {pauseTrading ? (
          <View className="mt-2 rounded-3xl border border-[#27415A] bg-fathom-bg1 p-5">
            <Text className="text-[11px] uppercase tracking-[2px] text-fathom-bull">
              Trading paused
            </Text>
            <Text className="mt-2 text-lg font-semibold text-fathom-text">
              You&apos;re taking a break.
            </Text>
            <Text className="mt-2 text-sm leading-6 text-fathom-subtext">
              The Swipe deck is paused from Settings → Responsible gaming. Take all the time you
              need — your streak and history are saved.
            </Text>
            <View className="mt-4">
              <PrimaryButton label="I'm ready again" onPress={() => setPauseTrading(false)} />
            </View>
          </View>
        ) : null}

        {!pauseTrading && !isLoading && !isError && topCards.length === 0 ? (
          <EmptyDeckState
            kind={emptyDeckKind}
            mode={mode}
            timeframe={effectiveTimeframe}
            onOpenFilters={() => setFiltersOpen(true)}
            onReload={() => void refetch()}
            isReloading={isSubmitting}
          />
        ) : null}

        {!pauseTrading && !isLoading && !isError && topCards.length > 0 ? (
          <View className="items-center">
            <View style={{ width: deckWidth, height: deckHeight }}>
              <Swiper
                // react-native-deck-swiper caches rendered cards internally,
                // so prop changes on inner cards (stake, smartBet flag) don't
                // propagate. Keying on those values forces a remount; since
                // we mutate topCards (removing each swiped market), the
                // remount lands back on the same next-card — no UX regression.
                key={`deck-${betAmount}`}
                ref={swiperRef}
                cards={topCards}
                renderCard={(card) =>
                  card.kind === "range" ? (
                    <RangeMarketSwipeCard
                      market={card}
                      stake={betAmount}
                      swipeBias={swipeBias}
                      actionsDisabled={isSubmitting}
                      onPressOutside={() => swiperRef.current?.swipeLeft()}
                      onPressBounded={() => swiperRef.current?.swipeRight()}
                      onPressPreview={() => setPreviewMarket(card)}
                    />
                  ) : (
                    <MarketSwipeCard
                      market={card}
                      stake={betAmount}
                      swipeBias={swipeBias}
                      actionsDisabled={isSubmitting}
                      onPressNo={() => swiperRef.current?.swipeLeft()}
                      onPressYes={() => swiperRef.current?.swipeRight()}
                      onPressSkip={handleSkip}
                      onPressPreview={() => setPreviewMarket(card)}
                    />
                  )
                }
                containerStyle={{
                  width: "100%",
                  height: deckHeight,
                  alignItems: "center",
                  justifyContent: "flex-start",
                }}
                cardStyle={{ width: cardWidth, alignSelf: "center" }}
                cardHorizontalMargin={20}
                cardVerticalMargin={20}
                stackSize={STACK_SIZE}
                stackSeparation={STACK_SEPARATION}
                backgroundColor="transparent"
                animateCardOpacity
                disableLeftSwipe={isSubmitting}
                disableRightSwipe={isSubmitting}
                disableTopSwipe
                disableBottomSwipe
                onSwiping={(x) => setSwipeBias(x)}
                onSwiped={() => setSwipeBias(0)}
                onSwipedLeft={handleSwipedLeft}
                onSwipedRight={handleSwipedRight}
                overlayLabels={overlayLabels}
              />
            </View>
            <View className="mt-2 w-full">
              <PrimaryButton
                label={isSubmitting ? "Submitting trade..." : "Reload markets"}
                onPress={() => void refetch()}
                loading={isSubmitting}
                variant="secondary"
              />
            </View>
          </View>
        ) : null}
      </View>
    </SafeAreaView>
  );
}

type EmptyDeckKind = "nothing-live" | "mode-empty" | "all-bet" | "filtered-out";

function EmptyDeckState({
  kind,
  mode,
  timeframe,
  onOpenFilters,
  onReload,
  isReloading,
}: {
  kind: EmptyDeckKind;
  mode: SwipeMode;
  timeframe: MarketFilterValue;
  onOpenFilters: () => void;
  onReload: () => void;
  isReloading: boolean;
}) {
  const emoji =
    kind === "all-bet"
      ? "🎉"
      : kind === "nothing-live"
        ? "🌙"
        : kind === "mode-empty"
          ? "🧭"
          : "🔍";
  const title =
    kind === "all-bet"
      ? "You've swiped every market."
      : kind === "nothing-live"
        ? "No live markets right now."
        : kind === "mode-empty"
          ? mode === "range"
            ? "No range markets are open."
            : "No binary markets are open."
          : "Nothing matches the current filter.";
  const subtitle =
    kind === "all-bet"
      ? "Nice run. Open positions are on the Profile tab. Fresh markets will surface as oracles publish new strikes — pull to refresh, or try a longer timeframe to see further-dated markets."
      : kind === "nothing-live"
        ? "The Predict server hasn't surfaced any active oracles in the last refresh. Pull to retry — most outages clear within a minute."
        : kind === "mode-empty"
          ? mode === "range"
            ? "Range markets only mint BOUNDED positions. Switch back to Binary to keep swiping while range markets warm up."
            : "Binary markets are quiet — try Range mode for bounded-range cards while we wait."
          : `No ${mode} markets land in the ${timeframe.toLowerCase()} window. Widen the timeframe or clear the theme filter.`;
  const primaryLabel =
    kind === "filtered-out" || kind === "mode-empty" ? "Open filters" : "Reload markets";
  const primaryAction = kind === "filtered-out" || kind === "mode-empty" ? onOpenFilters : onReload;

  return (
    <View className="rounded-3xl border border-[#27415A] bg-fathom-bg1 p-6">
      <Text className="text-3xl">{emoji}</Text>
      <Text className="mt-3 text-lg font-bold text-fathom-text">{title}</Text>
      <Text className="mt-2 text-sm leading-5 text-fathom-subtext">{subtitle}</Text>
      <View className="mt-4 gap-2">
        <PrimaryButton
          label={primaryLabel}
          onPress={primaryAction}
          loading={primaryLabel === "Reload markets" && isReloading}
        />
        {kind === "filtered-out" || kind === "mode-empty" ? (
          <PrimaryButton label="Reload markets" onPress={onReload} variant="secondary" />
        ) : null}
      </View>
    </View>
  );
}

function makeOverlay(title: string, color: string, { side }: { side: "left" | "right" }) {
  return {
    title,
    style: {
      label: {
        backgroundColor: color,
        color: "#07111A",
        borderWidth: 0,
        overflow: "hidden",
      },
      wrapper: {
        alignItems: side === "left" ? ("flex-end" as const) : ("flex-start" as const),
        justifyContent: "flex-start" as const,
        marginTop: 30,
        marginLeft: side === "left" ? -20 : 20,
      },
    },
  };
}
