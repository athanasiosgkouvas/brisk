import type { MarketCard, MarketCategory } from "@/types/market";

type MarketSeed = {
  asset: string;
  category: MarketCategory;
  strikePrice: number;
  summary: string;
};

/**
 * Mock catalog used in demo mode and as the fallback when the indexer is
 * empty. The asset list mirrors what Block Scholes typically publishes a
 * volatility surface for on the Predict testnet.
 */
const MARKET_SEEDS: MarketSeed[] = [
  {
    asset: "BTC",
    category: "Crypto",
    strikePrice: 102_500,
    summary: "Momentum over the next candle.",
  },
  {
    asset: "ETH",
    category: "Crypto",
    strikePrice: 4_100,
    summary: "Ethereum reaction into the next expiry.",
  },
  {
    asset: "SOL",
    category: "Crypto",
    strikePrice: 240,
    summary: "Solana follow-through after the open.",
  },
  {
    asset: "SUI",
    category: "Crypto",
    strikePrice: 2.15,
    summary: "Sui volatility around the next print.",
  },
  {
    asset: "AVAX",
    category: "Crypto",
    strikePrice: 38,
    summary: "Avalanche move into the next window.",
  },
  {
    asset: "LINK",
    category: "Crypto",
    strikePrice: 19.5,
    summary: "Chainlink continuation watch.",
  },
  {
    asset: "ARB",
    category: "Crypto",
    strikePrice: 1.05,
    summary: "Arbitrum positioning into expiry.",
  },
  {
    asset: "OP",
    category: "Crypto",
    strikePrice: 1.42,
    summary: "Optimism flow over the next window.",
  },
  {
    asset: "GOLD",
    category: "Assets",
    strikePrice: 3_320,
    summary: "Gold intraday breakout watch.",
  },
  {
    asset: "OIL",
    category: "Assets",
    strikePrice: 81.5,
    summary: "Crude trend continuation into expiry.",
  },
  {
    asset: "NASDAQ",
    category: "Assets",
    strikePrice: 18_550,
    summary: "Index strength after the latest tech tape.",
  },
  {
    asset: "SPX",
    category: "Assets",
    strikePrice: 5_980,
    summary: "Broad-market direction over the next move.",
  },
  {
    asset: "CPI",
    category: "Events",
    strikePrice: 3.2,
    summary: "Macro surprise versus current consensus.",
  },
  {
    asset: "FED",
    category: "Events",
    strikePrice: 4.5,
    summary: "Policy tone implied by the next release.",
  },
  {
    asset: "ETF",
    category: "Events",
    strikePrice: 1,
    summary: "Approval odds implied by the current tape.",
  },
];

type Bucket = { label: string; offsetMs: number };
const BUCKETS: Bucket[] = [
  { label: "5m", offsetMs: 5 * 60_000 },
  { label: "12h", offsetMs: 12 * 60 * 60_000 },
  { label: "3d", offsetMs: 3 * 24 * 60 * 60_000 },
  { label: "14d", offsetMs: 14 * 24 * 60 * 60_000 },
];

export function getDeterministicMockMarkets(): MarketCard[] {
  const now = Date.now();
  const out: MarketCard[] = [];

  MARKET_SEEDS.forEach((seed, seedIndex) => {
    BUCKETS.forEach((bucket, bucketIndex) => {
      const ask = Number((0.42 + ((seedIndex + bucketIndex) % 5) * 0.04).toFixed(2));
      const bid = Number((1 - ask).toFixed(2));
      const expiry = now + bucket.offsetMs + seedIndex * 20_000 + bucketIndex * 5_000;

      // Binary card.
      const binaryQuestion =
        seed.category === "Events"
          ? `${seed.asset} resolves above ${seed.strikePrice} by ${bucket.label}?`
          : `${seed.asset} > ${seed.strikePrice.toLocaleString()} in ${bucket.label}?`;
      out.push({
        id: `mock-${seed.asset.toLowerCase()}-bin-${bucket.label}`,
        poolId: `mock-pool-${seed.asset.toLowerCase()}`,
        oracleId: `mock-oracle-${seed.asset.toLowerCase()}-${bucket.label}`,
        asset: seed.asset,
        category: seed.category,
        question: binaryQuestion,
        summary: seed.summary,
        strikePrice: seed.strikePrice,
        expiryTimestamp: expiry,
        kind: "binary",
        ask,
        bid,
      });

      // Range card for every other seed × bucket, so the demo deck has plenty
      // of range content but doesn't double-up every market.
      if ((seedIndex + bucketIndex) % 2 === 0) {
        const halfBand = seed.strikePrice * 0.05;
        const lower = Math.max(0, Number((seed.strikePrice - halfBand).toFixed(4)));
        const upper = Number((seed.strikePrice + halfBand).toFixed(4));
        const rangeAsk = Number(Math.min(0.85, Math.max(0.15, ask + 0.05)).toFixed(2));
        out.push({
          id: `mock-${seed.asset.toLowerCase()}-rng-${bucket.label}`,
          poolId: `mock-pool-${seed.asset.toLowerCase()}-rng`,
          oracleId: `mock-oracle-${seed.asset.toLowerCase()}-${bucket.label}`,
          asset: seed.asset,
          category: seed.category,
          question: `${seed.asset} stays between ${lower.toLocaleString()} – ${upper.toLocaleString()} in ${bucket.label}?`,
          summary: `${seed.asset} range play — vault is the OUTSIDE counterparty.`,
          strikePrice: seed.strikePrice,
          expiryTimestamp: expiry,
          kind: "range",
          lowerStrike: lower,
          upperStrike: upper,
          ask: rangeAsk,
          bid: Number((1 - rangeAsk).toFixed(2)),
        });
      }
    });
  });

  return out.sort((a, b) => a.expiryTimestamp - b.expiryTimestamp);
}
