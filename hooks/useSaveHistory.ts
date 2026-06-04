import { useCallback, useEffect, useState } from "react";

import { useAuth } from "@/hooks/useAuth";
import { useRefreshOnFocus } from "@/hooks/useRefreshOnFocus";
import { getSaveHistory, type SaveHistoryItem } from "@/services/blockchain/saveAccount";

export function useSaveHistory() {
  const { session } = useAuth();
  const [items, setItems] = useState<SaveHistoryItem[]>([]);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    if (!session) return;
    try {
      setItems(await getSaveHistory(session.address));
    } catch {
      // keep last known history
    } finally {
      setLoading(false);
    }
  }, [session]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void refresh();
  }, [refresh]);

  useRefreshOnFocus(refresh);

  return { items, loading, refresh };
}
