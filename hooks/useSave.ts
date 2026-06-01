import { useCallback, useEffect, useState } from "react";

import { useAuth } from "@/hooks/useAuth";
import { useRefreshOnFocus } from "@/hooks/useRefreshOnFocus";
import {
  depositToSave,
  getSaveState,
  openVault,
  withdrawFromSave,
  type SaveState,
} from "@/services/blockchain/saveAccount";

export type SaveStatus = "loading" | "idle" | "working" | "error";

export function useSave() {
  const { session } = useAuth();
  const [state, setState] = useState<SaveState>({ vaultId: null, valueMicros: 0 });
  const [status, setStatus] = useState<SaveStatus>("loading");
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (!session) return;
    try {
      setState(await getSaveState(session.address));
      setStatus("idle");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load Save");
      setStatus("error");
    }
  }, [session]);

  useEffect(() => {
    // refresh is async — setState only fires after the await, not synchronously.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void refresh();
  }, [refresh]);

  // Keep the Save figure live across tabs (e.g. the Wallet summary after a
  // withdraw, or this tab after a pay drew the balance down).
  useRefreshOnFocus(refresh);

  const run = useCallback(
    async (fn: () => Promise<void>) => {
      setError(null);
      setStatus("working");
      try {
        await fn();
        await refresh();
      } catch (e) {
        setError(e instanceof Error ? e.message : "Action failed");
        setStatus("error");
      }
    },
    [refresh],
  );

  const activate = useCallback(() => {
    if (session) void run(() => openVault(session));
  }, [session, run]);

  const deposit = useCallback(
    (micros: number) => {
      if (session && state.vaultId) void run(() => depositToSave(session, state.vaultId!, micros));
    },
    [session, state.vaultId, run],
  );

  const withdraw = useCallback(
    (micros: number) => {
      if (session && state.vaultId)
        void run(() => withdrawFromSave(session, state.vaultId!, micros));
    },
    [session, state.vaultId, run],
  );

  return { state, status, error, activate, deposit, withdraw, refresh };
}
