/**
 * Single source of truth for Brisk's "Aurora" palette at the JS/prop level.
 *
 * NativeWind handles className-based color (bg-brisk-*, text-brisk-*), but many
 * RN props can't take classNames — icon `color`, `ActivityIndicator color`,
 * `RefreshControl tintColor`, `placeholderTextColor`, `StatusBar`, and
 * `LinearGradient colors`. Use BRISK.* there so the values stay in lockstep with
 * tailwind.config.js (mirror any change in both).
 */
export const BRISK = {
  bg0: "#060912",
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
  glow: "#2E8FFF",
  /** Brand gradient: emerald → blue → violet. */
  aurora: ["#00E5A0", "#2E8FFF", "#8B5CF6"],
} as const;
