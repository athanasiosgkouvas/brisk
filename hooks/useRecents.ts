import { useCallback, useEffect } from "react";

import { useAuth } from "@/hooks/useAuth";
import { useRecentsStore } from "@/store/recentsStore";
import { addRecent, loadRecents } from "@/services/storage/prefsStorage";

/**
 * Recent P2P send recipients for the current account. Loads once per address;
 * `record` upserts a recipient after a successful send. Local-only (instant,
 * offline) — the Send screen renders these for one-tap re-send.
 */
export function useRecents() {
  const { session } = useAuth();
  const address = session?.address ?? null;
  const { recents, loadedFor, setRecents } = useRecentsStore();

  useEffect(() => {
    if (!address || loadedFor === address) return;
    let mounted = true;
    void loadRecents(address).then((list) => {
      if (mounted) setRecents(address, list);
    });
    return () => {
      mounted = false;
    };
  }, [address, loadedFor, setRecents]);

  const record = useCallback(
    async (recipientAddr: string, display: string) => {
      if (!address) return;
      const next = await addRecent(address, {
        address: recipientAddr,
        display,
        lastAtMs: Date.now(),
      });
      setRecents(address, next);
    },
    [address, setRecents],
  );

  return { recents: loadedFor === address ? recents : [], record };
}
