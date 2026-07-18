import { useCallback, useEffect, useState } from "react";

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
// When each key was last resolved. Drives the TTL below so a changed username or
// photo (ours OR a counterparty's) refreshes without an app restart, instead of
// being cached for the whole session. Set for EVERY resolved key — even ones with
// no name — so nameless addresses aren't re-fetched on every render.
const fetchedAt = new Map<string, number>(); // key → epoch ms of last resolve
const inFlight = new Set<string>();

// How long a resolved identity is trusted before `resolve` re-fetches it.
const TTL_MS = 60_000;

// Cache mutations (resolve/invalidate/seedOwnProfile) happen outside React — and
// often from a hook instance OTHER than the ones rendering a feed (e.g. Settings
// changing a username while Activity is mounted). Every mounted hook subscribes a
// re-render bump here so those cross-instance updates actually repaint.
const listeners = new Set<() => void>();
function notify() {
  listeners.forEach((l) => l());
}

function cacheProfile(p: MerchantProfile) {
  if (p.merchantId) nameCache.set(p.merchantId, p.businessName);
  if (p.ownerAddr) nameCache.set(p.ownerAddr, p.businessName);
  if (p.logoUrl) {
    if (p.merchantId) logoCache.set(p.merchantId, p.logoUrl);
    if (p.ownerAddr) logoCache.set(p.ownerAddr, p.logoUrl);
  }
}

/**
 * Forget cached identity for the given keys (or everything when omitted), so the
 * next `resolve` re-fetches fresh names/photos. Call after a profile changes
 * (e.g. pull-to-refresh on a feed) to force an immediate refresh rather than
 * waiting out the TTL. Module-level so non-hook callers can use it too.
 */
export function invalidateDirectory(keys?: (string | null | undefined)[]) {
  if (!keys) {
    nameCache.clear();
    logoCache.clear();
    aliasCache.clear();
    avatarCache.clear();
    fetchedAt.clear();
  } else {
    for (const k of keys) {
      if (!k) continue;
      nameCache.delete(k);
      logoCache.delete(k);
      aliasCache.delete(k);
      avatarCache.delete(k);
      fetchedAt.delete(k);
    }
  }
  notify();
}

/**
 * Immediately reflect the signed-in user's own new alias/avatar across every
 * screen that renders by address — no wait for the TTL. `avatar`: a data URI to
 * set, "" / null to clear. Called from `useUsername.register` after a save.
 */
export function seedOwnProfile(addr: string, alias: string, avatar?: string | null) {
  if (!addr) return;
  aliasCache.set(addr, alias);
  if (avatar) avatarCache.set(addr, avatar);
  else avatarCache.delete(addr);
  fetchedAt.set(addr, Date.now());
  notify();
}

/**
 * Resolve merchant ids / owner addresses to business names. `nameFor` is sync
 * (cache hit or undefined); `resolve` warms the cache in the background and bumps
 * a version so consumers re-render once names arrive. Entries expire after
 * `TTL_MS` so changed names/photos refresh. Unknown → undefined, so callers fall
 * back to a short address.
 */
export function useMerchantDirectory() {
  const [, setVersion] = useState(0);

  // Subscribe to module-level cache mutations so updates made by other hook
  // instances (or non-hook callers) repaint this one.
  useEffect(() => {
    const bump = () => setVersion((v) => v + 1);
    listeners.add(bump);
    return () => {
      listeners.delete(bump);
    };
  }, []);

  const resolve = useCallback((keys: (string | null | undefined)[]) => {
    const now = Date.now();
    const wanted = Array.from(
      new Set(
        keys.filter(
          (k): k is string =>
            !!k &&
            k.startsWith("0x") &&
            !inFlight.has(k) &&
            // Fetch if never resolved, or if its cached identity has expired.
            (!fetchedAt.has(k) || now - (fetchedAt.get(k) ?? 0) > TTL_MS),
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
            else avatarCache.delete(u.ownerAddr);
          });
          return users.length;
        })
        .catch(() => 0),
    ])
      .then(([merchants, users]) => {
        // Stamp every key we attempted (even nameless ones) so the TTL governs
        // the next fetch instead of re-hitting the backend on every render.
        const done = Date.now();
        wanted.forEach((k) => fetchedAt.set(k, done));
        if (merchants || users) notify();
      })
      .finally(() => wanted.forEach((k) => inFlight.delete(k)));
  }, []);

  const invalidate = useCallback(
    (keys?: (string | null | undefined)[]) => invalidateDirectory(keys),
    [],
  );

  const nameFor = useCallback((key: string | null | undefined): string | undefined => {
    if (!key) return undefined;
    // Personal @brisk alias wins over a business name (P2P identity). Coerce an
    // empty-string cache value to undefined so it can't win the `??` fallback.
    return (aliasCache.get(key) || undefined) ?? (nameCache.get(key) || undefined);
  }, []);

  const logoFor = useCallback((key: string | null | undefined): string | undefined => {
    if (!key) return undefined;
    // Personal avatar wins; a merchant logo only shows for a pure-merchant key
    // (one with no personal alias).
    return avatarCache.get(key) ?? (aliasCache.has(key) ? undefined : logoCache.get(key));
  }, []);

  return { nameFor, logoFor, resolve, invalidate };
}
