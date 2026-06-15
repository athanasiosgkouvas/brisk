import { useCallback, useEffect, useState } from "react";

import { useAuth } from "@/hooks/useAuth";
import {
  createTill,
  listTills,
  sweepTill,
  renameTill,
  removeTill,
  type Till,
} from "@/services/blockchain/till";

type Status = "idle" | "loading" | "working" | "error";

/**
 * Pro-mode receiving accounts. Lists the merchant's tills (with live balances),
 * and exposes create + sweep ("Move to treasury") actions. Mirrors useSave's
 * shape: local state + an explicit refresh the Dashboard polls on focus.
 */
export function useTills() {
  const { session } = useAuth();
  const [tills, setTills] = useState<Till[]>([]);
  const [status, setStatus] = useState<Status>("loading");
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (!session?.address) {
      setStatus("idle");
      return;
    }
    try {
      setTills(await listTills(session.address));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load receiving accounts");
    } finally {
      setStatus("idle");
    }
  }, [session]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void refresh();
  }, [refresh]);

  const create = useCallback(
    async (name: string, treasury?: string) => {
      if (!session) throw new Error("Not signed in");
      setStatus("working");
      setError(null);
      try {
        const till = await createTill(session, name.trim() || "Account", treasury);
        setTills((prev) => [till, ...prev]);
        return till;
      } catch (e) {
        setError(e instanceof Error ? e.message : "Failed to create account");
        setStatus("error");
        throw e;
      } finally {
        setStatus("idle");
      }
    },
    [session],
  );

  const sweep = useCallback(
    async (tillId: string) => {
      if (!session) throw new Error("Not signed in");
      setStatus("working");
      setError(null);
      try {
        await sweepTill(session, tillId);
        await refresh();
      } catch (e) {
        setError(e instanceof Error ? e.message : "Failed to move funds to treasury");
        setStatus("error");
        throw e;
      } finally {
        setStatus("idle");
      }
    },
    [session, refresh],
  );

  const rename = useCallback(
    async (tillId: string, name: string) => {
      if (!session) throw new Error("Not signed in");
      setStatus("working");
      setError(null);
      try {
        await renameTill(session, tillId, name.trim() || "Account");
        await refresh();
      } catch (e) {
        setError(e instanceof Error ? e.message : "Failed to rename account");
        setStatus("error");
        throw e;
      } finally {
        setStatus("idle");
      }
    },
    [session, refresh],
  );

  const remove = useCallback(
    async (tillId: string) => {
      if (!session) throw new Error("Not signed in");
      setStatus("working");
      setError(null);
      try {
        await removeTill(session, tillId);
        // Drop it locally right away (listing also filters disabled tills).
        setTills((prev) => prev.filter((t) => t.tillId !== tillId));
      } catch (e) {
        setError(e instanceof Error ? e.message : "Failed to remove account");
        setStatus("error");
        throw e;
      } finally {
        setStatus("idle");
      }
    },
    [session],
  );

  const sweepAll = useCallback(async () => {
    if (!session) return;
    setStatus("working");
    setError(null);
    try {
      // Sweep only tills that actually hold funds (sweep is a no-op otherwise).
      for (const t of tills) {
        if (t.balanceMicros > 0) await sweepTill(session, t.tillId);
      }
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to move funds to treasury");
      setStatus("error");
    } finally {
      setStatus("idle");
    }
  }, [session, tills, refresh]);

  return { tills, status, error, refresh, create, sweep, sweepAll, rename, remove };
}
