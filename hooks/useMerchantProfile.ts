import { useCallback, useEffect, useState } from "react";

import { useAuth } from "@/hooks/useAuth";
import { useAppMode } from "@/hooks/useAppMode";
import { ensureMerchant } from "@/services/blockchain/merchant";
import {
  getMerchantByOwner,
  upsertMerchantProfile,
  type MerchantProfile,
  type MerchantProfileFields,
} from "@/services/api/backendApi";
import { loadMerchantName, saveMerchantName } from "@/services/storage/prefsStorage";

/** A profile is "complete" once the required setup fields (name + VAT) exist. */
export function isProfileComplete(p: MerchantProfile | null): boolean {
  return !!p && !!p.businessName?.trim() && !!p.vatId?.trim();
}

/**
 * The current user's own business profile (Pro side). Name hydrates instantly
 * from local cache, then reconciles with the directory. `update` edits directory
 * fields (the on-chain Merchant keeps its original registered name). When a
 * complete profile is found we reconcile the persisted `proProvisioned` flag so
 * a returning user (new device / reinstall) flips into Pro without re-setup.
 */
export function useMerchantProfile() {
  const { session } = useAuth();
  const { setProProvisioned } = useAppMode();
  const [name, setName] = useState<string | null>(null);
  const [merchantId, setMerchantId] = useState<string | null>(null);
  const [profile, setProfile] = useState<MerchantProfile | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let mounted = true;
    loadMerchantName().then((n) => {
      if (mounted && n) setName(n);
    });
    return () => {
      mounted = false;
    };
  }, []);

  const refresh = useCallback(async () => {
    if (!session?.address) {
      setLoading(false);
      return;
    }
    try {
      const p = await getMerchantByOwner(session.address);
      if (p) {
        setProfile(p);
        setName(p.businessName);
        setMerchantId(p.merchantId);
        void saveMerchantName(p.businessName);
        // A complete directory profile means this address already set up a shop —
        // keep the fast-switch flag in sync across devices/reinstalls.
        if (isProfileComplete(p)) setProProvisioned(true);
      }
    } finally {
      setLoading(false);
    }
  }, [session, setProProvisioned]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void refresh();
  }, [refresh]);

  // Update the profile: business name and/or any optional metadata field.
  // Only the fields provided are sent; the backend preserves the rest.
  const update = useCallback(
    async (fields: { businessName?: string } & MerchantProfileFields) => {
      if (!session) throw new Error("Not signed in");
      const nextName = (fields.businessName ?? name ?? "").trim();
      if (!nextName) throw new Error("A business name is required");
      const id = merchantId ?? (await ensureMerchant(session, nextName));
      const saved = await upsertMerchantProfile({
        sender: session.address,
        merchantId: id,
        businessName: nextName,
        vatId: fields.vatId,
        city: fields.city,
        country: fields.country,
        phone: fields.phone,
        email: fields.email,
        category: fields.category,
        logoUrl: fields.logoUrl,
      });
      setProfile(saved);
      setName(saved.businessName);
      setMerchantId(saved.merchantId);
      void saveMerchantName(saved.businessName);
      if (isProfileComplete(saved)) setProProvisioned(true);
      return saved;
    },
    [session, merchantId, name, setProProvisioned],
  );

  // Back-compat: a name-only edit (the inline rename in Business settings).
  const rename = useCallback((next: string) => update({ businessName: next }), [update]);

  return {
    name,
    merchantId,
    profile,
    loading,
    complete: isProfileComplete(profile),
    refresh,
    update,
    rename,
  };
}
