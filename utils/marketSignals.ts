import type { MarketCard } from "@/types/market";

const MIN_PRICE = 0.1;

function toPercent(value: number | undefined, fallback: number): number {
  return Math.max(0, Math.min(100, Math.round((value ?? fallback) * 100)));
}

function safePrice(value: number | undefined, fallback: number): number {
  return Math.max(MIN_PRICE, value ?? fallback);
}

function formatAmount(value: number): string {
  return value.toFixed(2);
}

export function getBinaryMarketSignals(market: MarketCard, stake: number) {
  const yesProbability = toPercent(market.ask, 0.5);
  const noProbability = toPercent(market.bid, 1 - (market.ask ?? 0.5));
  const edge = Math.abs(yesProbability - noProbability);
  const uncertainty = Math.max(0, 100 - edge);
  const leadingSide = yesProbability >= noProbability ? "YES" : "NO";

  const confidenceLabel =
    edge >= 30 ? "High confidence" : edge >= 16 ? "Moderate confidence" : "Close call";
  const uncertaintyLabel =
    uncertainty >= 50
      ? "High uncertainty"
      : uncertainty >= 35
        ? "Balanced market"
        : "Directional market";

  const yesGross = stake / safePrice(market.ask, 0.5);
  const noGross = stake / safePrice(market.bid, 1 - (market.ask ?? 0.5));

  return {
    yesProbability,
    noProbability,
    uncertainty,
    confidenceLabel,
    uncertaintyLabel,
    leadingSide,
    yesGross: formatAmount(yesGross),
    noGross: formatAmount(noGross),
    yesNet: formatAmount(Math.max(0, yesGross - stake)),
    noNet: formatAmount(Math.max(0, noGross - stake)),
  };
}

export function getRangeMarketSignals(market: MarketCard, stake: number) {
  const boundedProbability = toPercent(market.ask, 0.5);
  const outsideProbability = Math.max(0, 100 - boundedProbability);
  const edge = Math.abs(boundedProbability - outsideProbability);
  const uncertainty = Math.max(0, 100 - edge);

  const lower = market.lowerStrike ?? market.strikePrice * 0.97;
  const upper = market.upperStrike ?? market.strikePrice * 1.03;
  const bandPct = ((upper - lower) / Math.max(Math.abs(market.strikePrice), 1e-9)) * 100;
  const bandRiskLabel =
    bandPct <= 2
      ? "Tight band (higher risk)"
      : bandPct <= 5
        ? "Medium band risk"
        : "Wider band (lower risk)";

  const boundedGross = stake / safePrice(market.ask, 0.5);

  return {
    boundedProbability,
    outsideProbability,
    uncertainty,
    bandPct: formatAmount(bandPct),
    bandRiskLabel,
    boundedGross: formatAmount(boundedGross),
    boundedNet: formatAmount(Math.max(0, boundedGross - stake)),
    lower,
    upper,
  };
}
