import { useCallback, useMemo, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";

import type { MarketCard } from "@/types/market";
import type { PositionHistoryItem } from "@/types/position";
import { useAuth } from "@/hooks/useAuth";
import { findManagerByOwner, lookupPositionPayout } from "@/services/api/predictApi";
import { executeSponsoredTransaction, sponsorTransaction } from "@/services/api/backendApi";
import { trackEvent } from "@/services/analytics/analyticsService";
import { enokiAuthService } from "@/services/auth/enokiAuth";
import {
  applySlippage,
  getUserDeepCoins,
  getUserSuiCoins,
  quoteSuiToDbusdc,
} from "@/services/blockchain/deepbookClient";
import {
  buildClaimPayoutTx,
  buildClaimRangePayoutTx,
  buildCreateManagerTx,
  buildMintPredictionTx,
  buildMintRangeTx,
  buildSmartBetRangeTx,
  buildSmartBetTx,
  buildTransactionKindBytes,
  safeScaleStrike,
} from "@/services/blockchain/predictTransactions";
import { suiClient, getSuiClientForBuild } from "@/services/blockchain/suiClient";
import { usePortfolioStore } from "@/store/portfolioStore";
import { useSettingsStore } from "@/store/settingsStore";
import { DEEPBOOK, ENV, PREDICT_ALLOWED_TARGETS } from "@/utils/constants";
import { hapticError, hapticSwipeSuccess, hapticTxSuccess } from "@/utils/haptics";

type PredictState = {
  isSubmitting: boolean;
  lastError: string | null;
};

const CLAIM_LOOKUP_MAX_ATTEMPTS = 5;
const CLAIM_LOOKUP_BASE_DELAY_MS = 1_500;
const CLAIM_LOOKUP_MAX_DELAY_MS = 12_000;

type ClaimFailureKind =
  | "indexing"
  | "alreadyClaimed"
  | "alreadyInProgress"
  | "notReady"
  | "generic";

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function nextClaimLookupDelayMs(attempt: number): number {
  return Math.min(CLAIM_LOOKUP_BASE_DELAY_MS * 2 ** attempt, CLAIM_LOOKUP_MAX_DELAY_MS);
}

function classifyClaimFailure(message: string): ClaimFailureKind {
  const normalized = message.toLowerCase();
  if (
    normalized.includes("indexing") ||
    normalized.includes("lookup is temporarily unavailable") ||
    normalized.includes("settlement data")
  ) {
    return "indexing";
  }
  if (normalized.includes("already claimed")) {
    return "alreadyClaimed";
  }
  if (normalized.includes("already in progress")) {
    return "alreadyInProgress";
  }
  if (normalized.includes("not ready") || normalized.includes("not claimable")) {
    return "notReady";
  }
  return "generic";
}

function toClaimErrorMessage(message: string): string {
  const kind = classifyClaimFailure(message);
  if (kind === "indexing" || kind === "notReady") {
    return "Settlement is still indexing. Claim will unlock automatically.";
  }
  if (kind === "alreadyClaimed") {
    return "Winnings already claimed for this position.";
  }
  if (kind === "alreadyInProgress") {
    return "Claim already in progress. Please wait for confirmation.";
  }
  return "Claim failed. Check your connection and retry.";
}

export function usePredict() {
  const { session, managerId, setManagerId } = useAuth();
  const {
    addPrediction,
    updatePrediction,
    markClaimable,
    markClaimIndexing,
    markClaiming,
    markClaimed,
    markClaimFailed,
  } = usePortfolioStore();
  const { betAmount, smartBet, smartBetSuiNotional } = useSettingsStore();
  const queryClient = useQueryClient();
  const inFlightClaimsRef = useRef<Set<string>>(new Set());
  const [state, setState] = useState<PredictState>({ isSubmitting: false, lastError: null });
  // Set when a Smart Bet falls back to a plain mint (e.g. DeepBook can't fill
  // or the user lacks DEEP). Surfaced in the swipe UI so the skip is never
  // silent. Null when Smart Bet is off or the spot leg was included.
  const [smartBetNote, setSmartBetNote] = useState<string | null>(null);

  const fixedBetMicro = useMemo(() => Math.floor(betAmount * 1_000_000), [betAmount]);

  const ensureManager = useCallback(async (): Promise<string> => {
    if (!session) throw new Error("Authentication required");
    if (managerId) return managerId;

    const existing = await findManagerByOwner(session.address);
    if (existing?.managerId) {
      setManagerId(existing.managerId);
      return existing.managerId;
    }

    const createTx = buildCreateManagerTx();
    const kind = await buildTransactionKindBytes(createTx, await getSuiClientForBuild());
    const sponsored = await sponsorTransaction({
      sender: session.address,
      transactionKindBytes: kind,
      allowedMoveCallTargets: [...PREDICT_ALLOWED_TARGETS.createManager],
    });
    const signature = await enokiAuthService.signSponsoredTransaction(sponsored.bytes, session);
    await executeSponsoredTransaction({ digest: sponsored.digest, signature });

    const afterCreate = await findManagerByOwner(session.address);
    if (!afterCreate?.managerId) {
      throw new Error("PredictManager creation succeeded but manager was not indexed yet");
    }
    setManagerId(afterCreate.managerId);
    return afterCreate.managerId;
  }, [managerId, session, setManagerId]);

  const executeSponsored = useCallback(
    async (txKindBytes: string, allowedMoveCallTargets: string[]) => {
      if (!session) throw new Error("Authentication required");
      const sponsored = await sponsorTransaction({
        sender: session.address,
        transactionKindBytes: txKindBytes,
        allowedMoveCallTargets,
      });
      const signature = await enokiAuthService.signSponsoredTransaction(sponsored.bytes, session);
      return executeSponsoredTransaction({
        digest: sponsored.digest,
        signature,
      });
    },
    [session],
  );

  const resolveBinaryPayoutWithBackoff = useCallback(
    async (input: {
      managerId: string;
      oracleId: string;
      expiryTimestamp: number;
      strikePrice: number;
      isYes: boolean;
      maxAttempts?: number;
      firstDelayMs?: number;
    }) => {
      const maxAttempts = input.maxAttempts ?? CLAIM_LOOKUP_MAX_ATTEMPTS;
      let lastBackendError: Error | null = null;
      let sawNotIndexed = false;

      for (let attempt = 0; attempt < maxAttempts; attempt++) {
        const delayMs =
          attempt === 0 ? (input.firstDelayMs ?? 0) : nextClaimLookupDelayMs(attempt - 1);
        if (delayMs > 0) {
          await wait(delayMs);
        }

        try {
          const result = await lookupPositionPayout(
            input.managerId,
            input.oracleId,
            input.expiryTimestamp,
            safeScaleStrike(input.strikePrice),
            input.isYes,
          );
          if (result.status === "indexed") {
            return {
              payoutAmountMicro: result.quantity,
              attempts: attempt + 1,
              notIndexed: false,
              backendError: null as Error | null,
            };
          }
          sawNotIndexed = true;
        } catch (error: unknown) {
          lastBackendError =
            error instanceof Error ? error : new Error("Temporary indexer lookup failure");
        }
      }

      return {
        payoutAmountMicro: null,
        attempts: maxAttempts,
        notIndexed: sawNotIndexed,
        backendError: lastBackendError,
      };
    },
    [],
  );

  const submitPrediction = useCallback(
    async (market: MarketCard, direction: "YES" | "NO" | "BOUNDED") => {
      if (!session) throw new Error("Authentication required");
      if (market.kind === "range" && direction !== "BOUNDED") {
        // Protocol-level: range markets only support buying the bounded side.
        // Swipe-left on a range card is a "skip" — callers should not submit.
        throw new Error("Range markets only support the BOUNDED side; swipe right to mint.");
      }
      if (market.kind === "binary" && direction === "BOUNDED") {
        throw new Error("Binary markets only support YES / NO.");
      }
      setState({ isSubmitting: true, lastError: null });
      setSmartBetNote(null);
      await hapticSwipeSuccess();

      try {
        if (ENV.demoMode) {
          await new Promise((resolve) => setTimeout(resolve, 700));
          const digest = `demo-${market.id}-${Date.now()}`;
          addPrediction({
            id: digest,
            marketId: market.id,
            oracleId: market.oracleId,
            asset: market.asset,
            direction,
            kind: market.kind,
            outcome: "PENDING",
            claimStatus: "NOT_CLAIMABLE",
            strikePrice: market.strikePrice,
            lowerStrike: market.lowerStrike,
            upperStrike: market.upperStrike,
            expiryTimestamp: market.expiryTimestamp,
            timestamp: Date.now(),
            txDigest: digest,
          });
          setState({ isSubmitting: false, lastError: null });
          await trackEvent("prediction_submitted", session.address, {
            direction,
            kind: market.kind,
            marketId: market.id,
            mode: "demo",
          });
          return;
        }

        const currentManagerId = await ensureManager();

        const coins = await suiClient.getCoins({
          owner: session.address,
          coinType: ENV.dusdcType,
          limit: 50,
        });

        const totalBalance = coins.data.reduce(
          (sum: number, c: { balance: string }) => sum + Number(c.balance),
          0,
        );
        if (totalBalance < fixedBetMicro) {
          throw new Error(
            `Insufficient dUSDC balance (${(totalBalance / 1_000_000).toFixed(2)} dUSDC). Request faucet funds first.`,
          );
        }

        // Select the minimum set of coins needed to cover the bet, largest first.
        const sortedCoins = [...coins.data].sort(
          (a: { balance: string }, b: { balance: string }) => Number(b.balance) - Number(a.balance),
        );
        const selectedCoinIds: string[] = [];
        let accumulated = 0;
        for (const coin of sortedCoins as { balance: string; coinObjectId: string }[]) {
          selectedCoinIds.push(coin.coinObjectId);
          accumulated += Number(coin.balance);
          if (accumulated >= fixedBetMicro) break;
        }

        const isRange = market.kind === "range";

        // Smart Bet path: include the DeepBook spot leg in the sponsored PTB
        // ONLY when we can verify it will actually fill — no silent no-ops.
        // The leg runs through Fathom's `router::assert_and_record`, which
        // ASSERTS the orderbook returned >= `minQuoteOutMicro` (a real
        // slippage floor) and reverts the whole PTB otherwise. So before
        // committing to the smart-bet shape we gate on three live checks:
        //
        //   1. enough SUI for the hedge size (+ headroom),
        //   2. a non-zero DeepBook quote for that size (the book can fill),
        //   3. enough DEEP to cover the quote's fee — testnet's SUI/DBUSDC
        //      pool returns 0 with a `coin::zero<DEEP>` fee, so without DEEP
        //      the swap is a no-op and the router would (correctly) abort.
        //
        // Any miss → fall back to a plain mint and surface a visible note via
        // `smartBetNote` so the user knows the spot leg was skipped and why.
        const hedgeSuiMicro = BigInt(
          Math.max(0, Math.floor(smartBetSuiNotional * 10 ** DEEPBOOK.suiDecimals)),
        );
        let canSmartBet = false;
        let suiCoinIds: string[] = [];
        let deepCoinIds: string[] = [];
        let minQuoteOutMicro = 0n;
        let spotLegNote: string | null = null;
        if (smartBet && hedgeSuiMicro > 0n) {
          try {
            const [suiBag, deepBag] = await Promise.all([
              getUserSuiCoins(session.address),
              getUserDeepCoins(session.address),
            ]);
            // Hold back a small headroom for gas-equivalent local moves; the
            // sponsor pays gas but Sui still moves the gas object through the
            // user's coin set during build resolution.
            const headroom = 100_000_000n; // 0.1 SUI
            if (suiBag.coinIds.length === 0 || suiBag.totalMicro < hedgeSuiMicro + headroom) {
              spotLegNote = "Spot leg skipped — not enough SUI for the DeepBook leg.";
            } else {
              const quote = await quoteSuiToDbusdc(hedgeSuiMicro);
              if (!quote || quote.quoteOutMicro <= 0n) {
                spotLegNote = "Spot leg skipped — DeepBook can't fill this size right now.";
              } else if (deepBag.totalMicro < quote.deepFeeMicro) {
                spotLegNote = "Spot leg skipped — needs DEEP to pay the DeepBook fill fee.";
              } else {
                // Real slippage floor: the swap must return at least this or
                // the router aborts (reverting the mint too).
                minQuoteOutMicro = applySlippage(quote);
                suiCoinIds = suiBag.coinIds;
                deepCoinIds = deepBag.coinIds;
                canSmartBet = true;
              }
            }
          } catch {
            canSmartBet = false;
            spotLegNote = "Spot leg skipped — couldn't price the DeepBook leg.";
          }
        }
        setSmartBetNote(spotLegNote);

        const tx =
          canSmartBet && !isRange
            ? buildSmartBetTx({
                managerId: currentManagerId,
                oracleId: market.oracleId,
                expiryTimestamp: market.expiryTimestamp,
                strikePrice: safeScaleStrike(market.strikePrice),
                isYes: direction === "YES",
                ownerDusdcCoinIds: selectedCoinIds,
                fixedBetAmount: betAmount,
                ownerSuiCoinIds: suiCoinIds,
                ownerDeepCoinIds: deepCoinIds,
                hedgeSuiAmountMicro: hedgeSuiMicro,
                minHedgeDbusdcOutMicro: minQuoteOutMicro,
                recipient: session.address,
              })
            : canSmartBet && isRange
              ? buildSmartBetRangeTx({
                  managerId: currentManagerId,
                  oracleId: market.oracleId,
                  expiryTimestamp: market.expiryTimestamp,
                  lowerStrike: safeScaleStrike(market.lowerStrike ?? 0),
                  upperStrike: safeScaleStrike(market.upperStrike ?? 0),
                  ownerDusdcCoinIds: selectedCoinIds,
                  fixedBetAmount: betAmount,
                  ownerSuiCoinIds: suiCoinIds,
                  ownerDeepCoinIds: deepCoinIds,
                  hedgeSuiAmountMicro: hedgeSuiMicro,
                  minHedgeDbusdcOutMicro: minQuoteOutMicro,
                  recipient: session.address,
                })
              : isRange
                ? buildMintRangeTx({
                    managerId: currentManagerId,
                    oracleId: market.oracleId,
                    expiryTimestamp: market.expiryTimestamp,
                    lowerStrike: safeScaleStrike(market.lowerStrike ?? 0),
                    upperStrike: safeScaleStrike(market.upperStrike ?? 0),
                    ownerDusdcCoinIds: selectedCoinIds,
                    fixedBetAmount: betAmount,
                  })
                : buildMintPredictionTx({
                    managerId: currentManagerId,
                    oracleId: market.oracleId,
                    expiryTimestamp: market.expiryTimestamp,
                    strikePrice: safeScaleStrike(market.strikePrice),
                    isYes: direction === "YES",
                    ownerDusdcCoinIds: selectedCoinIds,
                    fixedBetAmount: betAmount,
                  });

        const txKind = await buildTransactionKindBytes(tx, await getSuiClientForBuild());
        const targets = canSmartBet
          ? isRange
            ? PREDICT_ALLOWED_TARGETS.smartBetRange
            : PREDICT_ALLOWED_TARGETS.smartBet
          : isRange
            ? PREDICT_ALLOWED_TARGETS.mintRange
            : PREDICT_ALLOWED_TARGETS.mint;
        const execution = await executeSponsored(txKind, [...targets]);

        const historyItem: PositionHistoryItem = {
          id: execution.digest,
          marketId: market.id,
          oracleId: market.oracleId,
          asset: market.asset,
          direction,
          kind: market.kind,
          outcome: "PENDING",
          claimStatus: "NOT_CLAIMABLE",
          strikePrice: market.strikePrice,
          lowerStrike: market.lowerStrike,
          upperStrike: market.upperStrike,
          expiryTimestamp: market.expiryTimestamp,
          timestamp: Date.now(),
          txDigest: execution.digest,
          managerId: currentManagerId,
        };
        addPrediction(historyItem);

        // Background: try to fetch the quantity (payout face value) from the indexer.
        // We retry a few times to account for indexer lag after the tx. Range
        // payouts are also indexed; we leave the helper binary-only for now and
        // skip the prefetch for range positions until predictApi exposes a
        // range-aware lookup.
        if (!isRange) {
          (async () => {
            const lookup = await resolveBinaryPayoutWithBackoff({
              managerId: currentManagerId,
              oracleId: market.oracleId,
              expiryTimestamp: market.expiryTimestamp!,
              strikePrice: market.strikePrice,
              isYes: direction === "YES",
              maxAttempts: CLAIM_LOOKUP_MAX_ATTEMPTS,
              firstDelayMs: CLAIM_LOOKUP_BASE_DELAY_MS,
            });
            if (lookup.payoutAmountMicro && lookup.payoutAmountMicro > 0) {
              updatePrediction(execution.digest, { payoutAmountMicro: lookup.payoutAmountMicro });
            }
          })();
        }

        await hapticTxSuccess();
        await trackEvent("prediction_submitted", session.address, {
          direction,
          kind: market.kind,
          marketId: market.id,
          digest: execution.digest,
          smartBet: canSmartBet,
          hedgeSuiMicro: canSmartBet ? hedgeSuiMicro.toString() : "0",
        });
        // Refresh both portfolio and on-chain balance — the swipe bar reads
        // dusdc-balance directly, so a stale 10s refetch interval would leave
        // the post-swipe balance frozen. Same goes for SUI when Smart Bet
        // burned some on the spot leg.
        await Promise.all([
          queryClient.invalidateQueries({ queryKey: ["portfolio", session.address] }),
          queryClient.invalidateQueries({
            queryKey: ["dusdc-balance", session.address],
            refetchType: "all",
          }),
          queryClient.invalidateQueries({
            queryKey: ["sui-balance", session.address],
            refetchType: "all",
          }),
          queryClient.invalidateQueries({
            queryKey: ["dbusdc-balance", session.address],
            refetchType: "all",
          }),
        ]);
        setState({ isSubmitting: false, lastError: null });
      } catch (error: unknown) {
        const message = error instanceof Error ? error.message : "Prediction failed";
        await hapticError();
        setState({ isSubmitting: false, lastError: message });
        throw error;
      }
    },
    [
      addPrediction,
      betAmount,
      ensureManager,
      executeSponsored,
      fixedBetMicro,
      queryClient,
      session,
      smartBet,
      smartBetSuiNotional,
      updatePrediction,
      resolveBinaryPayoutWithBackoff,
    ],
  );

  const claimPayoutToWallet = useCallback(
    async (position: PositionHistoryItem) => {
      if (!session) throw new Error("Authentication required");
      const latestPosition =
        usePortfolioStore.getState().history.find((item) => item.id === position.id) ?? position;

      if (latestPosition.outcome !== "WIN") {
        throw new Error("Only winning positions can be claimed");
      }
      if (latestPosition.claimStatus === "CLAIMED") {
        throw new Error("Position payout already claimed");
      }
      if (latestPosition.claimStatus === "CLAIMING") {
        throw new Error("Position payout claim already in progress");
      }
      if (latestPosition.claimStatus === "INDEXING") {
        throw new Error("Settlement is still indexing. Claim will unlock automatically.");
      }
      if (latestPosition.claimStatus !== "CLAIMABLE" && latestPosition.claimStatus !== "FAILED") {
        throw new Error("Position payout is not ready to claim");
      }
      if (!latestPosition.expiryTimestamp) {
        throw new Error("Missing market expiry timestamp for payout claim");
      }
      if (inFlightClaimsRef.current.has(latestPosition.id)) {
        throw new Error("Position payout claim already in progress");
      }

      inFlightClaimsRef.current.add(latestPosition.id);
      setState({ isSubmitting: true, lastError: null });

      try {
        if (ENV.demoMode) {
          markClaiming(latestPosition.id);
          await new Promise((resolve) => setTimeout(resolve, 300));
          const digest = `demo-claim-${latestPosition.id}-${Date.now()}`;
          markClaimed(latestPosition.id, digest, Date.now());
          await Promise.all([
            queryClient.invalidateQueries({
              queryKey: ["dusdc-balance", session.address],
              refetchType: "all",
            }),
            queryClient.invalidateQueries({
              queryKey: ["manager-dusdc-balance", session.address],
              refetchType: "all",
            }),
            queryClient.invalidateQueries({
              queryKey: ["portfolio", session.address],
              refetchType: "all",
            }),
          ]);
          setState({ isSubmitting: false, lastError: null });
          await trackEvent("payout_claimed", session.address, {
            id: latestPosition.id,
            demo: true,
          });
          return { digest };
        }

        const currentManagerId = latestPosition.managerId ?? (await ensureManager());
        const isRange = latestPosition.kind === "range";

        // Resolve the actual payout amount — first use stored value (from chain sync),
        // then fall back to fetching from API for positions placed in this session.
        let payoutAmountMicro = latestPosition.payoutAmountMicro;
        if (!payoutAmountMicro || payoutAmountMicro <= 0) {
          if (isRange) {
            // Range-aware payout lookup is not yet exposed; fall back to bet
            // size and let the protocol resolve the actual quantity at redeem.
            payoutAmountMicro = fixedBetMicro;
          } else {
            markClaimIndexing(latestPosition.id);
            const lookup = await resolveBinaryPayoutWithBackoff({
              managerId: currentManagerId,
              oracleId: latestPosition.oracleId,
              expiryTimestamp: latestPosition.expiryTimestamp!,
              strikePrice: latestPosition.strikePrice,
              isYes: latestPosition.direction === "YES",
            });
            if (!lookup.payoutAmountMicro || lookup.payoutAmountMicro <= 0) {
              if (lookup.backendError) {
                throw new Error("Claim delayed: settlement data is still syncing.");
              }
              throw new Error("Claim delayed: payout is still indexing.");
            }
            payoutAmountMicro = lookup.payoutAmountMicro;
            updatePrediction(latestPosition.id, { payoutAmountMicro });
            markClaimable(latestPosition.id);
          }
        }
        markClaiming(latestPosition.id);

        const tx = isRange
          ? buildClaimRangePayoutTx({
              managerId: currentManagerId,
              oracleId: latestPosition.oracleId,
              expiryTimestamp: latestPosition.expiryTimestamp,
              lowerStrike: safeScaleStrike(latestPosition.lowerStrike ?? 0),
              upperStrike: safeScaleStrike(latestPosition.upperStrike ?? 0),
              payoutAmountMicro,
              recipient: session.address,
            })
          : buildClaimPayoutTx({
              managerId: currentManagerId,
              oracleId: latestPosition.oracleId,
              expiryTimestamp: latestPosition.expiryTimestamp,
              strikePrice: safeScaleStrike(latestPosition.strikePrice),
              isYes: latestPosition.direction === "YES",
              payoutAmountMicro,
              recipient: session.address,
            });
        const txKind = await buildTransactionKindBytes(tx, await getSuiClientForBuild());
        const execution = await executeSponsored(txKind, [
          ...(isRange ? PREDICT_ALLOWED_TARGETS.payoutRange : PREDICT_ALLOWED_TARGETS.payout),
        ]);
        markClaimed(latestPosition.id, execution.digest, Date.now());
        await hapticTxSuccess();
        await trackEvent("payout_claimed", session.address, {
          id: latestPosition.id,
          digest: execution.digest,
        });
        await Promise.all([
          queryClient.invalidateQueries({
            queryKey: ["dusdc-balance", session.address],
            refetchType: "all",
          }),
          queryClient.invalidateQueries({
            queryKey: ["manager-dusdc-balance", session.address],
            refetchType: "all",
          }),
          queryClient.invalidateQueries({
            queryKey: ["portfolio", session.address],
            refetchType: "all",
          }),
          queryClient.invalidateQueries({
            queryKey: ["vault-balances", session.address],
            refetchType: "all",
          }),
        ]);
        setState({ isSubmitting: false, lastError: null });
        return execution;
      } catch (error: unknown) {
        const rawMessage = error instanceof Error ? error.message : "Payout claim failed";
        // Keep raw error in dev logs so unknown Enoki/RPC failures don't
        // collapse silently into the generic "Claim failed" banner.
        console.error("[claim] raw error", rawMessage, error);
        const friendlyMessage = toClaimErrorMessage(rawMessage);
        const failureKind = classifyClaimFailure(rawMessage);

        if (failureKind === "indexing" || failureKind === "notReady") {
          markClaimIndexing(latestPosition.id);
          setState({ isSubmitting: false, lastError: friendlyMessage });
          throw new Error(friendlyMessage);
        }

        if (failureKind === "alreadyClaimed") {
          markClaimed(latestPosition.id, latestPosition.claimDigest, latestPosition.claimedAt);
          setState({ isSubmitting: false, lastError: friendlyMessage });
          throw new Error(friendlyMessage);
        }

        if (failureKind === "alreadyInProgress") {
          markClaiming(latestPosition.id, latestPosition.claimDigest);
          setState({ isSubmitting: false, lastError: friendlyMessage });
          throw new Error(friendlyMessage);
        }

        markClaimFailed(latestPosition.id, friendlyMessage);
        await hapticError();
        setState({ isSubmitting: false, lastError: friendlyMessage });
        throw new Error(friendlyMessage);
      } finally {
        inFlightClaimsRef.current.delete(latestPosition.id);
      }
    },
    [
      ensureManager,
      executeSponsored,
      fixedBetMicro,
      markClaimable,
      markClaimIndexing,
      markClaimed,
      markClaimFailed,
      markClaiming,
      queryClient,
      resolveBinaryPayoutWithBackoff,
      session,
      updatePrediction,
    ],
  );

  return {
    submitPrediction,
    claimPayoutToWallet,
    isSubmitting: state.isSubmitting,
    lastError: state.lastError,
    smartBetNote,
  };
}
