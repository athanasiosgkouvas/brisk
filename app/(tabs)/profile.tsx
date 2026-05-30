import { useMemo, useState } from "react";
import { Platform, Pressable, ScrollView, Text, View, useWindowDimensions } from "react-native";
import * as Clipboard from "expo-clipboard";
import { useRouter } from "expo-router";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";

import { AuthGateScreen } from "@/components/common/AuthGateScreen";
import { EmptyState } from "@/components/common/EmptyState";
import { ErrorBanner } from "@/components/common/ErrorBanner";
import { ClaimSuccessModal } from "@/components/profile/ClaimSuccessModal";
import { DeepBookSwapPanel } from "@/components/profile/DeepBookSwapPanel";
import { DeepBookMakerPanel } from "@/components/profile/DeepBookMakerPanel";
import { ProfileStats } from "@/components/profile/ProfileStats";
import { SocialRetentionPanel } from "@/components/profile/SocialRetentionPanel";
import { PositionHistoryList } from "@/components/profile/PositionHistoryList";
import { WithdrawalModal } from "@/components/profile/WithdrawalModal";
import { PrimaryButton } from "@/components/ui/PrimaryButton";
import { TrustBadges } from "@/components/ui/TrustBadges";
import { useAuth } from "@/hooks/useAuth";
import { usePortfolio } from "@/hooks/usePortfolio";
import { usePredict } from "@/hooks/usePredict";
import { useSendDusdc } from "@/hooks/useSendDusdc";
import { useUserStats } from "@/hooks/useUserStats";
import { suiClient } from "@/services/blockchain/suiClient";
import { useSettingsStore } from "@/store/settingsStore";
import type { PortfolioStats, PositionHistoryItem } from "@/types/position";
import { formatAddress } from "@/utils/formatting";
import { ENV } from "@/utils/constants";
import { useQuery } from "@tanstack/react-query";

function toClaimActionMessage(message: string): string {
  const normalized = message.toLowerCase();
  if (normalized.includes("already claimed")) {
    return "This payout is already claimed.";
  }
  if (normalized.includes("already in progress")) {
    return "Claim already in progress. Please wait a moment.";
  }
  if (normalized.includes("indexing") || normalized.includes("not ready")) {
    return "Settlement is still indexing. Claim will unlock automatically.";
  }
  return "Claim failed. Check your connection and retry.";
}

export default function ProfileScreen() {
  const insets = useSafeAreaInsets();
  const { height: windowHeight } = useWindowDimensions();
  const router = useRouter();
  const { session, logout, login, status, errorMessage } = useAuth();
  const { history, stats: localStats } = usePortfolio();
  const { stats: chainStats } = useUserStats();
  const { claimPayoutToWallet } = usePredict();
  const { send: sendDusdc } = useSendDusdc();
  const { betAmount } = useSettingsStore();
  const [copied, setCopied] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);
  const [claimActionError, setClaimActionError] = useState<string | null>(null);
  const [withdrawOpen, setWithdrawOpen] = useState(false);
  const bottomClearance = Platform.OS === "web" ? 24 : Math.max(40, insets.bottom + 32);
  const scrollViewStyle =
    Platform.OS === "web" ? { height: windowHeight - 72 } : { flex: 1 as const };
  const claimContext = useMemo(() => {
    const claimable = history.filter((item) => item.claimStatus === "CLAIMABLE").length;
    const indexing = history.filter((item) => item.claimStatus === "INDEXING").length;
    const retry = history.filter((item) => item.claimStatus === "FAILED").length;
    const pending = history.filter((item) => item.outcome === "PENDING").length;
    return { claimable, indexing, retry, pending };
  }, [history]);

  // Prefer indexer-derived stats (authoritative, restart-safe). Fall back to
  // the in-memory store before the first indexer response arrives.
  const stats: PortfolioStats = chainStats
    ? {
        totalPredictions: chainStats.totalPredictions,
        wins: chainStats.wins,
        losses: chainStats.losses,
        pending: chainStats.pending,
        winRate: chainStats.winRate,
        currentStreak: chainStats.currentStreak,
      }
    : localStats;

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
    refetchInterval: 15_000,
  });

  const handleClaimPayout = async (position: PositionHistoryItem) => {
    if (position.claimStatus === "CLAIMED" || position.claimStatus === "CLAIMING") {
      return;
    }
    setClaimActionError(null);
    try {
      await claimPayoutToWallet(position);
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : "Unable to claim winnings.";
      setClaimActionError(toClaimActionMessage(message));
    }
  };

  if (!session) {
    return (
      <AuthGateScreen
        title="Portfolio"
        subtitle="Connect to view your streak, stats, and trade history."
        ctaLabel="Continue with Google"
        loading={status === "loading"}
        onPress={() => void login()}
        errorMessage={errorMessage}
        chipText="Your performance, history, and wallet state in one place"
      />
    );
  }

  return (
    <SafeAreaView edges={["top"]} className="flex-1 bg-fathom-bg0">
      <ScrollView
        style={scrollViewStyle}
        contentContainerStyle={{
          paddingHorizontal: 16,
          paddingTop: 16,
          paddingBottom: bottomClearance,
        }}
      >
        <View className="mx-auto w-full max-w-[460px]">
          <Text className="text-[11px] uppercase tracking-[2px] text-fathom-subtext">Fathom</Text>
          <Text className="mt-1 text-3xl font-bold text-fathom-text">Portfolio</Text>
          <View className="mt-4 rounded-3xl border border-[#27415A] bg-fathom-bg1 p-5">
            <Text className="text-[11px] uppercase tracking-wide text-fathom-subtext">Wallet</Text>
            <View className="mt-2 flex-row items-center justify-between">
              <Text className="text-base text-fathom-text">
                {session ? formatAddress(session.address, 12, 8) : "Not connected"}
              </Text>
              {session ? (
                <Pressable
                  className="rounded-xl border border-[#315578] bg-fathom-bg2 px-3 py-1"
                  onPress={() => {
                    void Clipboard.setStringAsync(session.address);
                    setCopied(true);
                    setTimeout(() => setCopied(false), 1500);
                  }}
                >
                  <Text className="text-xs font-semibold text-fathom-bull">
                    {copied ? "Copied" : "Copy"}
                  </Text>
                </Pressable>
              ) : null}
            </View>
            <View className="mt-4">
              <TrustBadges note="Real dUSDC, real Sui, and withdrawal on your timing." />
            </View>
          </View>

          <View className="mt-4">
            <ProfileStats
              stats={stats}
              netPnlMicro={
                chainStats ? chainStats.totalPayoutMicro - chainStats.totalBetMicro : undefined
              }
            />
          </View>
          <SocialRetentionPanel address={session.address} />
          <DeepBookSwapPanel />
          <DeepBookMakerPanel />
          <View className="mt-4 rounded-3xl border border-[#27415A] bg-fathom-bg1 p-5">
            <Text className="text-[11px] uppercase tracking-wide text-fathom-subtext">
              Actionable now
            </Text>
            <Text className="mt-2 text-sm text-fathom-text">
              {claimContext.claimable > 0
                ? `${claimContext.claimable} winning position${claimContext.claimable === 1 ? "" : "s"} ready to claim.`
                : claimContext.retry > 0
                  ? `${claimContext.retry} claim${claimContext.retry === 1 ? "" : "s"} need${claimContext.retry === 1 ? "s" : ""} a retry.`
                  : claimContext.indexing > 0
                    ? `Preparing ${claimContext.indexing} claim${claimContext.indexing === 1 ? "" : "s"} now.`
                    : "No claim action needed right now."}
            </Text>
            <Text className="mt-1 text-xs text-fathom-subtext">
              {claimContext.indexing > 0
                ? "Indexing is automatic — claim buttons appear when ready."
                : `${claimContext.pending} open position${claimContext.pending === 1 ? "" : "s"} awaiting settlement.`}
            </Text>
          </View>

          <View className="mt-4 rounded-3xl border border-[#27415A] bg-fathom-bg1 p-5">
            <Text className="text-[11px] uppercase tracking-wide text-fathom-subtext">
              Settings
            </Text>
            <View className="mt-4 gap-3">
              <PrimaryButton
                label="Withdraw to wallet"
                onPress={() => setWithdrawOpen(true)}
                variant="secondary"
              />
              <PrimaryButton
                label="How it works"
                onPress={() => router.push("/how-it-works")}
                variant="secondary"
              />
              <PrimaryButton
                label="Responsible gaming"
                onPress={() => router.push("/responsible-gaming")}
                variant="secondary"
              />
            </View>
          </View>

          <Text className="mt-6 text-lg font-semibold text-fathom-text">Recent history</Text>
          <View className="mt-3">
            {claimActionError ? (
              <View className="mb-3">
                <ErrorBanner message={claimActionError} />
              </View>
            ) : null}
            {history.length === 0 ? (
              <EmptyState
                title="No prediction history yet"
                subtitle="Swipe a market to place your first trade."
              />
            ) : (
              <PositionHistoryList
                data={history.slice(0, 20)}
                onClaimPayout={(position) => {
                  void handleClaimPayout(position);
                }}
              />
            )}
          </View>

          <View className="mt-6">
            <PrimaryButton
              label={loggingOut ? "Signing out..." : "Logout"}
              loading={loggingOut}
              onPress={() =>
                void (async () => {
                  setLoggingOut(true);
                  try {
                    await logout();
                  } finally {
                    setLoggingOut(false);
                  }
                })()
              }
            />
          </View>
        </View>
      </ScrollView>
      <WithdrawalModal
        visible={withdrawOpen}
        balance={balanceQuery.data ?? 0}
        defaultAmount={betAmount}
        onClose={() => setWithdrawOpen(false)}
        onSend={async (recipient, amount) => {
          await sendDusdc(recipient, amount);
        }}
      />
      <ClaimSuccessModal />
    </SafeAreaView>
  );
}
