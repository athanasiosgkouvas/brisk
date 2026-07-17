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

  /**
   * Re-list tills after a sweep, tolerating the node's read-your-writes lag: a
   * one-shot read right after the tx often still returns the pre-sweep balance,
   * which would restore the money we just moved. Poll until every swept till
   * reads empty (or give up after a few tries and keep the optimistic zero).
   */
  const reconcileTills = useCallback(
    async (sweptIds: string[]) => {
      const addr = session?.address;
      if (!addr) return;
      for (let i = 0; i < 6; i++) {
        await new Promise((r) => setTimeout(r, 1500));
        try {
          const fresh = await listTills(addr);
          const settled = sweptIds.every(
            (id) => (fresh.find((t) => t.tillId === id)?.balanceMicros ?? 0) === 0,
          );
          if (settled) {
            setTills(fresh);
            return;
          }
        } catch {
          // keep polling
        }
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
      } catch (e) {
        setError(e instanceof Error ? e.message : "Failed to move funds to treasury");
        setStatus("error");
        throw e;
      }
      // Sweep drains the whole till → reflect it immediately and stop the spinner
      // (a one-shot refetch can still read the stale pre-sweep balance). Reconcile
      // against the node in the background once it catches up.
      setTills((prev) => prev.map((t) => (t.tillId === tillId ? { ...t, balanceMicros: 0 } : t)));
      setStatus("idle");
      void reconcileTills([tillId]);
    },
    [session, reconcileTills],
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
    // Sweep only tills that actually hold funds (sweep is a no-op otherwise).
    const fundedIds = tills.filter((t) => t.balanceMicros > 0).map((t) => t.tillId);
    try {
      for (const id of fundedIds) await sweepTill(session, id);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to move funds to treasury");
      setStatus("error");
      return;
    }
    // Optimistically empty the swept tills + stop the spinner; reconcile in bg.
    setTills((prev) =>
      prev.map((t) => (fundedIds.includes(t.tillId) ? { ...t, balanceMicros: 0 } : t)),
    );
    setStatus("idle");
    void reconcileTills(fundedIds);
  }, [session, tills, reconcileTills]);

  return { tills, status, error, refresh, create, sweep, sweepAll, rename, remove };
}
