import { useCallback, useEffect, useState } from "react";

import { useAuth } from "@/hooks/useAuth";
import { useRefreshOnFocus } from "@/hooks/useRefreshOnFocus";
import { queryActivity, type ActivityItem } from "@/services/blockchain/receipts";

// Home/dashboard preview count. The full history lives behind "See all"
// (app/activity.tsx), so the feeds stay short.
const PREVIEW_LIMIT = 8;

export function useActivity(limit = PREVIEW_LIMIT) {
  const { session } = useAuth();
  const [items, setItems] = useState<ActivityItem[]>([]);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    if (!session) return;
    try {
      setItems(await queryActivity(session.address, limit));
    } catch {
      // keep last known activity
    } finally {
      setLoading(false);
    }
  }, [session, limit]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void refresh();
  }, [refresh]);

  useRefreshOnFocus(refresh);

  return { items, loading, refresh };
}
