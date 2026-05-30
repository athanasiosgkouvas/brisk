import { create } from "zustand";

import type {
  PortfolioStats,
  PositionClaimStatus,
  PositionHistoryItem,
  PositionOutcome,
} from "@/types/position";

const CLAIMABLE_STATUSES: readonly PositionClaimStatus[] = [
  "NOT_CLAIMABLE",
  "INDEXING",
  "CLAIMABLE",
  "CLAIMING",
  "CLAIMED",
  "FAILED",
];

const CLAIM_TRANSITIONS: Record<PositionClaimStatus, readonly PositionClaimStatus[]> = {
  NOT_CLAIMABLE: ["INDEXING", "CLAIMABLE"],
  INDEXING: ["CLAIMABLE", "FAILED"],
  CLAIMABLE: ["INDEXING", "CLAIMING"],
  CLAIMING: ["CLAIMED", "FAILED", "CLAIMABLE"],
  CLAIMED: [],
  FAILED: ["INDEXING", "CLAIMABLE", "CLAIMING"],
};

function isClaimStatus(value: unknown): value is PositionClaimStatus {
  return typeof value === "string" && CLAIMABLE_STATUSES.includes(value as PositionClaimStatus);
}

function deriveClaimStatus(
  outcome: PositionOutcome,
  kind: PositionHistoryItem["kind"],
  payoutAmountMicro: number | undefined,
  claimStatus?: PositionClaimStatus,
  claimedAt?: number,
): PositionClaimStatus {
  if (outcome !== "WIN") return "NOT_CLAIMABLE";
  if (claimedAt && claimedAt > 0) return "CLAIMED";
  if (!claimStatus || claimStatus === "NOT_CLAIMABLE") {
    return kind === "range" || (payoutAmountMicro ?? 0) > 0 ? "CLAIMABLE" : "INDEXING";
  }
  if (claimStatus === "INDEXING" && (kind === "range" || (payoutAmountMicro ?? 0) > 0)) {
    return "CLAIMABLE";
  }
  return claimStatus;
}

function normalizeHistoryItem(item: PositionHistoryItem): PositionHistoryItem {
  const parsedStatus = isClaimStatus(item.claimStatus) ? item.claimStatus : undefined;
  const claimStatus = deriveClaimStatus(
    item.outcome,
    item.kind,
    item.payoutAmountMicro,
    parsedStatus,
    item.claimedAt,
  );
  return {
    ...item,
    claimStatus,
    claimDigest: item.claimDigest,
    claimError: claimStatus === "FAILED" ? item.claimError : undefined,
    claimedAt: claimStatus === "CLAIMED" ? item.claimedAt : undefined,
  };
}

function canTransition(from: PositionClaimStatus, to: PositionClaimStatus): boolean {
  return from === to || CLAIM_TRANSITIONS[from].includes(to);
}

function updateClaimState(
  item: PositionHistoryItem,
  nextStatus: PositionClaimStatus,
  payload?: { claimDigest?: string; claimError?: string; claimedAt?: number },
): PositionHistoryItem {
  const current = deriveClaimStatus(
    item.outcome,
    item.kind,
    item.payoutAmountMicro,
    item.claimStatus,
    item.claimedAt,
  );
  if (!canTransition(current, nextStatus)) return item;

  if (nextStatus === "NOT_CLAIMABLE") {
    return {
      ...item,
      claimStatus: nextStatus,
      claimDigest: undefined,
      claimError: undefined,
      claimedAt: undefined,
    };
  }

  if (nextStatus === "CLAIMABLE") {
    return {
      ...item,
      claimStatus: nextStatus,
      claimDigest: payload?.claimDigest ?? item.claimDigest,
      claimError: undefined,
      claimedAt: undefined,
    };
  }

  if (nextStatus === "INDEXING") {
    return {
      ...item,
      claimStatus: nextStatus,
      claimDigest: payload?.claimDigest ?? item.claimDigest,
      claimError: undefined,
      claimedAt: undefined,
    };
  }

  if (nextStatus === "CLAIMING") {
    return {
      ...item,
      claimStatus: nextStatus,
      claimDigest: payload?.claimDigest ?? item.claimDigest,
      claimError: undefined,
    };
  }

  if (nextStatus === "CLAIMED") {
    return {
      ...item,
      claimStatus: nextStatus,
      claimDigest: payload?.claimDigest ?? item.claimDigest,
      claimError: undefined,
      claimedAt: payload?.claimedAt ?? Date.now(),
    };
  }

  return {
    ...item,
    claimStatus: nextStatus,
    claimDigest: payload?.claimDigest ?? item.claimDigest,
    claimError: payload?.claimError ?? "Claim transaction failed",
  };
}

export type RecentWinEvent = {
  id: string;
  asset: string;
  payoutMicro?: number;
  settledAt: number;
};

export type RecentClaimEvent = {
  id: string;
  asset: string;
  payoutMicro?: number;
  claimedAt: number;
};

type PortfolioStore = {
  history: PositionHistoryItem[];
  currentStreak: number;
  recentWin: RecentWinEvent | null;
  recentClaim: RecentClaimEvent | null;
  addPrediction: (item: PositionHistoryItem) => void;
  updatePrediction: (id: string, patch: Partial<PositionHistoryItem>) => void;
  resolvePrediction: (id: string, outcome: "WIN" | "LOSS") => void;
  markClaimable: (id: string, claimDigest?: string) => void;
  markClaimIndexing: (id: string, claimDigest?: string) => void;
  markClaiming: (id: string, claimDigest?: string) => void;
  markClaimed: (id: string, claimDigest?: string, claimedAt?: number) => void;
  markClaimFailed: (id: string, claimError: string, claimDigest?: string) => void;
  resetClaim: (id: string) => void;
  hydrateHistory: (items: PositionHistoryItem[]) => void;
  getStats: () => PortfolioStats;
  clearRecentWin: () => void;
  clearRecentClaim: () => void;
};

export const usePortfolioStore = create<PortfolioStore>((set, get) => ({
  history: [],
  currentStreak: 0,
  recentWin: null,
  recentClaim: null,
  addPrediction: (item) =>
    set((state) => ({ history: [normalizeHistoryItem(item), ...state.history].slice(0, 100) })),
  updatePrediction: (id, patch) =>
    set((state) => ({
      history: state.history.map((item) =>
        item.id === id ? normalizeHistoryItem({ ...item, ...patch }) : item,
      ),
    })),
  resolvePrediction: (id, outcome) =>
    set((state) => {
      const history = state.history.map((item) => {
        if (item.id !== id) return item;
        const next = normalizeHistoryItem({ ...item, outcome });
        if (outcome === "WIN") return updateClaimState(next, "INDEXING");
        return updateClaimState(next, "NOT_CLAIMABLE");
      });
      const latestResolved = history.find((item) => item.id === id);
      const nextStreak =
        latestResolved?.outcome === "WIN"
          ? state.currentStreak + 1
          : latestResolved
            ? 0
            : state.currentStreak;
      const recentWin: RecentWinEvent | null =
        latestResolved?.outcome === "WIN"
          ? {
              id: latestResolved.id,
              asset: latestResolved.asset,
              payoutMicro: latestResolved.payoutAmountMicro,
              settledAt: Date.now(),
            }
          : state.recentWin;
      return { history, currentStreak: nextStreak, recentWin };
    }),
  markClaimable: (id, claimDigest) =>
    set((state) => ({
      history: state.history.map((item) =>
        item.id === id ? updateClaimState(item, "CLAIMABLE", { claimDigest }) : item,
      ),
    })),
  markClaimIndexing: (id, claimDigest) =>
    set((state) => ({
      history: state.history.map((item) =>
        item.id === id ? updateClaimState(item, "INDEXING", { claimDigest }) : item,
      ),
    })),
  markClaiming: (id, claimDigest) =>
    set((state) => ({
      history: state.history.map((item) =>
        item.id === id ? updateClaimState(item, "CLAIMING", { claimDigest }) : item,
      ),
    })),
  markClaimed: (id, claimDigest, claimedAt) =>
    set((state) => {
      const history = state.history.map((item) =>
        item.id === id
          ? updateClaimState(item, "CLAIMED", {
              claimDigest,
              claimedAt,
            })
          : item,
      );
      const claimed = history.find((item) => item.id === id);
      const recentClaim: RecentClaimEvent | null =
        claimed?.claimStatus === "CLAIMED"
          ? {
              id: claimed.id,
              asset: claimed.asset,
              payoutMicro: claimed.payoutAmountMicro,
              claimedAt: claimed.claimedAt ?? Date.now(),
            }
          : state.recentClaim;
      return { history, recentClaim };
    }),
  markClaimFailed: (id, claimError, claimDigest) =>
    set((state) => ({
      history: state.history.map((item) =>
        item.id === id ? updateClaimState(item, "FAILED", { claimError, claimDigest }) : item,
      ),
    })),
  resetClaim: (id) =>
    set((state) => ({
      history: state.history.map((item) =>
        item.id === id ? updateClaimState(item, "CLAIMABLE") : item,
      ),
    })),
  hydrateHistory: (items) => set({ history: items.map((item) => normalizeHistoryItem(item)) }),
  clearRecentWin: () => set({ recentWin: null }),
  clearRecentClaim: () => set({ recentClaim: null }),
  getStats: () => {
    const { history, currentStreak } = get();
    const wins = history.filter((item) => item.outcome === "WIN").length;
    const losses = history.filter((item) => item.outcome === "LOSS").length;
    const pending = history.filter((item) => item.outcome === "PENDING").length;
    const totalPredictions = history.length;
    const resolved = wins + losses;
    const winRate = resolved === 0 ? 0 : (wins / resolved) * 100;
    return { totalPredictions, wins, losses, pending, winRate, currentStreak };
  },
}));
