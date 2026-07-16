/**
 * Brisk's "Aurora" palette, now theme-aware (dark + light).
 *
 * Two channels consume these colors:
 *
 *  1. NativeWind classNames (bg-brisk-*, text-brisk-*). The tailwind.config.js
 *     colors resolve to CSS variables (`rgb(var(--brisk-bg0) / <alpha-value>)`),
 *     and those variables are set per-theme by ThemeProvider via `vars()` (see
 *     DARK_VARS / LIGHT_VARS below). className colors therefore swap with the
 *     theme WITHOUT touching the call sites.
 *
 *  2. RN props that can't take a className — icon `color`, `ActivityIndicator`,
 *     `RefreshControl tintColor`, `placeholderTextColor`, `StatusBar`,
 *     `LinearGradient colors`. React components read the active palette via
 *     `useTheme()` (hooks/useTheme.ts) and use `theme.accent` etc. Non-React
 *     modules can import the static `BRISK` alias (= dark) as a fallback.
 *
 * Brand colors (accent, danger, glow, aurora) are intentionally identical in
 * both themes; only surface/text/border tokens differ.
 */

export type Palette = {
  bg0: string;
  bg1: string;
  bg2: string;
  text: string;
  subtext: string;
  accent: string;
  danger: string;
  border: string;
  borderStrong: string;
  borderSoft: string;
  placeholder: string;
  glow: string;
  /** Brand gradient: a tight emerald ramp (single-hue signature). */
  aurora: readonly [string, string, string];
};

export const DARK: Palette = {
  bg0: "#06090F",
  bg1: "#0E1422",
  bg2: "#161E30",
  text: "#F4F8FB",
  subtext: "#8FA0B5",
  accent: "#00E5A0",
  danger: "#FF5D77",
  border: "#1C2A3A",
  borderStrong: "#2C3E55",
  borderSoft: "#27415A",
  placeholder: "#5A6B7B",
  glow: "#00E5A0",
  aurora: ["#00E5A0", "#34E7C0", "#17C79C"],
};

export const LIGHT: Palette = {
  bg0: "#F6F8FB",
  bg1: "#FFFFFF",
  bg2: "#EDF1F6",
  text: "#0B1220",
  subtext: "#5A6B7B",
  accent: "#00E5A0",
  danger: "#FF5D77",
  border: "#E2E8F0",
  borderStrong: "#CBD5E1",
  borderSoft: "#D8E0EA",
  placeholder: "#94A3B8",
  glow: "#00E5A0",
  aurora: ["#00E5A0", "#34E7C0", "#17C79C"],
};

/**
 * CSS-variable maps for `vars()` (NativeWind). Colors with an `<alpha-value>`
 * slot in tailwind.config.js are space-separated RGB *channels*; the two
 * baked-alpha glass tokens are full color strings (referenced without alpha).
 */
export const DARK_VARS = {
  "--brisk-bg0": "6 9 15",
  "--brisk-bg1": "14 20 34",
  "--brisk-bg2": "22 30 48",
  "--brisk-text": "244 248 251",
  "--brisk-subtext": "143 160 181",
  "--brisk-accent": "0 229 160",
  "--brisk-danger": "255 93 119",
  "--brisk-border": "28 42 58",
  "--brisk-borderStrong": "44 62 85",
  "--brisk-borderSoft": "39 65 90",
  "--brisk-placeholder": "90 107 123",
  "--brisk-aurora1": "0 229 160",
  "--brisk-aurora2": "52 231 192",
  "--brisk-aurora3": "23 199 156",
  "--brisk-glow": "0 229 160",
  "--brisk-glass": "rgba(20,28,46,0.55)",
  "--brisk-glassBorder": "rgba(255,255,255,0.08)",
} as const;

export const LIGHT_VARS = {
  "--brisk-bg0": "246 248 251",
  "--brisk-bg1": "255 255 255",
  "--brisk-bg2": "237 241 246",
  "--brisk-text": "11 18 32",
  "--brisk-subtext": "90 107 123",
  "--brisk-accent": "0 229 160",
  "--brisk-danger": "255 93 119",
  "--brisk-border": "226 232 240",
  "--brisk-borderStrong": "203 213 225",
  "--brisk-borderSoft": "216 224 234",
  "--brisk-placeholder": "148 163 184",
  "--brisk-aurora1": "0 229 160",
  "--brisk-aurora2": "52 231 192",
  "--brisk-aurora3": "23 199 156",
  "--brisk-glow": "0 229 160",
  "--brisk-glass": "rgba(255,255,255,0.65)",
  "--brisk-glassBorder": "rgba(0,0,0,0.06)",
} as const;

/**
 * Static fallback (= dark) for non-React modules that can't call `useTheme()`.
 * React components should prefer `useTheme()` so colors react to the toggle.
 */
export const BRISK = DARK;
