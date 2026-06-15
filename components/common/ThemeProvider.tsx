import type { PropsWithChildren } from "react";
import { View } from "react-native";
import { vars } from "nativewind";

import { useThemeStore } from "@/store/themeStore";
import { DARK_VARS, LIGHT_VARS } from "@/theme/tokens";

/**
 * Sets the Aurora CSS variables at the app root via NativeWind's `vars()`, so
 * every `bg-brisk-*` / `text-brisk-*` className resolves to the active theme.
 * Re-renders when the scheme changes, repainting className colors app-wide
 * without touching call sites. JS-prop colors come from useTheme() instead.
 */
export function ThemeProvider({ children }: PropsWithChildren) {
  const scheme = useThemeStore((s) => s.scheme);
  return (
    <View style={[{ flex: 1 }, vars(scheme === "dark" ? DARK_VARS : LIGHT_VARS)]}>{children}</View>
  );
}
