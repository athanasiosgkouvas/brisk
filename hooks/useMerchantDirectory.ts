import { useCallback, useState } from "react";

import { lookupMerchants, lookupUsers, type MerchantProfile } from "@/services/api/backendApi";

// Session-lifetime cache of merchant id/address → business name, so any screen
// can render names instead of 0x. Shared across hook instances via a module map.
const nameCache = new Map<string, string>(); // key: merchantId OR ownerAddr
const logoCache = new Map<string, string>(); // key: merchantId OR ownerAddr → logoUrl
// Ordinary users' Brisk aliases (ownerAddr → `handle@brisk`) and optional avatar
// data URIs. The personal identity WINS over a business name/logo: an address can
// be both a person and a merchant owner, and in the P2P/activity feed we want to
// show the person's @brisk alias + their photo, not their business name.
const aliasCache = new Map<string, string>(); // key: ownerAddr → alias
const avatarCache = new Map<string, string>(); // key: ownerAddr → avatar data URI
const inFlight = new Set<string>();

function cacheProfile(p: MerchantProfile) {
  if (p.merchantId) nameCache.set(p.merchantId, p.businessName);
  if (p.ownerAddr) nameCache.set(p.ownerAddr, p.businessName);
  if (p.logoUrl) {
    if (p.merchantId) logoCache.set(p.merchantId, p.logoUrl);
    if (p.ownerAddr) logoCache.set(p.ownerAddr, p.logoUrl);
  }
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
          (k): k is string =>
            !!k &&
            k.startsWith("0x") &&
            !nameCache.has(k) &&
            !aliasCache.has(k) &&
            !inFlight.has(k),
        ),
      ),
    );
    if (wanted.length === 0) return;
    wanted.forEach((k) => inFlight.add(k));
    // Resolve merchant business names AND ordinary-user Brisk aliases in parallel
    // (each key tried as both a merchant id and an owner address).
    void Promise.all([
      lookupMerchants(wanted, wanted)
        .then((profiles) => {
          profiles.forEach(cacheProfile);
          return profiles.length;
        })
        .catch(() => 0),
      lookupUsers(wanted)
        .then((users) => {
          users.forEach((u) => {
            aliasCache.set(u.ownerAddr, u.alias);
            if (u.avatar) avatarCache.set(u.ownerAddr, u.avatar);
          });
          return users.length;
        })
        .catch(() => 0),
    ])
      .then(([merchants, users]) => {
        if (merchants || users) setVersion((v) => v + 1);
      })
      .finally(() => wanted.forEach((k) => inFlight.delete(k)));
  }, []);

  const nameFor = useCallback((key: string | null | undefined): string | undefined => {
    if (!key) return undefined;
    // Personal @brisk alias wins over a business name (P2P identity).
    return aliasCache.get(key) ?? nameCache.get(key);
  }, []);

  const logoFor = useCallback((key: string | null | undefined): string | undefined => {
    if (!key) return undefined;
    // Personal avatar wins; a merchant logo only shows for a pure-merchant key
    // (one with no personal alias).
    return avatarCache.get(key) ?? (aliasCache.has(key) ? undefined : logoCache.get(key));
  }, []);

  return { nameFor, logoFor, resolve };
}
