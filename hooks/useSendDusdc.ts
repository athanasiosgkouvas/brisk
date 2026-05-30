import { useCallback, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";

import { useAuth } from "@/hooks/useAuth";
import { executeSponsoredTransaction, sponsorTransaction } from "@/services/api/backendApi";
import { enokiAuthService } from "@/services/auth/enokiAuth";
import {
  buildSendDusdcTx,
  buildTransactionKindBytes,
} from "@/services/blockchain/predictTransactions";
import { suiClient, getSuiClientForBuild } from "@/services/blockchain/suiClient";
import { ENV } from "@/utils/constants";
import { hapticError, hapticTxSuccess } from "@/utils/haptics";

export function useSendDusdc() {
  const { session } = useAuth();
  const queryClient = useQueryClient();
  const [isSending, setIsSending] = useState(false);
  const [lastError, setLastError] = useState<string | null>(null);

  const send = useCallback(
    async (recipient: string, amount: number): Promise<string> => {
      if (!session) throw new Error("Not authenticated");
      if (amount < 0.1) throw new Error("Minimum send amount is 0.1 dUSDC");
      if (!recipient.startsWith("0x") || recipient.length < 40) {
        throw new Error("Invalid recipient address");
      }

      setIsSending(true);
      setLastError(null);

      try {
        const coins = await suiClient.getCoins({
          owner: session.address,
          coinType: ENV.dusdcType,
          limit: 50,
        });
        const amountMicro = Math.floor(amount * 1_000_000);

        const totalBalance = coins.data.reduce(
          (sum: number, c: { balance: string }) => sum + Number(c.balance),
          0,
        );
        if (totalBalance < amountMicro) {
          throw new Error(
            `Insufficient dUSDC balance (${(totalBalance / 1_000_000).toFixed(2)} dUSDC)`,
          );
        }

        const sortedCoins = [...coins.data].sort(
          (a: { balance: string }, b: { balance: string }) => Number(b.balance) - Number(a.balance),
        );
        const selectedCoinIds: string[] = [];
        let accumulated = 0;
        for (const c of sortedCoins as { balance: string; coinObjectId: string }[]) {
          selectedCoinIds.push(c.coinObjectId);
          accumulated += Number(c.balance);
          if (accumulated >= amountMicro) break;
        }

        const tx = buildSendDusdcTx({
          fromCoinIds: selectedCoinIds,
          amount,
          recipient,
        });
        const txKindBytes = await buildTransactionKindBytes(tx, await getSuiClientForBuild());

        const sponsored = await sponsorTransaction({
          sender: session.address,
          transactionKindBytes: txKindBytes,
          allowedMoveCallTargets: [],
        });
        const signature = await enokiAuthService.signSponsoredTransaction(sponsored.bytes, session);
        const execution = await executeSponsoredTransaction({
          digest: sponsored.digest,
          signature,
        });

        await hapticTxSuccess();
        await Promise.all([
          queryClient.invalidateQueries({ queryKey: ["dusdc-balance", session.address] }),
          queryClient.invalidateQueries({ queryKey: ["manager-dusdc-balance", session.address] }),
        ]);
        return execution.digest;
      } catch (error: unknown) {
        const message = error instanceof Error ? error.message : "Send failed";
        setLastError(message);
        await hapticError();
        throw error;
      } finally {
        setIsSending(false);
      }
    },
    [queryClient, session],
  );

  return { send, isSending, lastError };
}
