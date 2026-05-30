/**
 * Themed market bundles — curated weekly content surfaces.
 *
 * v1 is a static config. Each theme resolves to a set of currently-active
 * MarketCards at query time by filtering oracle_snapshots through the
 * theme's selectors. Themes auto-expire after their endMs.
 *
 * Add a new theme = append an entry below. The marketing copy and curation
 * is the value; the engine is generic.
 */
import { getActiveMarkets, type ActiveMarket } from "./derivedStats.js";

export interface ThemeConfig {
  id: string;
  name: string;
  blurb: string;
  emoji: string;
  assets: string[];
  kinds: ("binary" | "range")[];
  buckets: ("quick" | "today" | "week" | "month")[];
  startMs: number;
  endMs: number;
}

export interface ResolvedTheme extends ThemeConfig {
  marketIds: string[];
  marketCount: number;
}

// One full year of "always-on" weekly content. Replace with rotating themes
// from a DB once curation tools exist.
const FOREVER_END = Date.now() + 365 * 24 * 60 * 60_000;
const NOW = Date.now();

export const THEMES: ThemeConfig[] = [
  {
    id: "crypto-week",
    name: "Crypto Week",
    blurb: "BTC, ETH, SUI plays settling within the next 7 days.",
    emoji: "🪙",
    assets: ["BTC", "ETH", "SUI"],
    kinds: ["binary", "range"],
    buckets: ["week"],
    startMs: NOW,
    endMs: FOREVER_END,
  },
  {
    id: "quick-fire",
    name: "Quick-Fire",
    blurb: "Sub-1h markets across every Block Scholes asset.",
    emoji: "⚡",
    assets: [],
    kinds: ["binary", "range"],
    buckets: ["quick"],
    startMs: NOW,
    endMs: FOREVER_END,
  },
  {
    id: "alts-vol",
    name: "Alts Vol",
    blurb: "Range plays on smaller-cap altcoins where the vault takes the OUTSIDE side.",
    emoji: "📐",
    assets: ["SOL", "AVAX", "LINK", "ARB", "OP"],
    kinds: ["range"],
    buckets: ["today", "week"],
    startMs: NOW,
    endMs: FOREVER_END,
  },
  {
    id: "macro-watch",
    name: "Macro Watch",
    blurb: "Macro event markets — CPI, FED, ETF approvals.",
    emoji: "📈",
    assets: ["CPI", "FED", "ETF", "ELECTION"],
    kinds: ["binary"],
    buckets: ["week", "month"],
    startMs: NOW,
    endMs: FOREVER_END,
  },
];

export function getActiveThemes(): ResolvedTheme[] {
  const now = Date.now();
  return THEMES.filter((t) => t.startMs <= now && t.endMs >= now).map((theme) => {
    // Union markets across the theme's buckets, then filter by assets + kinds.
    const bucketed: ActiveMarket[] = theme.buckets.flatMap((bucket) =>
      getActiveMarkets({ bucket, limit: 200 }),
    );
    // Dedupe by id (different buckets may return overlapping cards).
    const byId = new Map<string, ActiveMarket>();
    for (const m of bucketed) byId.set(m.id, m);

    const assetSet = new Set(theme.assets.map((a) => a.toUpperCase()));
    const kindSet = new Set(theme.kinds);

    const matched = [...byId.values()].filter((m) => {
      if (!kindSet.has(m.kind)) return false;
      if (assetSet.size > 0 && !assetSet.has(m.asset.toUpperCase())) return false;
      return true;
    });

    return {
      ...theme,
      marketIds: matched.map((m) => m.id),
      marketCount: matched.length,
    };
  });
}
