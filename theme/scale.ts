/**
 * Role-based sizing + motion tokens — the single source of truth for icon sizes,
 * hero-numeral text tiers, the section-label style, and entrance cadence. Colors
 * and spacing keep their existing channels (theme/tokens.ts + Tailwind classes);
 * this only fixes the dimensions/roles that had drifted across screens so the
 * same role looks identical everywhere.
 */

import { BRISK } from "./tokens";

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

/** Standard Reanimated entrance/transition durations (ms). */
export const DURATION = { fast: 300, base: 400, slow: 500 } as const;

/**
 * Delay for the i-th sibling in a staggered entrance, capped so long lists don't
 * accumulate a visible lag on the tail. Use with FadeInDown/FadeIn `.delay()`.
 */
export const staggerDelay = (i: number, cap = 8) => Math.min(i, cap) * STAGGER_MS;

/** Shared section-label className (uppercase, tracked mono caps over a content group). */
export const SECTION_LABEL =
  "text-xs uppercase tracking-[1.5px] text-brisk-subtext font-mono-medium";

/**
 * Hero eyebrow — the fatter sibling of SECTION_LABEL that sits above a hero
 * numeral (Wallet / Save / Pro balance). Same mono caps, one step larger.
 */
export const HERO_EYEBROW =
  "text-sm uppercase tracking-[1.5px] text-brisk-subtext font-mono-medium";

/** Max content width for centered single-column screens (was `max-w-[360px]`). */
export const CONTENT_MAX = 360;

/**
 * Amount-input sizes (explicit fontSize/lineHeight — see HERO note). `hero` sits
 * just under HERO.focused (48) so a full-screen amount field reads as hero
 * without colliding with the review numeral; `compact` is the inline Send size.
 */
export const AMOUNT_FIELD = {
  hero: { fontSize: 44, lineHeight: 50 },
  compact: { fontSize: 28, lineHeight: 34 },
} as const;

/**
 * Shared shadow tokens — dedupes the inline shadow magic numbers that had drifted
 * between PrimaryButton (CTA glow) and GlassCard (ambient lift). `glow` uses
 * `BRISK.glow` (theme-identical brand color, so the static import is correct).
 */
export const SHADOW = {
  /** Primary CTA glow. */
  glow: {
    shadowColor: BRISK.glow,
    shadowOpacity: 0.32,
    shadowRadius: 24,
    shadowOffset: { width: 0, height: 8 },
    elevation: 10,
  },
  /** Ambient card lift (iOS; no Android elevation to keep glass flat). */
  card: {
    shadowColor: BRISK.glow,
    shadowOpacity: 0.18,
    shadowRadius: 22,
    shadowOffset: { width: 0, height: 10 },
  },
} as const;

/** Border-radius scale for JS-set radii (most radii stay Tailwind `rounded-*`). */
export const RADII = { sm: 8, md: 12, lg: 16, xl: 20, card: 24, pill: 9999 } as const;
