import { create } from "zustand";

import type { ThemeScheme } from "@/services/storage/prefsStorage";

export type { ThemeScheme };

type ThemeStore = {
  /** Active color scheme. Defaults to "dark" (preserves the original look). */
  scheme: ThemeScheme;
  /** True once the persisted scheme has been read from storage (see useTheme). */
  hydrated: boolean;
  setScheme: (scheme: ThemeScheme) => void;
  setHydrated: (hydrated: boolean) => void;
};

export const useThemeStore = create<ThemeStore>((set) => ({
  scheme: "dark",
  hydrated: false,
  setScheme: (scheme) => set({ scheme }),
  setHydrated: (hydrated) => set({ hydrated }),
}));
