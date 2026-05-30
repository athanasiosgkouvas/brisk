import { useCallback, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";

import { useAuth } from "@/hooks/useAuth";
import {
  fetchEarnApySummary,
  getMockEarnApySummary,
  type EarnApySummary,
} from "@/services/api/backendApi";
import { fetchPlpBalance, getMockPlpBalance } from "@/services/api/plpBalanceApi";
import {
  fetchAvailableWithdrawalMicro,
  fetchPredictVaultState,
  getMockPredictVaultState,
} from "@/services/api/predictVaultApi";
import { getCachedVaultState, setCachedVaultState } from "@/services/storage/earnVaultCache";
import { buildEarnDepositTx, buildEarnWithdrawTx } from "@/services/blockchain/earnTransactions";
import { buildTransactionKindBytes } from "@/services/blockchain/predictTransactions";
import { executeSponsored } from "@/services/blockchain/sponsoredExec";
import { getSuiClientForBuild, suiClient } from "@/services/blockchain/suiClient";
import { useEarnHistoryStore, costBasisFromHistory } from "@/store/earnHistoryStore";
import { ENV, PREDICT_ALLOWED_TARGETS } from "@/utils/constants";

// Mock starting dUSDC balance for demo mode (5,000 dUSDC). Net deposits
// are subtracted to keep the wallet figure consistent with the user's
// session.
const DEMO_DUSDC_STARTING_MICRO = 5_000_000_000;

type ActionState = {
  isSubmitting: boolean;
  lastError: string | null;
};

const QUOTE_DECIMALS = 1_000_000;
const PLP_DECIMALS = 1_000_000;

export function useEarn() {
  const { session } = useAuth();
  const queryClient = useQueryClient();
  const { entries, addEntry } = useEarnHistoryStore();
  const [state, setState] = useState<ActionState>({ isSubmitting: false, lastError: null });

  const vaultStateQuery = useQuery({
    queryKey: ["predict-vault-state"],
    queryFn: async () => {
      const next = ENV.demoMode ? getMockPredictVaultState() : await fetchPredictVaultState();
      setCachedVaultState(next);
      return next;
    },
    initialData: () => getCachedVaultState() ?? undefined,
    refetchInterval: 15_000,
    staleTime: 30_000,
  });

  const plpBalanceQuery = useQuery({
    queryKey: ["plp-balance", session?.address],
    enabled: Boolean(session?.address),
    queryFn: () => {
      if (!session) throw new Error("Authentication required");
      if (ENV.demoMode) {
        const { plpHeldMicro } = costBasisFromHistory(useEarnHistoryStore.getState().entries);
        return Promise.resolve(getMockPlpBalance(plpHeldMicro));
      }
      return fetchPlpBalance(session.address);
    },
    refetchInterval: 10_000,
    staleTime: 15_000,
  });

  const dusdcBalanceQuery = useQuery({
    queryKey: ["dusdc-balance", session?.address],
    enabled: Boolean(session?.address),
    queryFn: async () => {
      if (!session) return 0;
      if (ENV.demoMode) {
        const { costBasisMicro } = costBasisFromHistory(useEarnHistoryStore.getState().entries);
        return Math.max(DEMO_DUSDC_STARTING_MICRO - costBasisMicro, 0);
      }
      const result = await suiClient.getBalance({
        owner: session.address,
        coinType: ENV.dusdcType,
      });
      return Number(result.totalBalance ?? "0");
    },
    refetchInterval: 10_000,
    staleTime: 15_000,
  });

  const apyQuery = useQuery<EarnApySummary>({
    queryKey: ["earn-apy"],
    queryFn: () =>
      ENV.demoMode ? Promise.resolve(getMockEarnApySummary()) : fetchEarnApySummary(),
    refetchInterval: 60_000,
    staleTime: 60_000,
    retry: 1,
  });

  // Pre-flight read of Predict's on-chain withdrawal rate-limiter — used by
  // the Earn tab to surface "Available now: X dUSDC" before a withdraw. In
  // demo mode we report unlimited (Number.MAX_SAFE_INTEGER) so the UI flag
  // stays out of the way; in live mode we devInspect the real cap.
  const availableWithdrawalQuery = useQuery<number | null>({
    queryKey: ["predict-available-withdrawal"],
    queryFn: () =>
      ENV.demoMode ? Promise.resolve(Number.MAX_SAFE_INTEGER) : fetchAvailableWithdrawalMicro(),
    refetchInterval: 30_000,
    staleTime: 30_000,
  });

  const costBasis = useMemo(() => costBasisFromHistory(entries), [entries]);

  const refreshAll = useCallback(async () => {
    await Promise.all([
      vaultStateQuery.refetch(),
      plpBalanceQuery.refetch(),
      dusdcBalanceQuery.refetch(),
      apyQuery.refetch(),
    ]);
  }, [vaultStateQuery, plpBalanceQuery, dusdcBalanceQuery, apyQuery]);

  const deposit = useCallback(
    async (amountDusdc: number) => {
      if (!session) throw new Error("Authentication required");
      if (!Number.isFinite(amountDusdc) || amountDusdc <= 0) {
        throw new Error("Enter a positive dUSDC amount");
      }
      setState({ isSubmitting: true, lastError: null });
      try {
        const amountMicro = Math.floor(amountDusdc * QUOTE_DECIMALS);

        if (ENV.demoMode) {
          await new Promise((resolve) => setTimeout(resolve, 700));
          const sharePriceBeforeDemo = vaultStateQuery.data?.sharePriceMicro ?? QUOTE_DECIMALS;
          const plpEstimate =
            sharePriceBeforeDemo > 0
              ? Math.floor((amountMicro * QUOTE_DECIMALS) / sharePriceBeforeDemo)
              : amountMicro;
          const digest = `demo-deposit-${Date.now()}`;
          addEntry({
            timestamp: Date.now(),
            kind: "deposit",
            dusdcMicro: amountMicro,
            plpMicro: plpEstimate,
            digest,
          });
          await refreshAll();
          setState({ isSubmitting: false, lastError: null });
          return { digest };
        }

        const coins = await suiClient.getCoins({
          owner: session.address,
          coinType: ENV.dusdcType,
          limit: 50,
        });
        const total = coins.data.reduce((sum, c) => sum + Number(c.balance), 0);
        if (total < amountMicro) {
          throw new Error(
            `Not enough dUSDC (have ${(total / QUOTE_DECIMALS).toFixed(2)}). Request faucet funds first.`,
          );
        }
        const sortedCoinIds = [...coins.data]
          .sort((a, b) => Number(b.balance) - Number(a.balance))
          .map((c) => c.coinObjectId);
        // Use the minimum prefix that covers the bet; the PTB merges these
        // into the primary coin before splitting the exact amount.
        const selected: string[] = [];
        let acc = 0;
        for (const coin of coins.data.sort((a, b) => Number(b.balance) - Number(a.balance))) {
          selected.push(coin.coinObjectId);
          acc += Number(coin.balance);
          if (acc >= amountMicro) break;
        }
        if (selected.length === 0) selected.push(...sortedCoinIds);

        const sharePriceBefore = vaultStateQuery.data?.sharePriceMicro ?? QUOTE_DECIMALS;
        const tx = buildEarnDepositTx({
          ownerDusdcCoinIds: selected,
          depositAmount: amountDusdc,
          recipient: session.address,
        });
        const txKind = await buildTransactionKindBytes(tx, await getSuiClientForBuild());
        const execution = await executeSponsored({
          session,
          txKindBytes: txKind,
          allowedMoveCallTargets: [...PREDICT_ALLOWED_TARGETS.earnDeposit],
        });

        // Estimate the PLP we received using the share price *before* the
        // tx — actual minted amount is logged on-chain. This is a UI
        // estimate; the next refresh queries the real on-chain PLP balance.
        const plpEstimate =
          sharePriceBefore > 0
            ? Math.floor((amountMicro * QUOTE_DECIMALS) / sharePriceBefore)
            : amountMicro;
        addEntry({
          timestamp: Date.now(),
          kind: "deposit",
          dusdcMicro: amountMicro,
          plpMicro: plpEstimate,
          digest: execution.digest,
        });

        await refreshAll();
        await queryClient.invalidateQueries({ queryKey: ["dusdc-balance", session.address] });
        setState({ isSubmitting: false, lastError: null });
        return execution;
      } catch (error: unknown) {
        const message = error instanceof Error ? error.message : "Deposit failed";
        setState({ isSubmitting: false, lastError: message });
        throw error;
      }
    },
    [session, vaultStateQuery.data, queryClient, refreshAll, addEntry],
  );

  const withdraw = useCallback(
    async (plpAmountMicro: number) => {
      if (!session) throw new Error("Authentication required");
      if (!Number.isFinite(plpAmountMicro) || plpAmountMicro <= 0) {
        throw new Error("Enter a positive PLP amount");
      }
      const plpBalance = plpBalanceQuery.data;
      if (!plpBalance || plpBalance.totalMicro < plpAmountMicro) {
        throw new Error(
          `Not enough PLP (have ${((plpBalance?.totalMicro ?? 0) / PLP_DECIMALS || 0).toFixed(4)} PLP).`,
        );
      }
      setState({ isSubmitting: true, lastError: null });
      try {
        const sharePriceBefore = vaultStateQuery.data?.sharePriceMicro ?? QUOTE_DECIMALS;

        if (ENV.demoMode) {
          await new Promise((resolve) => setTimeout(resolve, 700));
          const dusdcEstimateDemo = Math.floor(
            (plpAmountMicro * sharePriceBefore) / QUOTE_DECIMALS,
          );
          const digest = `demo-withdraw-${Date.now()}`;
          addEntry({
            timestamp: Date.now(),
            kind: "withdraw",
            dusdcMicro: dusdcEstimateDemo,
            plpMicro: plpAmountMicro,
            digest,
          });
          await refreshAll();
          setState({ isSubmitting: false, lastError: null });
          return { digest };
        }

        const tx = buildEarnWithdrawTx({
          ownerPlpCoinIds: plpBalance.coins.map((c) => c.coinObjectId),
          plpAmountMicro,
          recipient: session.address,
        });
        const txKind = await buildTransactionKindBytes(tx, await getSuiClientForBuild());
        const execution = await executeSponsored({
          session,
          txKindBytes: txKind,
          allowedMoveCallTargets: [...PREDICT_ALLOWED_TARGETS.earnWithdraw],
        });

        const dusdcEstimate = Math.floor((plpAmountMicro * sharePriceBefore) / QUOTE_DECIMALS);
        addEntry({
          timestamp: Date.now(),
          kind: "withdraw",
          dusdcMicro: dusdcEstimate,
          plpMicro: plpAmountMicro,
          digest: execution.digest,
        });

        await refreshAll();
        await queryClient.invalidateQueries({ queryKey: ["dusdc-balance", session.address] });
        setState({ isSubmitting: false, lastError: null });
        return execution;
      } catch (error: unknown) {
        const message = error instanceof Error ? error.message : "Withdraw failed";
        setState({ isSubmitting: false, lastError: message });
        throw error;
      }
    },
    [session, plpBalanceQuery.data, vaultStateQuery.data, queryClient, refreshAll, addEntry],
  );

  return {
    vaultState: vaultStateQuery.data,
    vaultStateLoading: vaultStateQuery.isLoading,
    apy: apyQuery.data,
    apyLoading: apyQuery.isLoading,
    plpBalance: plpBalanceQuery.data,
    plpBalanceLoading: plpBalanceQuery.isLoading,
    dusdcBalance: dusdcBalanceQuery.data ?? 0,
    dusdcBalanceLoading: dusdcBalanceQuery.isLoading,
    costBasisMicro: costBasis.costBasisMicro,
    availableWithdrawalMicro: availableWithdrawalQuery.data ?? null,
    deposit,
    withdraw,
    isSubmitting: state.isSubmitting,
    lastError: state.lastError,
    refresh: refreshAll,
  };
}
