import { useCallback, useEffect } from "react";

import { trackEvent } from "@/services/analytics/analyticsService";
import {
  loadThemeScheme,
  saveThemeScheme,
  type ThemeScheme,
} from "@/services/storage/prefsStorage";
import { useThemeStore } from "@/store/themeStore";
import { DARK, LIGHT, type Palette } from "@/theme/tokens";

/**
 * Color scheme (dark vs light). Mirrors useAppMode's restore-once idiom: the
 * persisted scheme is read into the store on first mount, gated by a `hydrated`
 * flag so the root layout can hold the splash until the scheme is known (avoids
 * a flash of the wrong theme on warm starts). `setScheme` updates + persists.
 */
export function useThemeMode() {
  const { scheme, hydrated, setScheme: setSchemeState, setHydrated } = useThemeStore();

  useEffect(() => {
    let mounted = true;
    if (hydrated) return;
    loadThemeScheme()
      .then((restored) => {
        if (!mounted) return;
        setSchemeState(restored);
        setHydrated(true);
      })
      .catch(() => {
        if (!mounted) return;
        setHydrated(true);
      });
    return () => {
      mounted = false;
    };
  }, [hydrated, setHydrated, setSchemeState]);

  const setScheme = useCallback(
    (next: ThemeScheme) => {
      setSchemeState(next);
      void saveThemeScheme(next);
      void trackEvent("theme_changed", undefined, { scheme: next });
    },
    [setSchemeState],
  );

  const toggle = useCallback(() => {
    setScheme(scheme === "dark" ? "light" : "dark");
  }, [scheme, setScheme]);

  return { scheme, hydrated, setScheme, toggle };
}

/**
 * The active palette for RN props that can't take a className (icon colors,
 * gradients, RefreshControl tint, StatusBar, etc.). className colors swap on
 * their own via ThemeProvider's CSS variables — use this only for JS props.
 */
export function useTheme(): Palette {
  const scheme = useThemeStore((s) => s.scheme);
  return scheme === "dark" ? DARK : LIGHT;
}
