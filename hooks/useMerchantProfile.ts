import { useCallback, useEffect, useState } from "react";

import { useAuth } from "@/hooks/useAuth";
import { ensureMerchant } from "@/services/blockchain/merchant";
import { getMerchantByOwner, upsertMerchantProfile } from "@/services/api/backendApi";
import { loadMerchantName, saveMerchantName } from "@/services/storage/prefsStorage";

/**
 * The current user's own business profile (Pro side). Name hydrates instantly
 * from local cache, then reconciles with the directory. `rename` updates the
 * directory (the on-chain Merchant keeps its original registered name).
 */
export function useMerchantProfile() {
  const { session } = useAuth();
  const [name, setName] = useState<string | null>(null);
  const [merchantId, setMerchantId] = useState<string | null>(null);
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
      const profile = await getMerchantByOwner(session.address);
      if (profile) {
        setName(profile.businessName);
        setMerchantId(profile.merchantId);
        void saveMerchantName(profile.businessName);
      }
    } finally {
      setLoading(false);
    }
  }, [session]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void refresh();
  }, [refresh]);

  const rename = useCallback(
    async (next: string) => {
      if (!session) throw new Error("Not signed in");
      const trimmed = next.trim();
      const id = merchantId ?? (await ensureMerchant(session, trimmed));
      const profile = await upsertMerchantProfile({
        sender: session.address,
        merchantId: id,
        businessName: trimmed,
      });
      setName(profile.businessName);
      setMerchantId(profile.merchantId);
      void saveMerchantName(profile.businessName);
    },
    [session, merchantId],
  );

  return { name, merchantId, loading, refresh, rename };
}
