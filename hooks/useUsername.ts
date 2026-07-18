import { useCallback, useEffect } from "react";

import { useAuth } from "@/hooks/useAuth";
import { seedOwnProfile } from "@/hooks/useMerchantDirectory";
import { useUsernameStore } from "@/store/userStore";
import { getUserByOwner, upsertUsername } from "@/services/api/backendApi";
import { loadUsername, saveUsername } from "@/services/storage/prefsStorage";
import { formatAlias, handleError, normalizeHandle } from "@/utils/handle";

/**
 * The current account's Brisk username, backed by the backend directory. On
 * login it reads the local cache fast (no gate flash) then reconciles with the
 * backend: an explicit 404 → `needsUsername` (catches new AND returning users
 * who never set one); a network error fails OPEN (never blocks the app).
 * `register` mirrors useProActivation.provision.
 */
export function useUsername() {
  const { session } = useAuth();
  const { handle, avatar, status, checkedAddress, setState, reset } = useUsernameStore();
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
          setState({
            handle: user.handle,
            avatar: user.avatar ?? null,
            status: "has",
            checkedAddress: address,
          });
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

  // `avatar`: omit to keep the current photo, "" to remove it, a data URI to set.
  const register = useCallback(
    async (raw: string, nextAvatar?: string | null) => {
      if (!session) throw new Error("Not signed in");
      const err = handleError(raw);
      if (err) throw new Error(err);
      const norm = normalizeHandle(raw)!;
      const user = await upsertUsername({
        sender: session.address,
        handle: norm,
        avatar: nextAvatar,
      });
      void saveUsername(session.address, user.handle);
      // Push the new alias/photo into the shared directory cache immediately so
      // every by-address surface (Activity, dashboards, Send) shows our new
      // identity at once, without waiting out the TTL or an app restart.
      seedOwnProfile(session.address, formatAlias(user.handle), user.avatar ?? null);
      setState({
        handle: user.handle,
        avatar: user.avatar ?? null,
        status: "has",
        checkedAddress: session.address,
      });
      return user;
    },
    [session, setState],
  );

  return {
    handle,
    avatar,
    alias: handle ? formatAlias(handle) : null,
    needsUsername,
    register,
    reset,
  };
}
