import { getSponsorshipUsage, recordSponsorship } from "../indexer/derivedStats.js";

export class SponsorshipLimitError extends Error {
  readonly limit: number;
  readonly used: number;
  constructor(limit: number, used: number) {
    super(`Daily sponsorship limit reached (${used}/${limit}).`);
    this.name = "SponsorshipLimitError";
    this.limit = limit;
    this.used = used;
  }
}

export function getDailyLimit(): number {
  const raw = Number(process.env.SPONSORSHIP_DAILY_LIMIT_TX_COUNT ?? 50);
  return Number.isFinite(raw) && raw > 0 ? Math.floor(raw) : 50;
}

/**
 * Throws SponsorshipLimitError if the sender is over their 24h sponsored-tx cap.
 * Used by /api/sponsor before calling EnokiClient.
 */
export function assertWithinDailyLimit(sender: string): void {
  const limit = getDailyLimit();
  const usage = getSponsorshipUsage(sender, limit);
  if (usage.usedCount >= limit) {
    throw new SponsorshipLimitError(limit, usage.usedCount);
  }
}

/**
 * Persist a single sponsored-tx record. Called after EnokiClient returns a digest.
 */
export function logSponsorship(digest: string, sender: string): void {
  recordSponsorship(digest, sender);
}
