import { useEffect, useRef } from "react";

import { loadEarnHistory, saveEarnHistory } from "@/services/storage/sessionStorage";
import { useEarnHistoryStore, type EarnHistoryEntry } from "@/store/earnHistoryStore";

export function useEarnHistoryPersistence() {
  const { entries, setEntries } = useEarnHistoryStore();
  const hydratedRef = useRef(false);

  useEffect(() => {
    void (async () => {
      const raw = await loadEarnHistory();
      if (raw) {
        try {
          const parsed = JSON.parse(raw) as EarnHistoryEntry[];
          if (Array.isArray(parsed)) setEntries(parsed);
        } catch {
          // Corrupt blob — discard.
        }
      }
      hydratedRef.current = true;
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!hydratedRef.current) return;
    void saveEarnHistory(JSON.stringify(entries));
  }, [entries]);
}
