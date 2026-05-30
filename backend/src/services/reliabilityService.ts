import type { IndexerHealth } from "../indexer/index.js";
import { getClaimCompletionSummary, getSponsorAttemptSummary } from "../indexer/derivedStats.js";

export type ReliabilityStatus = "ok" | "degraded";

export interface ReliabilityThresholds {
  sponsorWindowMs: number;
  sponsorMinAttempts: number;
  sponsorMinSuccessRate: number;
  indexerMaxTickAgeMs: number;
  marketsFeedMaxTickAgeMs: number;
  claimWindowMs: number;
  claimSlaMs: number;
  claimMinSettled: number;
  claimMinCompletionRate: number;
  claimP95MaxMs: number;
}

interface DomainReport<T> {
  status: ReliabilityStatus;
  reasons: string[];
  metrics: T;
}

export interface ReliabilityReport {
  status: ReliabilityStatus;
  generatedAt: string;
  reasons: string[];
  thresholds: ReliabilityThresholds;
  domains: {
    sponsorTransactions: DomainReport<ReturnType<typeof getSponsorAttemptSummary>>;
    indexerFreshness: DomainReport<{
      booted: boolean;
      indexerTickAgeMs: number;
      marketsFeedTickAgeMs: number;
    }>;
    claimCompletionLatency: DomainReport<ReturnType<typeof getClaimCompletionSummary>>;
  };
}

function domainStatus(reasons: string[]): ReliabilityStatus {
  return reasons.length > 0 ? "degraded" : "ok";
}

function pct(value: number): string {
  return `${(value * 100).toFixed(1)}%`;
}

export function buildReliabilityReport(input: {
  thresholds: ReliabilityThresholds;
  indexer: IndexerHealth;
}): ReliabilityReport {
  const { thresholds, indexer } = input;

  const sponsorMetrics = getSponsorAttemptSummary(thresholds.sponsorWindowMs);
  const sponsorReasons: string[] = [];
  if (sponsorMetrics.attempts < thresholds.sponsorMinAttempts) {
    sponsorReasons.push(
      `insufficient sponsor samples (${sponsorMetrics.attempts}/${thresholds.sponsorMinAttempts}) in ${Math.floor(
        thresholds.sponsorWindowMs / 60_000,
      )}m window`,
    );
  } else if (sponsorMetrics.successRate < thresholds.sponsorMinSuccessRate) {
    sponsorReasons.push(
      `sponsor success rate ${pct(sponsorMetrics.successRate)} below ${pct(thresholds.sponsorMinSuccessRate)}`,
    );
  }

  const indexerReasons: string[] = [];
  if (!indexer.booted) indexerReasons.push("indexer not booted");
  if (indexer.lastTickAgeMs < 0 || indexer.lastTickAgeMs > thresholds.indexerMaxTickAgeMs) {
    indexerReasons.push(
      `indexer tick age ${indexer.lastTickAgeMs}ms above ${thresholds.indexerMaxTickAgeMs}ms`,
    );
  }
  if (
    indexer.marketsFeed.lastTickAgeMs < 0 ||
    indexer.marketsFeed.lastTickAgeMs > thresholds.marketsFeedMaxTickAgeMs
  ) {
    indexerReasons.push(
      `markets feed age ${indexer.marketsFeed.lastTickAgeMs}ms above ${thresholds.marketsFeedMaxTickAgeMs}ms`,
    );
  }

  const claimMetrics = getClaimCompletionSummary(thresholds.claimWindowMs, thresholds.claimSlaMs);
  const claimReasons: string[] = [];
  if (claimMetrics.settledCount < thresholds.claimMinSettled) {
    claimReasons.push(
      `insufficient settled sample (${claimMetrics.settledCount}/${thresholds.claimMinSettled}) in ${Math.floor(
        thresholds.claimWindowMs / 3_600_000,
      )}h window`,
    );
  } else {
    if (claimMetrics.completionRate < thresholds.claimMinCompletionRate) {
      claimReasons.push(
        `claim completion rate ${pct(claimMetrics.completionRate)} below ${pct(thresholds.claimMinCompletionRate)}`,
      );
    }
    if (
      claimMetrics.p95LatencyMs !== null &&
      claimMetrics.p95LatencyMs > thresholds.claimP95MaxMs
    ) {
      claimReasons.push(
        `claim p95 latency ${claimMetrics.p95LatencyMs}ms above ${thresholds.claimP95MaxMs}ms`,
      );
    }
  }

  const domains: ReliabilityReport["domains"] = {
    sponsorTransactions: {
      status: domainStatus(sponsorReasons),
      reasons: sponsorReasons,
      metrics: sponsorMetrics,
    },
    indexerFreshness: {
      status: domainStatus(indexerReasons),
      reasons: indexerReasons,
      metrics: {
        booted: indexer.booted,
        indexerTickAgeMs: indexer.lastTickAgeMs,
        marketsFeedTickAgeMs: indexer.marketsFeed.lastTickAgeMs,
      },
    },
    claimCompletionLatency: {
      status: domainStatus(claimReasons),
      reasons: claimReasons,
      metrics: claimMetrics,
    },
  };

  const reasons = [
    ...domains.sponsorTransactions.reasons.map((reason) => `sponsor: ${reason}`),
    ...domains.indexerFreshness.reasons.map((reason) => `indexer: ${reason}`),
    ...domains.claimCompletionLatency.reasons.map((reason) => `claims: ${reason}`),
  ];

  return {
    status: reasons.length > 0 ? "degraded" : "ok",
    generatedAt: new Date().toISOString(),
    reasons,
    thresholds,
    domains,
  };
}
