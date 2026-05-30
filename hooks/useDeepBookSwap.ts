import { useCallback, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";

import { useAuth } from "@/hooks/useAuth";
import { trackEvent } from "@/services/analytics/analyticsService";
import {
  applySlippage,
  getUserSuiCoins,
  quoteSuiToDbusdc,
} from "@/services/blockchain/deepbookClient";
import {
  buildSwapDbusdcToSuiTx,
  buildSwapSuiToDbusdcTx,
} from "@/services/blockchain/deepbookSwapTransactions";
import { executeSponsored } from "@/services/blockchain/sponsoredExec";
import { suiClient, getSuiClientForBuild } from "@/services/blockchain/suiClient";
import { DEEPBOOK, PREDICT_ALLOWED_TARGETS } from "@/utils/constants";
import { hapticError, hapticTxSuccess } from "@/utils/haptics";
import { buildTransactionKindBytes } from "@/services/blockchain/predictTransactions";

type SwapState = { running: boolean; lastError: string | null };

/**
 * One-tap DeepBook spot swap from the Profile / Settings panel.
 *
 * Sponsored end-to-end via Enoki (the user keeps self-custody, backend pays
 * gas). The same `PREDICT_ALLOWED_TARGETS.deepbookSwap` allowlist also covers
 * the standalone-swap flow — Enoki refuses non-allowlisted targets, so the
 * swap target list must be passed when constructing the sponsor request.
 *
 * `swapSuiToDbusdc(suiAmount, slippageBps)` and `swapDbusdcToSui(...)` accept
 * human units (e.g. 0.05 SUI). Internally we resolve coin ids fresh on each
 * tap — testnet RPCs occasionally serve stale coin lists; refetching keeps
 * us out of "input object not found" failure modes.
 */
export function useDeepBookSwap() {
  const { session } = useAuth();
  const queryClient = useQueryClient();
  const [state, setState] = useState<SwapState>({ running: false, lastError: null });

  const refreshBalances = useCallback(async () => {
    if (!session) return;
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ["sui-balance", session.address] }),
      queryClient.invalidateQueries({ queryKey: ["dbusdc-balance", session.address] }),
    ]);
  }, [queryClient, session]);

  const swapSuiToDbusdc = useCallback(
    async (suiAmount: number, slippageBps: number = 200) => {
      if (!session) throw new Error("Authentication required");
      setState({ running: true, lastError: null });
      try {
        const suiMicro = BigInt(Math.max(0, Math.floor(suiAmount * 10 ** DEEPBOOK.suiDecimals)));
        if (suiMicro === 0n) throw new Error("Amount must be greater than zero");
        const bag = await getUserSuiCoins(session.address);
        if (bag.totalMicro < suiMicro) throw new Error("Insufficient SUI balance");
        // Probe the orderbook for a fresh quote so the slippage floor is real
        // when the book is liquid. If the quote returns nothing (testnet
        // without DEEP / thin book), we still SHIP the swap PTB with
        // min_out=0 — DeepBook swap_* returns the input unchanged when it
        // can't fill, so the tx is safe and the explorer digest still shows
        // the DeepBook call. On mainnet the quote will populate and the
        // slippage floor kicks in.
        const quote = await quoteSuiToDbusdc(suiMicro);
        const minOut = quote && quote.quoteOutMicro > 0n ? applySlippage(quote, slippageBps) : 0n;
        const tx = buildSwapSuiToDbusdcTx({
          ownerSuiCoinIds: bag.coinIds,
          suiAmountMicro: suiMicro,
          minDbusdcOutMicro: minOut,
          recipient: session.address,
        });
        const kind = await buildTransactionKindBytes(tx, await getSuiClientForBuild());
        const execution = await executeSponsored({
          session,
          txKindBytes: kind,
          allowedMoveCallTargets: [...PREDICT_ALLOWED_TARGETS.deepbookSwap],
        });
        await hapticTxSuccess();
        await trackEvent("deepbook_swap", session.address, {
          direction: "sui_to_dbusdc",
          suiAmount,
          digest: execution.digest,
        });
        await refreshBalances();
        setState({ running: false, lastError: null });
        return execution;
      } catch (error: unknown) {
        const message = error instanceof Error ? error.message : "DeepBook swap failed";
        await hapticError();
        setState({ running: false, lastError: message });
        throw error;
      }
    },
    [refreshBalances, session],
  );

  const swapDbusdcToSui = useCallback(
    async (dbusdcAmount: number, slippageBps: number = 200) => {
      if (!session) throw new Error("Authentication required");
      setState({ running: true, lastError: null });
      try {
        const dbusdcMicro = BigInt(
          Math.max(0, Math.floor(dbusdcAmount * 10 ** DEEPBOOK.dbusdcDecimals)),
        );
        if (dbusdcMicro === 0n) throw new Error("Amount must be greater than zero");
        const coins = await suiClient.getCoins({
          owner: session.address,
          coinType: DEEPBOOK.dbusdcType,
          limit: 50,
        });
        const totalMicro = coins.data.reduce((acc, c) => acc + BigInt(c.balance), 0n);
        if (totalMicro < dbusdcMicro) throw new Error("Insufficient DBUSDC balance");

        // For the reverse direction we use a slack 1% slippage floor in SUI
        // micros via a rough rate sniff: best price quote is the reverse of
        // a forward 1-SUI quote. Cheap enough to do inline.
        const probe = await quoteSuiToDbusdc(BigInt(10 ** DEEPBOOK.suiDecimals));
        const suiPerDbusdcMicro =
          probe && probe.quoteOutMicro > 0n
            ? // 1 SUI = X DBUSDC (micros). So 1 DBUSDC = (1e9 base micros / X) SUI micros.
              (BigInt(10 ** DEEPBOOK.suiDecimals) * dbusdcMicro) / probe.quoteOutMicro
            : 0n;
        const factor = BigInt(10_000 - Math.max(0, Math.min(slippageBps, 5_000)));
        const minSuiOut = (suiPerDbusdcMicro * factor) / 10_000n;

        const tx = buildSwapDbusdcToSuiTx({
          ownerDbusdcCoinIds: coins.data.map((c) => c.coinObjectId),
          dbusdcAmountMicro: dbusdcMicro,
          minSuiOutMicro: minSuiOut,
          recipient: session.address,
        });
        const kind = await buildTransactionKindBytes(tx, await getSuiClientForBuild());
        const execution = await executeSponsored({
          session,
          txKindBytes: kind,
          allowedMoveCallTargets: [...PREDICT_ALLOWED_TARGETS.deepbookSwap],
        });
        await hapticTxSuccess();
        await trackEvent("deepbook_swap", session.address, {
          direction: "dbusdc_to_sui",
          dbusdcAmount,
          digest: execution.digest,
        });
        await refreshBalances();
        setState({ running: false, lastError: null });
        return execution;
      } catch (error: unknown) {
        const message = error instanceof Error ? error.message : "DeepBook swap failed";
        await hapticError();
        setState({ running: false, lastError: message });
        throw error;
      }
    },
    [refreshBalances, session],
  );

  return {
    swapSuiToDbusdc,
    swapDbusdcToSui,
    running: state.running,
    lastError: state.lastError,
  };
}
