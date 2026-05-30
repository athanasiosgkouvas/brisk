import { ENV } from "@/utils/constants";
import type { PortfolioStats, PositionHistoryItem } from "@/types/position";

type SponsorResponse = {
  bytes: string;
  digest: string;
};

async function backendFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const headers = new Headers(init?.headers);
  if (!headers.has("Content-Type") && init?.body) {
    headers.set("Content-Type", "application/json");
  }

  const response = await fetch(`${ENV.backendUrl}${path}`, {
    ...init,
    headers,
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(text || `Backend request failed (${response.status})`);
  }

  return (await response.json()) as T;
}

export async function sponsorTransaction(input: {
  sender: string;
  transactionKindBytes: string;
  allowedMoveCallTargets?: string[];
  allowedAddresses?: string[];
}): Promise<SponsorResponse> {
  return backendFetch<SponsorResponse>("/api/sponsor", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export async function executeSponsoredTransaction(input: {
  digest: string;
  signature: string;
}): Promise<{ digest: string }> {
  return backendFetch<{ digest: string }>("/api/execute", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export async function requestFaucet(address: string): Promise<{
  accepted: boolean;
  message?: string;
  redirectUrl?: string;
}> {
  return backendFetch<{
    accepted: boolean;
    message?: string;
    redirectUrl?: string;
  }>("/api/faucet/request", {
    method: "POST",
    body: JSON.stringify({ address }),
  });
}

export type EarnApySummary = {
  apy7d: number | null;
  reason?: string;
  tvlMicro: number;
  totalPlp: number;
  sharePriceMicro: number;
  samples: number;
  asOfMs: number | null;
};

export async function fetchEarnApySummary(): Promise<EarnApySummary> {
  return backendFetch<EarnApySummary>("/api/earn/apy");
}

// Demo-mode APY snapshot: a steady 8.4% with a recent asOf timestamp so
// the headline number never disappears on camera.
export function getMockEarnApySummary(): EarnApySummary {
  return {
    apy7d: 8.4,
    tvlMicro: 10_000_000_000_000,
    totalPlp: 9_765_625_000_000,
    sharePriceMicro: 1_024_000,
    samples: 2016,
    asOfMs: Date.now(),
  };
}

export type DeepbookTicker = {
  asset: string;
  midMicro: number;
  bidMicro: number | null;
  askMicro: number | null;
  spreadBps: number | null;
  microPerUsd: number;
  observedAtMs: number;
  ageMs: number;
};

export type DeepbookTickerResponse = {
  ticker: DeepbookTicker | null;
  feedRunning: boolean;
  feedLastError: string | null;
};

/**
 * Live DeepBook SUI/DBUSDC ticker (mid + spread). This is the real book the
 * Smart Bet spot leg trades against — NOT a price source for the prediction
 * markets (those are BTC-only on testnet; see backend deepbookPriceFeed).
 */
export async function fetchDeepbookTicker(): Promise<DeepbookTickerResponse> {
  return backendFetch<DeepbookTickerResponse>("/api/deepbook/ticker");
}

export type UserStats = PortfolioStats & {
  longestStreak: number;
  totalBetMicro: number;
  totalPayoutMicro: number;
};

export async function fetchUserStats(address: string): Promise<UserStats> {
  return backendFetch<UserStats>(`/api/user/${address}/stats`);
}

export async function fetchUserPositions(
  address: string,
  status: "pending" | "settled" | "all" = "all",
  limit = 50,
): Promise<{ positions: PositionHistoryItem[] }> {
  const params = new URLSearchParams({ status, limit: String(limit) });
  return backendFetch(`/api/user/${address}/positions?${params}`);
}

export type SponsorshipQuota = {
  usedCount: number;
  dailyLimit: number;
  remaining: number;
  windowMs: number;
};

export async function fetchSponsorshipQuota(address: string): Promise<SponsorshipQuota> {
  return backendFetch<SponsorshipQuota>(`/api/user/${address}/sponsorship`);
}

export type LeaderboardEntry = {
  sender: string;
  wins: number;
  totalPayoutMicro: number;
  totalBetMicro: number;
};

export type RetentionQuest = {
  id: "streak" | "weekly-volume" | "weekly-variety";
  title: string;
  description: string;
  progress: number;
  target: number;
  completed: boolean;
  rewardLabel: string;
  responsibleNote: string;
};

export type SocialRetentionSummary = {
  bucket: "day" | "week" | "month" | "all";
  leaderboardRank: number | null;
  leaderboardTotal: number;
  topLeaders: LeaderboardEntry[];
  coachingMessage: string;
  responsibleReminder: string;
  pendingClaimCount: number;
  referralCode: string;
  referralShareText: string;
  quests: RetentionQuest[];
};

export type ThemeBlurb = {
  id: string;
  name: string;
  blurb: string;
  emoji: string;
  assets: string[];
  kinds: ("binary" | "range")[];
  buckets: ("quick" | "today" | "week" | "month")[];
  marketIds: string[];
  marketCount: number;
};

export async function fetchActiveThemes(): Promise<ThemeBlurb[]> {
  const body = await backendFetch<{ themes: ThemeBlurb[] }>("/api/themes/active");
  return body.themes ?? [];
}

export async function fetchLeaderboard(
  bucket: "day" | "week" | "month" | "all" = "week",
  limit = 50,
): Promise<{ bucket: string; entries: LeaderboardEntry[] }> {
  const params = new URLSearchParams({ bucket, limit: String(limit) });
  return backendFetch(`/api/leaderboard?${params}`);
}

export async function fetchSocialRetentionSummary(
  address: string,
  bucket: "day" | "week" | "month" | "all" = "week",
): Promise<SocialRetentionSummary> {
  const params = new URLSearchParams({ bucket });
  return backendFetch<SocialRetentionSummary>(`/api/user/${address}/social-retention?${params}`);
}

export async function trackAnalyticsEvent(event: string, properties?: Record<string, unknown>) {
  return backendFetch<{ accepted: boolean }>("/api/analytics/track", {
    method: "POST",
    body: JSON.stringify({ event, properties }),
  });
}

export async function reportError(input: {
  message: string;
  source?: string;
  stack?: string;
  metadata?: Record<string, unknown>;
}) {
  return backendFetch<{ accepted: boolean }>("/api/errors/report", {
    method: "POST",
    body: JSON.stringify(input),
  });
}
