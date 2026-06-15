import { useSafeAreaInsets } from "react-native-safe-area-context";

/** Height of the floating pill tab bar (see app/(tabs)/_layout.tsx). */
export const FLOATING_TAB_BAR_HEIGHT = 68;

/**
 * Bottom padding a scrollable tab screen must reserve so its last rows clear the
 * floating pill tab bar instead of hiding behind it. Mirrors the bar's geometry
 * exactly: its bottom offset (max(safe-area inset, 16) + 12) + the bar height +
 * a breathing gap. Use on every (tabs) ScrollView's contentContainerStyle.
 */
export function useTabBarClearance(gap = 16): number {
  const insets = useSafeAreaInsets();
  return Math.max(insets.bottom, 16) + 12 + FLOATING_TAB_BAR_HEIGHT + gap;
}
