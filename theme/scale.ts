/**
 * Role-based sizing + motion tokens — the single source of truth for icon sizes,
 * hero-numeral text tiers, the section-label style, and entrance cadence. Colors
 * and spacing keep their existing channels (theme/tokens.ts + Tailwind classes);
 * this only fixes the dimensions/roles that had drifted across screens so the
 * same role looks identical everywhere.
 */

/** Icon sizes by role. */
export const ICON = {
  /** Leading icon in a list row / card. */
  row: 22,
  /** Modal header glyphs (close X, etc.). */
  header: 24,
  /** Standalone hero / section icon. */
  hero: 28,
  /** Inline secondary action (copy / share / edit inside a row or button). */
  inlineAction: 18,
} as const;

/**
 * Hero numeral sizes (explicit fontSize/lineHeight — NativeWind's preset caps the
 * `text-*` scale at 6xl, so we set these directly to stay reliable + tunable).
 * Pair with the `font-inter-extrabold` family class on the element.
 */
export const HERO = {
  /** Primary balance — Wallet / Pro dashboard total. */
  primary: { fontSize: 72, lineHeight: 78 },
  /** Focused amount on a review / await screen (pay, charge). */
  focused: { fontSize: 48, lineHeight: 54 },
  /** Confirmation amount on a success screen. */
  confirm: { fontSize: 40, lineHeight: 46 },
} as const;

export type HeroTier = keyof typeof HERO;

/** Entrance stagger between sibling sections / cards (ms). */
export const STAGGER_MS = 60;

/** Shared section-label className (uppercase, tracked mono caps over a content group). */
export const SECTION_LABEL =
  "text-xs uppercase tracking-[1.5px] text-brisk-subtext font-mono-medium";
