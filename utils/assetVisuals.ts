/**
 * Per-asset visual identity for swipe cards and history rows. Centralized so
 * binary cards, range cards, position history, and the win/claim modals
 * share the same icon glyph and accent colors.
 *
 * Defined as Tailwind-friendly hex colors so callers can either drop them
 * into `style={{ backgroundColor: ... }}` or into the `className` via the
 * Tailwind config color palette. We keep the surface small — only the assets
 * Predict actively quotes on testnet.
 */
export interface AssetVisual {
  /** Single-character glyph for the asset chip on cards. */
  glyph: string;
  /** Hex accent — used for the card top tint and chip border. */
  accent: string;
  /** Hex tint — slightly translucent over the card background. */
  tint: string;
}

const FALLBACK: AssetVisual = {
  glyph: "★",
  accent: "#56C2FF",
  tint: "rgba(86, 194, 255, 0.10)",
};

const VISUALS: Record<string, AssetVisual> = {
  SUI: { glyph: "S", accent: "#4DA2FF", tint: "rgba(77, 162, 255, 0.10)" },
  BTC: { glyph: "₿", accent: "#F7931A", tint: "rgba(247, 147, 26, 0.10)" },
  ETH: { glyph: "Ξ", accent: "#A77DFF", tint: "rgba(167, 125, 255, 0.10)" },
  SOL: { glyph: "◎", accent: "#00FFA3", tint: "rgba(0, 255, 163, 0.10)" },
  DOGE: { glyph: "Ð", accent: "#C2A633", tint: "rgba(194, 166, 51, 0.12)" },
  HYPE: { glyph: "H", accent: "#33D6A6", tint: "rgba(51, 214, 166, 0.10)" },
  USDC: { glyph: "$", accent: "#2775CA", tint: "rgba(39, 117, 202, 0.10)" },
  WAL: { glyph: "W", accent: "#7FE0A0", tint: "rgba(127, 224, 160, 0.10)" },
  DEEP: { glyph: "D", accent: "#3CE0FF", tint: "rgba(60, 224, 255, 0.10)" },
};

export function getAssetVisual(asset: string | undefined | null): AssetVisual {
  if (!asset) return FALLBACK;
  const key = asset.toUpperCase().replace(/[^A-Z]/g, "");
  return VISUALS[key] ?? FALLBACK;
}
