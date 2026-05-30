import { useEffect, useRef, useState } from "react";

import { loadPositionHistory, savePositionHistory } from "@/services/storage/sessionStorage";
import { fetchUserPositions } from "@/services/api/backendApi";
import { usePortfolioStore } from "@/store/portfolioStore";
import { useAuthStore } from "@/store/authStore";
import type { PositionClaimStatus, PositionHistoryItem, PositionOutcome } from "@/types/position";
import type { MarketKind } from "@/types/market";

type BackendPosition = {
  digest: string;
  sender: string;
  managerId: string | null;
  oracleId: string;
  expiry: number;
  kind: string;
  strike: number | null;
  isUp: number | null;
  lowerStrike: number | null;
  upperStrike: number | null;
  direction: string | null;
  quantity: number;
  betSize: number;
  asset: string | null;
  timestampMs: number;
  redeemedDigest: string | null;
  redeemedAmount: number | null;
  settledOutcome: string | null;
  settlementPrice: number | null;
};

function scaleHuman(value: number | null | undefined): number {
  return typeof value === "number" && value > 0 ? value / 1_000_000_000 : 0;
}

function mapBackendPosition(p: BackendPosition): PositionHistoryItem {
  const outcome: PositionOutcome =
    p.settledOutcome === "WIN" ? "WIN" : p.settledOutcome === "LOSS" ? "LOSS" : "PENDING";
  const claimStatus: PositionClaimStatus =
    p.redeemedDigest != null
      ? "CLAIMED"
      : outcome === "WIN"
        ? p.kind === "range" || p.quantity > 0
          ? "CLAIMABLE"
          : "INDEXING"
        : "NOT_CLAIMABLE";
  return {
    id: p.digest,
    marketId: `${p.oracleId}-${p.expiry}-${p.kind === "range" ? `r${p.lowerStrike ?? 0}` : `s${p.strike ?? 0}`}`,
    oracleId: p.oracleId,
    asset: p.asset ?? "ASSET",
    direction: (p.direction as PositionHistoryItem["direction"]) ?? "YES",
    kind: (p.kind as MarketKind) ?? "binary",
    outcome,
    claimStatus,
    strikePrice:
      scaleHuman(p.strike) || scaleHuman((p.lowerStrike ?? 0) + (p.upperStrike ?? 0)) / 2,
    lowerStrike: p.lowerStrike != null ? scaleHuman(p.lowerStrike) : undefined,
    upperStrike: p.upperStrike != null ? scaleHuman(p.upperStrike) : undefined,
    expiryTimestamp: p.expiry || undefined,
    timestamp: p.timestampMs,
    txDigest: p.digest,
    managerId: p.managerId ?? undefined,
    payoutAmountMicro: p.quantity > 0 ? p.quantity : undefined,
    claimDigest: p.redeemedDigest ?? undefined,
    claimedAt: p.redeemedDigest != null ? p.timestampMs : undefined,
  };
}

export function usePortfolioPersistence() {
  const { history, hydrateHistory } = usePortfolioStore();
  const session = useAuthStore((state) => state.session);
  const [hydrated, setHydrated] = useState(false);
  const lastSyncedAddressRef = useRef<string | null>(null);

  useEffect(() => {
    let mounted = true;
    void loadPositionHistory().then((raw) => {
      if (!mounted) return;
      if (!raw) {
        hydrateHistory([]);
        setHydrated(true);
        return;
      }
      try {
        const parsed = JSON.parse(raw) as PositionHistoryItem[];
        hydrateHistory(Array.isArray(parsed) ? parsed : []);
      } catch {
        hydrateHistory([]);
      } finally {
        setHydrated(true);
      }
    });
    return () => {
      mounted = false;
    };
  }, [hydrateHistory]);

  // When session becomes available and local history is empty, rehydrate from
  // the indexer. The indexer is keyed by sender, so we don't need to find a
  // manager first.
  useEffect(() => {
    if (!hydrated || !session?.address) return;
    if (lastSyncedAddressRef.current === session.address) return;
    lastSyncedAddressRef.current = session.address;

    const currentHistory = usePortfolioStore.getState().history;
    if (currentHistory.length > 0) return;

    let mounted = true;
    void (async () => {
      try {
        const { positions } = await fetchUserPositions(session.address);
        if (!mounted || positions.length === 0) return;
        const items = (positions as unknown as BackendPosition[]).map(mapBackendPosition);
        hydrateHistory(items);
      } catch {
        // ignore — user starts with empty history until the indexer warms up
      }
    })();
    return () => {
      mounted = false;
    };
  }, [hydrated, session?.address, hydrateHistory]);

  useEffect(() => {
    if (!hydrated) return;
    void savePositionHistory(JSON.stringify(history));
  }, [history, hydrated]);
}
