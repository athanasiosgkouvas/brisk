import { useCallback, useState } from "react";
import { useRouter } from "expo-router";

import { useAuth } from "@/hooks/useAuth";
import { useAppMode } from "@/hooks/useAppMode";
import { isProfileComplete } from "@/hooks/useMerchantProfile";
import type { AppMode } from "@/store/appModeStore";
import { createTill, listTills } from "@/services/blockchain/till";
import { ensureMerchant, findMerchantId } from "@/services/blockchain/merchant";
import {
  getMerchantByOwner,
  upsertMerchantProfile,
  type MerchantProfileFields,
} from "@/services/api/backendApi";
import { saveMerchantName } from "@/services/storage/prefsStorage";

/** The full set of fields the setup form collects. `businessName` + `vatId` are
 *  required; the rest are optional business metadata. */
export type BusinessSetupInput = { businessName: string } & MerchantProfileFields;

/**
 * Gates the Personal→Pro switch. The FIRST time a user enters Pro we collect the
 * business profile (`/pro-setup`) and provision their merchant: register the
 * on-chain `Merchant`, create a default "Main" till, and record the profile in
 * the directory. Returning users flip into Pro instantly.
 *
 * "Already has a shop" is checked against the backend directory first, then the
 * on-chain MerchantCap — so a reinstall / new device for an address that already
 * set up a shop is NOT re-prompted (and never registers a duplicate merchant).
 */
export function useProActivation() {
  const { session } = useAuth();
  const { setMode, proProvisioned, setProProvisioned } = useAppMode();
  const router = useRouter();
  const [activating, setActivating] = useState(false);
  const [checking, setChecking] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const requestMode = useCallback(
    (next: AppMode) => {
      if (next === "personal") {
        setMode("personal");
        return;
      }
      if (!session) return;
      // Fast path: locally known to be set up → instant switch.
      if (proProvisioned) {
        setMode("pro");
        return;
      }
      // Otherwise verify against the backend (then on-chain) before prompting, so
      // an already-registered address isn't asked to set up again.
      setChecking(true);
      void (async () => {
        try {
          const profile = await getMerchantByOwner(session.address);
          if (isProfileComplete(profile)) {
            if (profile) await saveMerchantName(profile.businessName);
            setProProvisioned(true);
            setMode("pro");
            return;
          }
          // No complete directory profile. Fall back to the chain to see if a
          // shop exists at all (so setup can reuse it), then collect the profile.
          const existingMerchant = await findMerchantId(session.address).catch(() => null);
          router.push({
            pathname: "/pro-setup",
            params: {
              name: profile?.businessName ?? "",
              hasShop: existingMerchant || profile ? "1" : "0",
            },
          });
        } finally {
          setChecking(false);
        }
      })();
    },
    [session, setMode, proProvisioned, setProProvisioned, router],
  );

  const provision = useCallback(
    async (input: BusinessSetupInput) => {
      if (!session) throw new Error("Not signed in");
      const name = input.businessName.trim();
      setError(null);
      setActivating(true);
      try {
        // Register the on-chain Merchant with the business name (idempotent —
        // reuses an existing MerchantCap), then create a default receiving
        // account if none exists yet.
        const merchantId = await ensureMerchant(session, name);
        let tills: { tillId: string }[] = [];
        try {
          tills = await listTills(session.address);
        } catch {
          tills = [];
        }
        if (tills.length === 0) await createTill(session, "Main");
        // Record the profile in the directory (required now — this is where the
        // VAT + metadata live), then cache the name and flip into Pro. Blank
        // optional fields are sent as `undefined` (omitted) rather than "" so the
        // "finish profile" path never clears a field the form didn't show.
        const blankToUndef = (v: string | undefined) => (v && v.trim() ? v : undefined);
        await upsertMerchantProfile({
          sender: session.address,
          merchantId,
          businessName: name,
          vatId: blankToUndef(input.vatId),
          city: blankToUndef(input.city),
          country: blankToUndef(input.country),
          phone: blankToUndef(input.phone),
          email: blankToUndef(input.email),
          category: blankToUndef(input.category),
          logoUrl: blankToUndef(input.logoUrl),
        });
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

  return { requestMode, provision, activating, checking, error };
}
