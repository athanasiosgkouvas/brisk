import type { PredictVaultState } from "@/services/api/predictVaultApi";
import { loadEarnVaultCache, saveEarnVaultCache } from "@/services/storage/sessionStorage";

let cached: PredictVaultState | null = null;
let hydrated = false;
let hydrationPromise: Promise<void> | null = null;

/**
 * Synchronous read of the last-known Predict vault state. Returns null
 * until the persisted cache has been hydrated on app boot (kicked off by
 * `hydrateEarnVaultCache`). Used as `initialData` for the Earn vault
 * query so the tab renders meaningful numbers instead of a spinner on
 * cold start.
 */
export function getCachedVaultState(): PredictVaultState | null {
  return cached;
}

export function setCachedVaultState(state: PredictVaultState): void {
  cached = state;
  void saveEarnVaultCache(JSON.stringify(state)).catch(() => {
    // best-effort persistence; ignore I/O failures
  });
}

export async function hydrateEarnVaultCache(): Promise<void> {
  if (hydrated) return;
  if (hydrationPromise) return hydrationPromise;
  hydrationPromise = (async () => {
    try {
      const raw = await loadEarnVaultCache();
      if (raw) {
        const parsed = JSON.parse(raw) as PredictVaultState;
        if (parsed && typeof parsed === "object") cached = parsed;
      }
    } catch {
      // ignore — fall back to live fetch
    } finally {
      hydrated = true;
    }
  })();
  return hydrationPromise;
}
