import { useCallback, useEffect } from "react";

import { trackEvent } from "@/services/analytics/analyticsService";
import {
  loadAppMode,
  loadProProvisioned,
  saveAppMode,
  saveProProvisioned,
  type AppMode,
} from "@/services/storage/prefsStorage";
import { useAppModeStore } from "@/store/appModeStore";

/**
 * App mode (Personal vs Pro). Mirrors useAuth's restore-once idiom: the persisted
 * mode (and the "Pro provisioned" flag) are read into the store on first mount,
 * gated by a `hydrated` flag so the root layout can hold the splash until mode is
 * known (avoids a flash of the wrong tab set on warm starts). `setMode` updates
 * the store AND persists.
 */
export function useAppMode() {
  const {
    mode,
    hydrated,
    proProvisioned,
    setMode: setModeState,
    setHydrated,
    setProProvisioned: setProProvisionedState,
  } = useAppModeStore();

  useEffect(() => {
    let mounted = true;
    if (hydrated) return;
    Promise.all([loadAppMode(), loadProProvisioned()])
      .then(([restoredMode, restoredProvisioned]) => {
        if (!mounted) return;
        setModeState(restoredMode);
        setProProvisionedState(restoredProvisioned);
        setHydrated(true);
      })
      .catch(() => {
        if (!mounted) return;
        setHydrated(true);
      });
    return () => {
      mounted = false;
    };
  }, [hydrated, setHydrated, setModeState, setProProvisionedState]);

  const setMode = useCallback(
    (next: AppMode) => {
      setModeState(next);
      void saveAppMode(next);
      void trackEvent("app_mode_changed", undefined, { mode: next });
    },
    [setModeState],
  );

  const setProProvisioned = useCallback(
    (next: boolean) => {
      setProProvisionedState(next);
      void saveProProvisioned(next);
    },
    [setProProvisionedState],
  );

  return { mode, hydrated, setMode, proProvisioned, setProProvisioned };
}
