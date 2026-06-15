import { create } from "zustand";

import type { AppMode } from "@/services/storage/prefsStorage";

export type { AppMode };

type AppModeStore = {
  /** Which experience the app is showing. Defaults to "personal". */
  mode: AppMode;
  /** True once the persisted mode has been read from storage (see useAppMode). */
  hydrated: boolean;
  /** True once Pro has been set up (merchant + a till). Lets returning users
   *  flip into Pro instantly, skipping the first-time provisioning check. */
  proProvisioned: boolean;
  setMode: (mode: AppMode) => void;
  setHydrated: (hydrated: boolean) => void;
  setProProvisioned: (provisioned: boolean) => void;
};

export const useAppModeStore = create<AppModeStore>((set) => ({
  mode: "personal",
  hydrated: false,
  proProvisioned: false,
  setMode: (mode) => set({ mode }),
  setHydrated: (hydrated) => set({ hydrated }),
  setProProvisioned: (proProvisioned) => set({ proProvisioned }),
}));
