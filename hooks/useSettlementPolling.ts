import { useEffect, useRef } from "react";
import { AppState } from "react-native";

import { useAuth } from "@/hooks/useAuth";
import { trackEvent } from "@/services/analytics/analyticsService";
import { fetchOracleState, lookupPositionPayout } from "@/services/api/predictApi";
import { safeScaleStrike } from "@/services/blockchain/predictTransactions";
import { usePortfolioStore } from "@/store/portfolioStore";
import { ENV, REFRESH_INTERVALS } from "@/utils/constants";
import { hapticSettleLoss, hapticSettleWin } from "@/utils/haptics";

const CLAIM_INDEX_LOOKUP_MAX_DELAY_MS = 60_000;

function nextLookupDelayMs(attempt: number): number {
  return Math.min(5_000 * 2 ** attempt, CLAIM_INDEX_LOOKUP_MAX_DELAY_MS);
}

function shouldRetryClaimLookup(item: { claimStatus: string; claimError?: string }): boolean {
  if (item.claimStatus === "INDEXING") return true;
  if (item.claimStatus !== "FAILED") return false;
  const reason = item.claimError?.toLowerCase() ?? "";
  return reason.includes("indexing") || reason.includes("sync");
}

/**
 * Polls oracle state for any pending positions and resolves them locally.
 * The indexer derives long-term stats from on-chain SettleEvents, so this
 * hook no longer pushes outcome events to the backend — it only updates
 * the optimistic in-memory portfolio view.
 */
export function useSettlementPolling(enabled: boolean) {
  const { resolvePrediction, updatePrediction, markClaimable, markClaimIndexing } =
    usePortfolioStore();
  const { session } = useAuth();
  const lookupAttemptsRef = useRef<Record<string, number>>({});
  const nextLookupAtRef = useRef<Record<string, number>>({});
  const inFlightLookupsRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    if (!enabled) return;

    const runTick = () => {
      const history = usePortfolioStore.getState().history;
      const pending = history.filter((item) => item.outcome === "PENDING");
      pending.forEach(async (item) => {
        try {
          if (ENV.demoMode) {
            if (Date.now() - item.timestamp < REFRESH_INTERVALS.settlementMs) return;
            const deterministic =
              (item.id.charCodeAt(item.id.length - 1) + item.asset.length) % 2 === 0;
            resolvePrediction(item.id, deterministic ? "WIN" : "LOSS");
            if (session?.address) {
              await trackEvent("prediction_settled", session.address, {
                predictionId: item.id,
                outcome: deterministic ? "WIN" : "LOSS",
                mode: "demo",
              });
            }
            if (deterministic) await hapticSettleWin();
            else await hapticSettleLoss();
            return;
          }

          const state = await fetchOracleState(item.oracleId);
          if (state.status !== "SETTLED" || !state.settlementPrice) return;

          // Binary: WIN if (is_up) === (price > strike).
          // Range: WIN if BOUNDED and price ∈ [lowerStrike, upperStrike]. Range
          // markets only ever sit on the BOUNDED side in Phase B — the vault
          // is the implicit OUTSIDE counterparty (see docs/range-markets.md).
          let won: boolean;
          if (item.kind === "range" && item.lowerStrike != null && item.upperStrike != null) {
            const inRange =
              state.settlementPrice >= item.lowerStrike &&
              state.settlementPrice <= item.upperStrike;
            won = item.direction === "BOUNDED" ? inRange : !inRange;
          } else {
            const upWon = state.settlementPrice > item.strikePrice;
            won = item.direction === "YES" ? upWon : !upWon;
          }
          resolvePrediction(item.id, won ? "WIN" : "LOSS");
          if (won && item.kind === "binary") {
            markClaimIndexing(item.id);
          }
          if (session?.address) {
            await trackEvent("prediction_settled", session.address, {
              predictionId: item.id,
              kind: item.kind,
              outcome: won ? "WIN" : "LOSS",
            });
          }
          if (won) await hapticSettleWin();
          else await hapticSettleLoss();
        } catch {
          // keep polling on transient failures
        }
      });

      const latestHistory = usePortfolioStore.getState().history;
      latestHistory
        .filter(
          (item) =>
            item.outcome === "WIN" &&
            shouldRetryClaimLookup(item) &&
            item.kind === "binary" &&
            !!item.managerId &&
            !!item.expiryTimestamp,
        )
        .forEach(async (item) => {
          if (inFlightLookupsRef.current.has(item.id)) return;
          const nextLookupAt = nextLookupAtRef.current[item.id] ?? 0;
          const now = Date.now();
          if (now < nextLookupAt) return;

          inFlightLookupsRef.current.add(item.id);
          try {
            const result = await lookupPositionPayout(
              item.managerId!,
              item.oracleId,
              item.expiryTimestamp!,
              safeScaleStrike(item.strikePrice),
              item.direction === "YES",
            );
            if (result.status === "indexed" && result.quantity > 0) {
              updatePrediction(item.id, { payoutAmountMicro: result.quantity });
              markClaimable(item.id);
              delete lookupAttemptsRef.current[item.id];
              delete nextLookupAtRef.current[item.id];
              return;
            }
          } catch {
            // transient backend/indexer failure; schedule retry with backoff
          } finally {
            inFlightLookupsRef.current.delete(item.id);
          }

          const nextAttempt = (lookupAttemptsRef.current[item.id] ?? 0) + 1;
          lookupAttemptsRef.current[item.id] = nextAttempt;
          nextLookupAtRef.current[item.id] = Date.now() + nextLookupDelayMs(nextAttempt - 1);
        });
    };

    const timer = setInterval(runTick, REFRESH_INTERVALS.settlementMs);

    // Foregrounding the app must immediately reconcile any settlement that
    // resolved while JS timers were throttled in the background — otherwise
    // PENDING positions stay stale for up to one tick after resume.
    const sub = AppState.addEventListener("change", (state) => {
      if (state === "active") runTick();
    });

    return () => {
      clearInterval(timer);
      sub.remove();
    };
  }, [
    enabled,
    markClaimable,
    markClaimIndexing,
    resolvePrediction,
    session?.address,
    updatePrediction,
  ]);
}
