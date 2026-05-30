export type MarketDirection = "YES" | "NO" | "BOUNDED";
export type MarketCategory = "Assets" | "Crypto" | "Events";
export type MarketKind = "binary" | "range";
export type MarketTimeframe = "Quick" | "Today" | "Week" | "Month";

/**
 * One market on the swipe deck.
 *
 * Binary markets: `kind = "binary"`, `strikePrice` is the strike. User picks
 * YES/NO via swipe.
 *
 * Range markets: `kind = "range"`, `lowerStrike` and `upperStrike` define the
 * band, `strikePrice` is the midpoint (kept populated for components that
 * render a single number). The protocol only sells the BOUNDED side
 * (`predict::mint_range`), so the swipe action is one-sided:
 *   swipe-right → mint BOUNDED, swipe-left → skip.
 */
export type MarketCard = {
  id: string;
  poolId: string;
  oracleId: string;
  asset: string;
  category: MarketCategory;
  question: string;
  summary: string;
  strikePrice: number;
  expiryTimestamp: number;
  kind: MarketKind;
  lowerStrike?: number;
  upperStrike?: number;
  ask?: number;
  bid?: number;
};

export type OracleState = {
  oracleId: string;
  asset?: string;
  status: "ACTIVE" | "INACTIVE" | "PENDING_SETTLEMENT" | "SETTLED";
  settlementPrice?: number;
  expiryTimestamp: number;
  spot?: number;
};
