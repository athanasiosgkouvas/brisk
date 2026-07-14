import { useCallback, useEffect } from "react";

import { useAuth } from "@/hooks/useAuth";
import { useUsernameStore } from "@/store/userStore";
import { getUserByOwner, upsertUsername } from "@/services/api/backendApi";
import { loadUsername, saveUsername } from "@/services/storage/prefsStorage";
import { formatAlias, normalizeHandle } from "@/utils/handle";

/**
 * The current account's Brisk username, backed by the backend directory. On
 * login it reads the local cache fast (no gate flash) then reconciles with the
 * backend: an explicit 404 → `needsUsername` (catches new AND returning users
 * who never set one); a network error fails OPEN (never blocks the app).
 * `register` mirrors useProActivation.provision.
 */
export function useUsername() {
  const { session } = useAuth();
  const { handle, status, checkedAddress, setState, reset } = useUsernameStore();
  const address = session?.address ?? null;

  useEffect(() => {
    if (!address || checkedAddress === address) return;
    let mounted = true;
    void (async () => {
      // Fast local read first — an instant "has" avoids a setup-screen flash on
      // warm start; it does NOT set checkedAddress, so the backend still runs.
      const cached = await loadUsername(address).catch(() => null);
      if (mounted && cached) setState({ handle: cached, status: "has" });
      try {
        const user = await getUserByOwner(address);
        if (!mounted) return;
        if (user) {
          void saveUsername(address, user.handle);
          setState({ handle: user.handle, status: "has", checkedAddress: address });
        } else {
          // Explicit 404 — no username on record.
          setState({ handle: null, status: "needs", checkedAddress: address });
        }
      } catch {
        // Backend blip — fail open (don't trap the user in the gate).
        if (mounted) setState({ status: "has", checkedAddress: address });
      }
    })();
    return () => {
      mounted = false;
    };
  }, [address, checkedAddress, setState]);

  const needsUsername = !!address && checkedAddress === address && status === "needs";

  const register = useCallback(
    async (raw: string) => {
      if (!session) throw new Error("Not signed in");
      const norm = normalizeHandle(raw);
      if (!norm) throw new Error("3–20 lowercase letters, numbers, or _");
      const user = await upsertUsername({ sender: session.address, handle: norm });
      void saveUsername(session.address, user.handle);
      setState({ handle: user.handle, status: "has", checkedAddress: session.address });
      return user;
    },
    [session, setState],
  );

  return {
    handle,
    alias: handle ? formatAlias(handle) : null,
    needsUsername,
    register,
    reset,
  };
}
