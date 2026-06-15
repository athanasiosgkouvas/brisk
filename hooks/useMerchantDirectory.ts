import { useCallback, useState } from "react";

import { lookupMerchants, type MerchantProfile } from "@/services/api/backendApi";

// Session-lifetime cache of merchant id/address → business name, so any screen
// can render names instead of 0x. Shared across hook instances via a module map.
const nameCache = new Map<string, string>(); // key: merchantId OR ownerAddr
const inFlight = new Set<string>();

function cacheProfile(p: MerchantProfile) {
  if (p.merchantId) nameCache.set(p.merchantId, p.businessName);
  if (p.ownerAddr) nameCache.set(p.ownerAddr, p.businessName);
}

/**
 * Resolve merchant ids / owner addresses to business names. `nameFor` is sync
 * (cache hit or undefined); `resolve` warms the cache in the background and bumps
 * a version so consumers re-render once names arrive. Unknown → undefined, so
 * callers fall back to a short address.
 */
export function useMerchantDirectory() {
  const [, setVersion] = useState(0);

  const resolve = useCallback((keys: (string | null | undefined)[]) => {
    const wanted = Array.from(
      new Set(
        keys.filter(
          (k): k is string => !!k && k.startsWith("0x") && !nameCache.has(k) && !inFlight.has(k),
        ),
      ),
    );
    if (wanted.length === 0) return;
    wanted.forEach((k) => inFlight.add(k));
    // Try each key as both a merchant id and an owner address (cheap, batched).
    void lookupMerchants(wanted, wanted)
      .then((profiles) => {
        profiles.forEach(cacheProfile);
        if (profiles.length) setVersion((v) => v + 1);
      })
      .finally(() => wanted.forEach((k) => inFlight.delete(k)));
  }, []);

  const nameFor = useCallback((key: string | null | undefined): string | undefined => {
    if (!key) return undefined;
    return nameCache.get(key);
  }, []);

  return { nameFor, resolve };
}
