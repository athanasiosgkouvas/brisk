import { useCallback, useEffect, useState } from "react";

import { useAuth } from "@/hooks/useAuth";
import { useRefreshOnFocus } from "@/hooks/useRefreshOnFocus";
import { queryActivity, type ActivityItem } from "@/services/blockchain/receipts";

export function useActivity() {
  const { session } = useAuth();
  const [items, setItems] = useState<ActivityItem[]>([]);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    if (!session) return;
    try {
      setItems(await queryActivity(session.address));
    } catch {
      // keep last known activity
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
