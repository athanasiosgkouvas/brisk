import { useCallback, useState } from "react";
import { useRouter } from "expo-router";

import { useAuth } from "@/hooks/useAuth";
import { useAppMode } from "@/hooks/useAppMode";
import type { AppMode } from "@/store/appModeStore";
import { createTill, listTills } from "@/services/blockchain/till";
import { ensureMerchant } from "@/services/blockchain/merchant";
import { upsertMerchantProfile } from "@/services/api/backendApi";
import { saveMerchantName } from "@/services/storage/prefsStorage";

/**
 * Gates the Personal→Pro switch. The FIRST time a user enters Pro we collect a
 * business name (the `/pro-setup` modal) and provision their merchant: register
 * the on-chain `Merchant` with that name, create a default "Main" till, and
 * record the business name in the directory. Once provisioned, a persisted flag
 * (see useAppMode) lets returning users flip into Pro instantly — like Personal.
 *
 * Pass `requestMode` to the ModeSwitch's `onRequestMode`; `provision` is called
 * by the setup modal once a name is entered.
 */
export function useProActivation() {
  const { session } = useAuth();
  const { setMode, proProvisioned, setProProvisioned } = useAppMode();
  const router = useRouter();
  const [activating, setActivating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const requestMode = useCallback(
    (next: AppMode) => {
      if (next === "personal") {
        setMode("personal");
        return;
      }
      if (!session) return;
      // Already set up → instant switch, no setup or network check.
      if (proProvisioned) {
        setMode("pro");
        return;
      }
      // First time → collect a business name before provisioning anything.
      router.push("/pro-setup");
    },
    [session, setMode, proProvisioned, router],
  );

  const provision = useCallback(
    async (businessName: string) => {
      if (!session) throw new Error("Not signed in");
      const name = businessName.trim();
      setError(null);
      setActivating(true);
      try {
        // Register the on-chain Merchant with the business name (idempotent),
        // then create a default receiving account if none exists yet.
        const merchantId = await ensureMerchant(session, name);
        let tills: { tillId: string }[] = [];
        try {
          tills = await listTills(session.address);
        } catch {
          tills = [];
        }
        if (tills.length === 0) await createTill(session, "Main");
        // Record the business name in the directory (best-effort) + cache it.
        await upsertMerchantProfile({
          sender: session.address,
          merchantId,
          businessName: name,
        }).catch(() => undefined);
        await saveMerchantName(name);
        setProProvisioned(true);
        setMode("pro");
      } catch (e) {
        setError(e instanceof Error ? e.message : "Couldn't set up your business");
        throw e;
      } finally {
        setActivating(false);
      }
    },
    [session, setMode, setProProvisioned],
  );

  return { requestMode, provision, activating, error };
}
