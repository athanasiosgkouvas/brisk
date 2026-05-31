import { useCallback, useEffect, useState } from "react";

import { useAuth } from "@/hooks/useAuth";
import { getSpendableUsdcMicros } from "@/services/blockchain/wallet";

export function useWallet() {
  const { session } = useAuth();
  const [usdcMicros, setUsdcMicros] = useState(0);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    if (!session) return;
    try {
      setUsdcMicros(await getSpendableUsdcMicros(session.address));
    } catch {
      // keep last known balance
    } finally {
      setLoading(false);
    }
  }, [session]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void refresh();
  }, [refresh]);

  return { usdcMicros, address: session?.address ?? "", loading, refresh };
}
