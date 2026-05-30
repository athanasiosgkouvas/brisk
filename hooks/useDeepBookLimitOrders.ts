import { useCallback, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";

import { useAuth } from "@/hooks/useAuth";
import { useAuthStore } from "@/store/authStore";
import { trackEvent } from "@/services/analytics/analyticsService";
import {
  buildCancelLimitOrderTx,
  buildCreateBalanceManagerTx,
  buildDepositAndPlaceLimitOrderTx,
  DEEPBOOK_LIMIT_ORDER_TARGETS,
} from "@/services/blockchain/deepbookLimitOrders";
import { executeSponsored } from "@/services/blockchain/sponsoredExec";
import { suiClient, getSuiClientForBuild } from "@/services/blockchain/suiClient";
import { buildTransactionKindBytes } from "@/services/blockchain/predictTransactions";
import { DEEPBOOK } from "@/utils/constants";
import { hapticError, hapticTxSuccess } from "@/utils/haptics";

type LimitOrderState = { running: boolean; lastError: string | null };

export type PlacedOrder = { orderId: string; digest: string; isBid: boolean };

// The maker lock is `quantity + fee`, so the deposit must exceed the order
// notional. Verified on testnet: a 1 SUI deposit can't rest a 1 SUI ask
// (EBalanceManagerBalanceTooLow); 1.2× clears it. Surplus stays withdrawable
// in the BalanceManager.
const DEPOSIT_HEADROOM = 1.2;
const EXPIRE_TIMESTAMP_MS = 4_102_444_800_000n; // ~year 2100

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Genuine DeepBook maker orders from the Profile panel — create a shared
 * BalanceManager once, then rest / cancel limit orders on the SUI/DBUSDC book.
 * Sponsored end-to-end via Enoki (the user keeps self-custody; backend pays
 * gas). This is real CLOB participation, distinct from the market-taking
 * `useDeepBookSwap`.
 */
export function useDeepBookLimitOrders() {
  const { session } = useAuth();
  const queryClient = useQueryClient();
  const deepbookManagerId = useAuthStore((s) => s.deepbookManagerId);
  const setDeepbookManagerId = useAuthStore((s) => s.setDeepbookManagerId);
  const [state, setState] = useState<LimitOrderState>({ running: false, lastError: null });

  /** Resolve the shared BalanceManager id created by `digest`, with retries. */
  const readBalanceManagerId = useCallback(async (digest: string): Promise<string | null> => {
    for (let attempt = 0; attempt < 6; attempt++) {
      try {
        const tx = await suiClient.getTransactionBlock({
          digest,
          options: { showObjectChanges: true },
        });
        const created = (tx.objectChanges ?? []).find(
          (c) => c.type === "created" && c.objectType?.includes("::balance_manager::BalanceManager"),
        );
        if (created?.objectId) return created.objectId;
      } catch {
        // finality lag — retry
      }
      await wait(1_000 * (attempt + 1));
    }
    return null;
  }, []);

  const ensureBalanceManager = useCallback(async (): Promise<string> => {
    if (!session) throw new Error("Authentication required");
    if (deepbookManagerId) return deepbookManagerId;

    const tx = buildCreateBalanceManagerTx();
    const kind = await buildTransactionKindBytes(tx, await getSuiClientForBuild());
    const execution = await executeSponsored({
      session,
      txKindBytes: kind,
      allowedMoveCallTargets: [...DEEPBOOK_LIMIT_ORDER_TARGETS.createBalanceManager],
    });
    const id = await readBalanceManagerId(execution.digest);
    if (!id) throw new Error("BalanceManager created but its id wasn't indexed yet — retry.");
    setDeepbookManagerId(id);
    return id;
  }, [session, deepbookManagerId, setDeepbookManagerId, readBalanceManagerId]);

  const placeLimitOrder = useCallback(
    async (input: { priceUsd: number; sizeSui: number; isBid: boolean }): Promise<PlacedOrder> => {
      if (!session) throw new Error("Authentication required");
      setState({ running: true, lastError: null });
      try {
        const priceMicro = BigInt(Math.max(1, Math.floor(input.priceUsd * 10 ** DEEPBOOK.quoteDecimals)));
        const quantityBaseMicro = BigInt(
          Math.max(0, Math.floor(input.sizeSui * 10 ** DEEPBOOK.suiDecimals)),
        );
        if (quantityBaseMicro === 0n) throw new Error("Size must be greater than zero");

        const managerId = await ensureBalanceManager();

        // ASK sells SUI → deposit SUI; BID buys SUI → deposit DBUSDC.
        const depositCoinType = input.isBid ? DEEPBOOK.quoteType : DEEPBOOK.suiType;
        const notionalMicro = input.isBid
          ? BigInt(Math.floor(input.sizeSui * input.priceUsd * 10 ** DEEPBOOK.quoteDecimals))
          : quantityBaseMicro;
        const depositAmountMicro = BigInt(
          Math.ceil(Number(notionalMicro) * DEPOSIT_HEADROOM),
        );

        const coins = await suiClient.getCoins({
          owner: session.address,
          coinType: depositCoinType,
          limit: 50,
        });
        const total = coins.data.reduce((acc, c) => acc + BigInt(c.balance), 0n);
        if (total < depositAmountMicro) {
          const sym = input.isBid ? DEEPBOOK.quoteSymbol : "SUI";
          throw new Error(`Insufficient ${sym} to fund the order (need a bit above notional).`);
        }

        const tx = buildDepositAndPlaceLimitOrderTx({
          managerId,
          depositCoinType,
          depositCoinIds: coins.data.map((c) => c.coinObjectId),
          depositAmountMicro,
          clientOrderId: Date.now() % 1_000_000,
          priceMicro,
          quantityBaseMicro,
          isBid: input.isBid,
          expireTimestampMs: EXPIRE_TIMESTAMP_MS,
        });
        const kind = await buildTransactionKindBytes(tx, await getSuiClientForBuild());
        const execution = await executeSponsored({
          session,
          txKindBytes: kind,
          allowedMoveCallTargets: [...DEEPBOOK_LIMIT_ORDER_TARGETS.placeLimitOrder],
        });

        // Best-effort: read the order id from the OrderPlaced event.
        let orderId = "";
        try {
          const txb = await suiClient.getTransactionBlock({
            digest: execution.digest,
            options: { showEvents: true },
          });
          const placed = (txb.events ?? []).find((e) => e.type.includes("OrderPlaced"));
          orderId = ((placed?.parsedJson as { order_id?: string })?.order_id ?? "").toString();
        } catch {
          // non-fatal; cancel can still be done from the indexed/open-orders list later
        }

        await hapticTxSuccess();
        await trackEvent("deepbook_limit_order", session.address, {
          isBid: input.isBid,
          priceUsd: input.priceUsd,
          sizeSui: input.sizeSui,
          digest: execution.digest,
        });
        await queryClient.invalidateQueries({ queryKey: ["sui-balance", session.address] });
        setState({ running: false, lastError: null });
        return { orderId, digest: execution.digest, isBid: input.isBid };
      } catch (error: unknown) {
        const message = error instanceof Error ? error.message : "Place order failed";
        await hapticError();
        setState({ running: false, lastError: message });
        throw error;
      }
    },
    [session, ensureBalanceManager, queryClient],
  );

  const cancelOrder = useCallback(
    async (orderId: string) => {
      if (!session) throw new Error("Authentication required");
      if (!deepbookManagerId) throw new Error("No BalanceManager to cancel against");
      setState({ running: true, lastError: null });
      try {
        const tx = buildCancelLimitOrderTx({ managerId: deepbookManagerId, orderId });
        const kind = await buildTransactionKindBytes(tx, await getSuiClientForBuild());
        const execution = await executeSponsored({
          session,
          txKindBytes: kind,
          allowedMoveCallTargets: [...DEEPBOOK_LIMIT_ORDER_TARGETS.cancelOrder],
        });
        await hapticTxSuccess();
        await trackEvent("deepbook_cancel_order", session.address, {
          orderId,
          digest: execution.digest,
        });
        setState({ running: false, lastError: null });
        return execution;
      } catch (error: unknown) {
        const message = error instanceof Error ? error.message : "Cancel failed";
        await hapticError();
        setState({ running: false, lastError: message });
        throw error;
      }
    },
    [session, deepbookManagerId],
  );

  return {
    ensureBalanceManager,
    placeLimitOrder,
    cancelOrder,
    balanceManagerId: deepbookManagerId,
    running: state.running,
    lastError: state.lastError,
  };
}
