import { useCallback, useEffect, useState } from "react";

import { useAuth } from "@/hooks/useAuth";
import { useRefreshOnFocus } from "@/hooks/useRefreshOnFocus";
import { getCashback, redeemCashback } from "@/services/blockchain/loyalty";
import { hapticTxSuccess } from "@/utils/haptics";

export type CashbackStatus = "idle" | "redeeming";

export function useCashback() {
  const { session } = useAuth();
  const [totalMicros, setTotalMicros] = useState(0);
  const [ids, setIds] = useState<string[]>([]);
  const [status, setStatus] = useState<CashbackStatus>("idle");

  const refresh = useCallback(async () => {
    if (!session) return;
    try {
      const { totalMicros: t, ids: i } = await getCashback(session.address);
      setTotalMicros(t);
      setIds(i);
    } catch {
      // keep last known
    }
  }, [session]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void refresh();
  }, [refresh]);

  useRefreshOnFocus(refresh);

  const redeem = useCallback(async () => {
    if (!session || ids.length === 0) return;
    setStatus("redeeming");
    try {
      await redeemCashback(session, ids);
      void hapticTxSuccess();
      await refresh();
    } finally {
      setStatus("idle");
    }
  }, [session, ids, refresh]);

  return { totalMicros, count: ids.length, status, refresh, redeem };
}
