import type { MarketDirection, MarketKind } from "./market";

export type PositionOutcome = "WIN" | "LOSS" | "PENDING";
export type PositionClaimStatus =
  | "NOT_CLAIMABLE"
  | "INDEXING"
  | "CLAIMABLE"
  | "CLAIMING"
  | "CLAIMED"
  | "FAILED";

export type PositionHistoryItem = {
  id: string;
  marketId: string;
  oracleId: string;
  asset: string;
  /** "YES" | "NO" for binary, "BOUNDED" for range. */
  direction: MarketDirection;
  /** "binary" or "range" — drives settlement resolution and claim flow. */
  kind: MarketKind;
  outcome: PositionOutcome;
  /** Binary strike, or range midpoint for display. */
  strikePrice: number;
  /** Range markets only. */
  lowerStrike?: number;
  upperStrike?: number;
  expiryTimestamp?: number;
  timestamp: number;
  txDigest?: string;
  managerId?: string;
  /** Winning payout in micro-dUSDC (quantity from the mint event). */
  payoutAmountMicro?: number;
  claimStatus: PositionClaimStatus;
  claimDigest?: string;
  claimError?: string;
  claimedAt?: number;
};

export type PortfolioStats = {
  totalPredictions: number;
  wins: number;
  losses: number;
  pending: number;
  winRate: number;
  currentStreak: number;
};
