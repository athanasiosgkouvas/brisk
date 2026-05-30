import { getDb } from "./db.js";

/**
 * Pure SQL views over the indexer cache. Nothing here mutates state.
 * Callers expose these via HTTP routes in server.ts.
 */

export interface UserStats {
  totalPredictions: number;
  wins: number;
  losses: number;
  pending: number;
  winRate: number;
  currentStreak: number;
  longestStreak: number;
  totalBetMicro: number;
  totalPayoutMicro: number;
}

export function getUserStats(sender: string): UserStats {
  const db = getDb();
  const agg = db
    .prepare(
      `SELECT
         COUNT(*)                                                     AS total,
         SUM(CASE WHEN settled_outcome = 'WIN'  THEN 1 ELSE 0 END)    AS wins,
         SUM(CASE WHEN settled_outcome = 'LOSS' THEN 1 ELSE 0 END)    AS losses,
         SUM(CASE WHEN settled_outcome IS NULL  THEN 1 ELSE 0 END)    AS pending,
         COALESCE(SUM(bet_size), 0)                                   AS total_bet,
         COALESCE(SUM(CASE WHEN redeemed_amount IS NOT NULL THEN redeemed_amount ELSE 0 END), 0)
                                                                      AS total_payout
       FROM positions WHERE sender = ?`,
    )
    .get(sender) as {
    total: number;
    wins: number;
    losses: number;
    pending: number;
    total_bet: number;
    total_payout: number;
  };

  // Streak: walk settled positions most-recent-first.
  const settled = db
    .prepare(
      `SELECT settled_outcome FROM positions
         WHERE sender = ? AND settled_outcome IS NOT NULL
         ORDER BY timestamp_ms DESC`,
    )
    .all(sender) as { settled_outcome: string }[];

  let currentStreak = 0;
  for (const row of settled) {
    if (row.settled_outcome === "WIN") currentStreak++;
    else break;
  }

  // Longest streak: forward walk in chronological order.
  let longestStreak = 0;
  let run = 0;
  const chrono = [...settled].reverse();
  for (const row of chrono) {
    if (row.settled_outcome === "WIN") {
      run++;
      if (run > longestStreak) longestStreak = run;
    } else {
      run = 0;
    }
  }

  const settledTotal = agg.wins + agg.losses;
  // Percentage (0-100) to match the in-app PortfolioStats convention.
  const winRate = settledTotal > 0 ? (agg.wins / settledTotal) * 100 : 0;

  return {
    totalPredictions: agg.total,
    wins: agg.wins,
    losses: agg.losses,
    pending: agg.pending,
    winRate,
    currentStreak,
    longestStreak,
    totalBetMicro: agg.total_bet,
    totalPayoutMicro: agg.total_payout,
  };
}

export interface PositionRow {
  digest: string;
  sender: string;
  managerId: string | null;
  oracleId: string;
  expiry: number;
  kind: string;
  strike: number | null;
  isUp: number | null;
  lowerStrike: number | null;
  upperStrike: number | null;
  direction: string | null;
  quantity: number;
  betSize: number;
  maxPayout: number | null;
  asset: string | null;
  timestampMs: number;
  redeemedDigest: string | null;
  redeemedAmount: number | null;
  redeemedAtMs: number | null;
  settledOutcome: string | null;
  settledAtMs: number | null;
  settlementPrice: number | null;
}

export function getUserPositions(
  sender: string,
  status: "pending" | "settled" | "all" = "all",
  limit = 50,
): PositionRow[] {
  const db = getDb();
  let where = "sender = ?";
  if (status === "pending") where += " AND settled_outcome IS NULL";
  if (status === "settled") where += " AND settled_outcome IS NOT NULL";

  const rows = db
    .prepare(
      `SELECT digest, sender, manager_id, oracle_id, expiry, kind, strike, is_up,
              lower_strike, upper_strike, direction, quantity, bet_size,
              max_payout, asset, timestamp_ms,
              redeemed_digest, redeemed_amount, redeemed_at_ms, settled_outcome, settled_at_ms, settlement_price
         FROM positions
        WHERE ${where}
        ORDER BY timestamp_ms DESC
        LIMIT ?`,
    )
    .all(sender, Math.min(limit, 500)) as Record<string, unknown>[];

  return rows.map(rowToPosition);
}

function rowToPosition(r: Record<string, unknown>): PositionRow {
  return {
    digest: r.digest as string,
    sender: r.sender as string,
    managerId: (r.manager_id as string | null) ?? null,
    oracleId: r.oracle_id as string,
    expiry: r.expiry as number,
    kind: r.kind as string,
    strike: (r.strike as number | null) ?? null,
    isUp: (r.is_up as number | null) ?? null,
    lowerStrike: (r.lower_strike as number | null) ?? null,
    upperStrike: (r.upper_strike as number | null) ?? null,
    direction: (r.direction as string | null) ?? null,
    quantity: r.quantity as number,
    betSize: r.bet_size as number,
    maxPayout: (r.max_payout as number | null) ?? null,
    asset: (r.asset as string | null) ?? null,
    timestampMs: r.timestamp_ms as number,
    redeemedDigest: (r.redeemed_digest as string | null) ?? null,
    redeemedAmount: (r.redeemed_amount as number | null) ?? null,
    redeemedAtMs: (r.redeemed_at_ms as number | null) ?? null,
    settledOutcome: (r.settled_outcome as string | null) ?? null,
    settledAtMs: (r.settled_at_ms as number | null) ?? null,
    settlementPrice: (r.settlement_price as number | null) ?? null,
  };
}

export interface LeaderRow {
  sender: string;
  wins: number;
  totalPayoutMicro: number;
  totalBetMicro: number;
}

export interface RetentionQuestView {
  id: "streak" | "weekly-volume" | "weekly-variety";
  title: string;
  description: string;
  progress: number;
  target: number;
  completed: boolean;
  rewardLabel: string;
  responsibleNote: string;
}

export interface SocialRetentionSummary {
  bucket: "day" | "week" | "month" | "all";
  leaderboardRank: number | null;
  leaderboardTotal: number;
  topLeaders: LeaderRow[];
  coachingMessage: string;
  responsibleReminder: string;
  pendingClaimCount: number;
  referralCode: string;
  referralShareText: string;
  quests: RetentionQuestView[];
}

export function getLeaderboard(
  bucket: "day" | "week" | "month" | "all" = "week",
  limit = 50,
): LeaderRow[] {
  const db = getDb();
  const since = bucketStart(bucket);
  const rows = db
    .prepare(
      `SELECT sender,
              SUM(CASE WHEN settled_outcome = 'WIN' THEN 1 ELSE 0 END) AS wins,
              COALESCE(SUM(redeemed_amount), 0) AS total_payout,
              COALESCE(SUM(bet_size), 0) AS total_bet
         FROM positions
        WHERE timestamp_ms >= ?
        GROUP BY sender
        ORDER BY wins DESC, total_payout DESC
        LIMIT ?`,
    )
    .all(since, Math.min(limit, 500)) as {
    sender: string;
    wins: number;
    total_payout: number;
    total_bet: number;
  }[];

  return rows.map((r) => ({
    sender: r.sender,
    wins: r.wins,
    totalPayoutMicro: r.total_payout,
    totalBetMicro: r.total_bet,
  }));
}

function makeReferralCode(sender: string): string {
  const condensed = sender.replace(/^0x/i, "").toUpperCase();
  return `FATHOM-${condensed.slice(0, 6).padEnd(6, "X")}`;
}

function buildCoachingMessage(input: {
  rank: number | null;
  weeklyPredictions: number;
  currentStreak: number;
  pendingClaims: number;
}): string {
  if (input.pendingClaims > 0) {
    return `You have ${input.pendingClaims} settled win${input.pendingClaims === 1 ? "" : "s"} ready to claim. Lock in the result before opening new trades.`;
  }
  if (input.rank !== null && input.rank <= 10) {
    return `You're in this week's top ${input.rank}. Keep position sizing steady and protect the momentum.`;
  }
  if (input.currentStreak >= 2) {
    return `You're on a ${input.currentStreak}-win streak. A small, deliberate trade can keep the run healthy.`;
  }
  if (input.weeklyPredictions === 0) {
    return "Set one small prediction goal this week and check back after settlement.";
  }
  return "You're building consistency. Focus on one quality setup at a time.";
}

export function getSocialRetentionSummary(
  sender: string,
  bucket: "day" | "week" | "month" | "all" = "week",
): SocialRetentionSummary {
  const db = getDb();
  const weeklySince = bucketStart("week");
  const stats = getUserStats(sender);
  const leaderboard = getLeaderboard(bucket, 500);
  const leaderboardRank =
    leaderboard.findIndex((entry) => entry.sender.toLowerCase() === sender.toLowerCase()) + 1 ||
    null;

  const weeklyRow = db
    .prepare(
      `SELECT
         COUNT(*) AS prediction_count,
         COUNT(DISTINCT asset) AS unique_asset_count
       FROM positions
       WHERE sender = ? AND timestamp_ms >= ?`,
    )
    .get(sender, weeklySince) as { prediction_count: number; unique_asset_count: number };

  const pendingClaimsRow = db
    .prepare(
      `SELECT COUNT(*) AS pending_claims
         FROM positions
        WHERE sender = ?
          AND settled_outcome = 'WIN'
          AND redeemed_digest IS NULL`,
    )
    .get(sender) as { pending_claims: number };

  const weeklyPredictions = weeklyRow.prediction_count ?? 0;
  const weeklyVariety = weeklyRow.unique_asset_count ?? 0;
  const pendingClaims = pendingClaimsRow.pending_claims ?? 0;
  const streakTarget = stats.currentStreak >= 3 ? 5 : 3;
  const referralCode = makeReferralCode(sender);

  const quests: RetentionQuestView[] = [
    {
      id: "streak",
      title: "Streak builder",
      description: `Reach a ${streakTarget}-win streak.`,
      progress: Math.min(stats.currentStreak, streakTarget),
      target: streakTarget,
      completed: stats.currentStreak >= streakTarget,
      rewardLabel: "Leaderboard visibility boost",
      responsibleNote: "Cold streaks happen—pause and reset instead of chasing losses.",
    },
    {
      id: "weekly-volume",
      title: "Weekly consistency",
      description: "Complete 5 predictions this week.",
      progress: Math.min(weeklyPredictions, 5),
      target: 5,
      completed: weeklyPredictions >= 5,
      rewardLabel: "Consistency badge",
      responsibleNote: "Use small, planned position sizes throughout the week.",
    },
    {
      id: "weekly-variety",
      title: "Market explorer",
      description: "Trade 3 different assets this week.",
      progress: Math.min(weeklyVariety, 3),
      target: 3,
      completed: weeklyVariety >= 3,
      rewardLabel: "Theme explorer badge",
      responsibleNote: "Diversify ideas, not risk—stick to your personal budget.",
    },
  ];

  return {
    bucket,
    leaderboardRank,
    leaderboardTotal: leaderboard.length,
    topLeaders: leaderboard.slice(0, 5),
    coachingMessage: buildCoachingMessage({
      rank: leaderboardRank,
      weeklyPredictions,
      currentStreak: stats.currentStreak,
      pendingClaims: pendingClaims,
    }),
    responsibleReminder:
      "Keep it fun: set a budget before each session and take breaks after losses.",
    pendingClaimCount: pendingClaims,
    referralCode,
    referralShareText: `Join me on Fathom with code ${referralCode}. Gasless signup + fast mobile predictions. Please play responsibly and set a budget first.`,
    quests,
  };
}

function bucketStart(bucket: "day" | "week" | "month" | "all"): number {
  if (bucket === "all") return 0;
  const now = Date.now();
  const ms = bucket === "day" ? 86_400_000 : bucket === "week" ? 7 * 86_400_000 : 30 * 86_400_000;
  return now - ms;
}

export interface SponsorshipUsage {
  usedCount: number;
  dailyLimit: number;
  remaining: number;
  windowMs: number;
}

export function getSponsorshipUsage(sender: string, dailyLimit: number): SponsorshipUsage {
  const db = getDb();
  const windowMs = 24 * 60 * 60 * 1_000;
  const since = Date.now() - windowMs;
  const row = db
    .prepare(`SELECT COUNT(*) AS used FROM sponsorship_log WHERE sender = ? AND timestamp_ms >= ?`)
    .get(sender, since) as { used: number };
  return {
    usedCount: row.used,
    dailyLimit,
    remaining: Math.max(dailyLimit - row.used, 0),
    windowMs,
  };
}

/* ─── Observability ────────────────────────────────────────────────────── */

export interface CursorAge {
  name: string;
  txDigest: string | null;
  eventSeq: number | null;
  updatedAt: number;
  ageMs: number;
}

export function getCursorAges(): CursorAge[] {
  const rows = getDb()
    .prepare(`SELECT name, tx_digest, event_seq, updated_at FROM cursor_state ORDER BY name`)
    .all() as {
    name: string;
    tx_digest: string | null;
    event_seq: number | null;
    updated_at: number;
  }[];
  const now = Date.now();
  return rows.map((r) => ({
    name: r.name,
    txDigest: r.tx_digest,
    eventSeq: r.event_seq,
    updatedAt: r.updated_at,
    ageMs: now - r.updated_at,
  }));
}

export interface EventIngestionFilterStatus {
  filterName: string;
  cursorUpdatedAtMs: number | null;
  cursorAgeMs: number | null;
  lastProcessedAtMs: number | null;
  lastProcessedAgeMs: number | null;
  lastProcessedChainTsMs: number | null;
  processingDelayMs: number | null;
  processedCount: number;
  failureCount: number;
  lastError: string | null;
  lastErrorAtMs: number | null;
  lastErrorTxDigest: string | null;
  lastErrorEventSeq: number | null;
}

export interface EventIngestionStatus {
  generatedAtMs: number;
  filters: EventIngestionFilterStatus[];
}

export function getEventIngestionStatus(filterNames: string[]): EventIngestionStatus {
  const db = getDb();
  const now = Date.now();
  const out: EventIngestionFilterStatus[] = [];

  const readCursor = db.prepare(`SELECT updated_at FROM cursor_state WHERE name = ?`);
  const readState = db.prepare(
    `SELECT
       last_processed_at_ms,
       last_processed_chain_ts,
       processed_count,
       failure_count,
       last_error,
       last_error_at_ms,
       last_error_tx_digest,
       last_error_event_seq
     FROM event_ingestion_state
     WHERE filter_name = ?`,
  );

  for (const filterName of filterNames) {
    const cursor = readCursor.get(filterName) as { updated_at: number } | undefined;
    const state = readState.get(filterName) as
      | {
          last_processed_at_ms: number | null;
          last_processed_chain_ts: number | null;
          processed_count: number;
          failure_count: number;
          last_error: string | null;
          last_error_at_ms: number | null;
          last_error_tx_digest: string | null;
          last_error_event_seq: number | null;
        }
      | undefined;

    const cursorUpdatedAtMs = cursor?.updated_at ?? null;
    const lastProcessedAtMs = state?.last_processed_at_ms ?? null;
    out.push({
      filterName,
      cursorUpdatedAtMs,
      cursorAgeMs: cursorUpdatedAtMs === null ? null : now - cursorUpdatedAtMs,
      lastProcessedAtMs,
      lastProcessedAgeMs: lastProcessedAtMs === null ? null : now - lastProcessedAtMs,
      lastProcessedChainTsMs: state?.last_processed_chain_ts ?? null,
      processingDelayMs:
        cursorUpdatedAtMs === null || lastProcessedAtMs === null
          ? null
          : Math.max(cursorUpdatedAtMs - lastProcessedAtMs, 0),
      processedCount: state?.processed_count ?? 0,
      failureCount: state?.failure_count ?? 0,
      lastError: state?.last_error ?? null,
      lastErrorAtMs: state?.last_error_at_ms ?? null,
      lastErrorTxDigest: state?.last_error_tx_digest ?? null,
      lastErrorEventSeq: state?.last_error_event_seq ?? null,
    });
  }

  return {
    generatedAtMs: now,
    filters: out,
  };
}

export interface AdminStats {
  positions: { total: number; pending: number; settled: number; redeemed: number };
  oracleSnapshots: number;
  predictVaultSnapshots: number;
  sponsorshipLog24h: number;
  oldestPendingMs: number | null;
}

export function getAdminStats(): AdminStats {
  const db = getDb();
  const counts = db
    .prepare(
      `SELECT
         COUNT(*)                                                  AS total,
         SUM(CASE WHEN settled_outcome IS NULL THEN 1 ELSE 0 END)  AS pending,
         SUM(CASE WHEN settled_outcome IS NOT NULL THEN 1 ELSE 0 END) AS settled,
         SUM(CASE WHEN redeemed_digest IS NOT NULL THEN 1 ELSE 0 END) AS redeemed
       FROM positions`,
    )
    .get() as { total: number; pending: number; settled: number; redeemed: number };

  const oracleCount = (
    db.prepare("SELECT COUNT(*) AS c FROM oracle_snapshots").get() as { c: number }
  ).c;
  const predictVaultCount = (
    db.prepare("SELECT COUNT(*) AS c FROM predict_vault_snapshots").get() as { c: number }
  ).c;

  const since = Date.now() - 24 * 60 * 60_000;
  const sponsorshipCount = (
    db.prepare("SELECT COUNT(*) AS c FROM sponsorship_log WHERE timestamp_ms >= ?").get(since) as {
      c: number;
    }
  ).c;

  const oldestPending = db
    .prepare("SELECT MIN(timestamp_ms) AS ts FROM positions WHERE settled_outcome IS NULL")
    .get() as { ts: number | null };

  return {
    positions: counts,
    oracleSnapshots: oracleCount,
    predictVaultSnapshots: predictVaultCount,
    sponsorshipLog24h: sponsorshipCount,
    oldestPendingMs: oldestPending.ts,
  };
}

export function recordSponsorship(digest: string, sender: string): void {
  getDb()
    .prepare(
      `INSERT INTO sponsorship_log (digest, sender, timestamp_ms)
       VALUES (?, ?, ?)
       ON CONFLICT(digest) DO NOTHING`,
    )
    .run(digest, sender, Date.now());
}

export type SponsorEndpoint = "sponsor" | "execute";

export interface SponsorAttemptInput {
  endpoint: SponsorEndpoint;
  sender?: string;
  digest?: string;
  success: boolean;
  latencyMs: number;
  errorMessage?: string;
}

export function recordSponsorAttempt(input: SponsorAttemptInput): void {
  getDb()
    .prepare(
      `INSERT INTO sponsor_tx_attempts
         (endpoint, sender, digest, success, latency_ms, error_message, created_at_ms)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      input.endpoint,
      input.sender ?? null,
      input.digest ?? null,
      input.success ? 1 : 0,
      Math.max(Math.floor(input.latencyMs), 0),
      input.errorMessage ?? null,
      Date.now(),
    );
}

export interface SponsorAttemptSummary {
  windowMs: number;
  attempts: number;
  successCount: number;
  failureCount: number;
  successRate: number;
}

export function getSponsorAttemptSummary(windowMs: number): SponsorAttemptSummary {
  const since = Date.now() - windowMs;
  const row = getDb()
    .prepare(
      `SELECT
         COUNT(*) AS attempts,
         COALESCE(SUM(CASE WHEN success = 1 THEN 1 ELSE 0 END), 0) AS success_count
       FROM sponsor_tx_attempts
       WHERE created_at_ms >= ?`,
    )
    .get(since) as { attempts: number; success_count: number };
  const attempts = row.attempts ?? 0;
  const successCount = row.success_count ?? 0;
  const failureCount = Math.max(attempts - successCount, 0);
  return {
    windowMs,
    attempts,
    successCount,
    failureCount,
    successRate: attempts > 0 ? successCount / attempts : 0,
  };
}

export interface ClaimCompletionSummary {
  windowMs: number;
  settledCount: number;
  claimedCount: number;
  pendingClaimCount: number;
  completionRate: number;
  p50LatencyMs: number | null;
  p95LatencyMs: number | null;
  withinSlaRate: number | null;
}

function percentile(values: number[], p: number): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const index = Math.min(sorted.length - 1, Math.max(0, Math.ceil((p / 100) * sorted.length) - 1));
  return sorted[index];
}

export function getClaimCompletionSummary(
  windowMs: number,
  claimSlaMs: number,
): ClaimCompletionSummary {
  const since = Date.now() - windowMs;
  const counts = getDb()
    .prepare(
      `SELECT
         COUNT(*) AS settled_count,
         COALESCE(SUM(CASE WHEN redeemed_at_ms IS NOT NULL THEN 1 ELSE 0 END), 0) AS claimed_count
       FROM positions
       WHERE settled_at_ms IS NOT NULL
         AND settled_at_ms >= ?`,
    )
    .get(since) as { settled_count: number; claimed_count: number };

  const latencies = getDb()
    .prepare(
      `SELECT redeemed_at_ms - settled_at_ms AS latency_ms
         FROM positions
        WHERE settled_at_ms IS NOT NULL
          AND redeemed_at_ms IS NOT NULL
          AND settled_at_ms >= ?
          AND redeemed_at_ms >= settled_at_ms`,
    )
    .all(since) as { latency_ms: number }[];

  const latencyValues = latencies
    .map((r) => r.latency_ms)
    .filter((value): value is number => Number.isFinite(value) && value >= 0);

  const withinSla =
    latencyValues.length > 0
      ? latencyValues.filter((latency) => latency <= claimSlaMs).length / latencyValues.length
      : null;
  const settledCount = counts.settled_count ?? 0;
  const claimedCount = counts.claimed_count ?? 0;

  return {
    windowMs,
    settledCount,
    claimedCount,
    pendingClaimCount: Math.max(settledCount - claimedCount, 0),
    completionRate: settledCount > 0 ? claimedCount / settledCount : 0,
    p50LatencyMs: percentile(latencyValues, 50),
    p95LatencyMs: percentile(latencyValues, 95),
    withinSlaRate: withinSla,
  };
}

/* ─── Market discovery (read from oracle_snapshots) ────────────────────── */

export type ActiveMarketKind = "binary" | "range";

export interface ActiveMarket {
  id: string;
  poolId: string;
  oracleId: string;
  asset: string;
  category: "Crypto" | "Assets" | "Events";
  question: string;
  summary: string;
  strikePrice: number;
  lowerStrike?: number;
  upperStrike?: number;
  expiryTimestamp: number;
  kind: ActiveMarketKind;
  ask?: number;
  bid?: number;
}

const BUCKET_MS: Record<"quick" | "today" | "week" | "month", number> = {
  quick: 60 * 60_000,
  today: 24 * 60 * 60_000,
  week: 7 * 24 * 60 * 60_000,
  month: 30 * 24 * 60 * 60_000,
};

function categoryForAsset(asset: string): ActiveMarket["category"] {
  const upper = asset.toUpperCase();
  if (["BTC", "ETH", "SOL", "SUI", "AVAX", "LINK", "ARB", "OP"].includes(upper)) return "Crypto";
  if (["CPI", "FED", "ETF", "ELECTION"].includes(upper)) return "Events";
  return "Assets";
}

interface OracleSnapshotRow {
  oracle_id: string;
  expiry: number;
  asset: string | null;
  status: string | null;
  settlement_price: number | null;
  spot: number | null;
  forward: number | null;
  min_strike: number | null;
  tick_size: number | null;
  last_seen_ms: number;
}

export function getActiveMarkets(input: {
  bucket?: "quick" | "today" | "week" | "month";
  kind?: ActiveMarketKind;
  limit?: number;
}): ActiveMarket[] {
  const db = getDb();
  const bucket = input.bucket ?? "today";
  const limit = Math.min(Math.max(input.limit ?? 24, 1), 200);
  const now = Date.now();
  const max = now + BUCKET_MS[bucket];

  const rows = db
    .prepare(
      `SELECT oracle_id, expiry, asset, status, settlement_price, spot, forward,
              min_strike, tick_size, last_seen_ms
         FROM oracle_snapshots
        WHERE expiry >= ? AND expiry <= ?
          AND (status IS NULL OR status NOT IN ('settled','inactive'))
        ORDER BY expiry ASC
        LIMIT ?`,
    )
    .all(now + 60_000, max, limit) as OracleSnapshotRow[];

  // Per-oracle strike ladders. Each ratio is `strike / forward`. The ladder
  // densifies the deck so the swipe UX has enough cards to feel responsive
  // even when Predict only publishes one oracle per bucket.
  //
  // CRITICAL: Predict aborts `EAskPriceOutOfBounds` (code 7) when the implied
  // ask sits outside its allowed band. Far-OTM/ITM strikes are unmintable —
  // verified empirically. Keep the ladder narrow so every card the user
  // swipes is actually a valid on-chain mint. ±3% is a safe window for the
  // current testnet pricing config; the protocol may widen this later.
  const BINARY_RATIOS = [0.97, 0.99, 1.0, 1.01, 1.03];
  // Range bands as half-width fractions of `forward`. Tight band (±2.5%)
  // shows BOUNDED probability ~0.45, wide band (±10%) ~0.7. Three steps
  // give the user a tight / balanced / wide choice per oracle.
  const RANGE_HALFBANDS = [0.025, 0.05, 0.1];

  const out: ActiveMarket[] = [];
  for (const r of rows) {
    const asset = r.asset ?? "ASSET";
    const tickSize = r.tick_size ?? 0;
    const minStrike = r.min_strike ?? 0;
    const forward = r.forward ?? 0;

    if (!input.kind || input.kind === "binary") {
      const seen = new Set<number>();
      for (const ratio of BINARY_RATIOS) {
        let strikeScaled = forward > 0 ? Math.round(forward * ratio) : minStrike;
        if (tickSize > 0 && forward > 0) {
          const aligned = Math.round((strikeScaled - minStrike) / tickSize) * tickSize + minStrike;
          strikeScaled = Math.max(minStrike, aligned);
        } else {
          strikeScaled = Math.max(minStrike, strikeScaled);
        }
        if (strikeScaled <= 0 || seen.has(strikeScaled)) continue;
        seen.add(strikeScaled);
        const strikeHuman = strikeScaled / 1_000_000_000;
        // Ask leans towards 1 as strike moves below forward (more likely to
        // settle YES). Clamp to [0.05, 0.95] so the card UI stays readable.
        const ask =
          forward > 0
            ? Number(Math.min(Math.max(forward / strikeScaled, 0.05), 0.95).toFixed(2))
            : 0.5;
        const bid = Number((1 - ask).toFixed(2));
        out.push({
          id: `${r.oracle_id}-bin-${strikeScaled}`,
          poolId: r.oracle_id,
          oracleId: r.oracle_id,
          asset,
          category: categoryForAsset(asset),
          question: `${asset} > ${strikeHuman.toLocaleString()} by expiry?`,
          summary: `${asset} binary market settling at the next oracle expiry.`,
          strikePrice: strikeHuman,
          expiryTimestamp: r.expiry,
          kind: "binary",
          ask,
          bid,
        });
      }
    }

    if ((!input.kind || input.kind === "range") && forward > 0) {
      const forwardHuman = forward / 1_000_000_000;
      const seenLower = new Set<number>();
      for (const halfBand of RANGE_HALFBANDS) {
        const halfHuman = forwardHuman * halfBand;
        const lowerHuman = Math.max(0, Number((forwardHuman - halfHuman).toFixed(6)));
        const upperHuman = Number((forwardHuman + halfHuman).toFixed(6));
        const lowerScaled = Math.floor(lowerHuman * 1_000_000_000);
        if (seenLower.has(lowerScaled)) continue;
        seenLower.add(lowerScaled);
        // Tighter band → lower probability of settling BOUNDED, so quote
        // the ask lower; wider band → ask higher. Clamp [0.2, 0.8].
        const ask = Number(Math.min(0.8, Math.max(0.2, 0.4 + halfBand * 3)).toFixed(2));
        const bid = Number((1 - ask).toFixed(2));
        out.push({
          id: `${r.oracle_id}-rng-${lowerScaled}`,
          poolId: r.oracle_id,
          oracleId: r.oracle_id,
          asset,
          category: categoryForAsset(asset),
          question: `${asset} stays between ${lowerHuman.toLocaleString()} – ${upperHuman.toLocaleString()} by expiry?`,
          summary: `${asset} BOUNDED range — vault is the implicit OUTSIDE counterparty.`,
          strikePrice: forwardHuman,
          lowerStrike: lowerHuman,
          upperStrike: upperHuman,
          expiryTimestamp: r.expiry,
          kind: "range",
          ask,
          bid,
        });
      }
    }
  }

  return out;
}

/* ─── Manager lookup ───────────────────────────────────────────────────── */

export interface ManagerView {
  managerId: string;
  owner: string;
  createdMs: number;
}

export function findManagerByOwner(owner: string): ManagerView | null {
  const row = getDb()
    .prepare(
      `SELECT manager_id, owner, created_ms
         FROM managers
        WHERE owner = ?
        ORDER BY created_ms DESC
        LIMIT 1`,
    )
    .get(owner) as { manager_id: string; owner: string; created_ms: number } | undefined;
  if (!row) return null;
  return {
    managerId: row.manager_id,
    owner: row.owner,
    createdMs: row.created_ms,
  };
}

/* ─── Oracle state lookup ──────────────────────────────────────────────── */

export type OracleStateStatus = "ACTIVE" | "INACTIVE" | "PENDING_SETTLEMENT" | "SETTLED";

export interface OracleStateView {
  oracleId: string;
  asset: string;
  status: OracleStateStatus;
  /** Human (1e9-scaled) — null if not yet settled. */
  settlementPrice: number | null;
  expiryTimestamp: number;
  /** Human (1e9-scaled). */
  spot: number | null;
  forward: number | null;
}

function statusMap(raw: string | null): OracleStateStatus {
  switch ((raw ?? "").toLowerCase()) {
    case "settled":
      return "SETTLED";
    case "pending_settlement":
      return "PENDING_SETTLEMENT";
    case "active":
      return "ACTIVE";
    default:
      return "INACTIVE";
  }
}

interface RawOracleRow {
  oracle_id: string;
  expiry: number;
  asset: string | null;
  status: string | null;
  settlement_price: number | null;
  spot: number | null;
  forward: number | null;
}

/**
 * Most-recent snapshot for an oracleId. Optionally pin to a specific expiry
 * (callers polling for settlement want the row that matches their position).
 */
export function getOracleState(oracleId: string, expiry?: number): OracleStateView | null {
  const db = getDb();
  const row =
    expiry !== undefined
      ? (db
          .prepare(
            `SELECT oracle_id, expiry, asset, status, settlement_price, spot, forward
               FROM oracle_snapshots
              WHERE oracle_id = ? AND expiry = ?
              LIMIT 1`,
          )
          .get(oracleId, expiry) as RawOracleRow | undefined)
      : (db
          .prepare(
            `SELECT oracle_id, expiry, asset, status, settlement_price, spot, forward
               FROM oracle_snapshots
              WHERE oracle_id = ?
              ORDER BY last_seen_ms DESC
              LIMIT 1`,
          )
          .get(oracleId) as RawOracleRow | undefined);
  if (!row) return null;
  const scale = (v: number | null) => (typeof v === "number" && v > 0 ? v / 1_000_000_000 : null);
  return {
    oracleId: row.oracle_id,
    asset: row.asset ?? "",
    status: statusMap(row.status),
    settlementPrice: scale(row.settlement_price),
    expiryTimestamp: row.expiry,
    spot: scale(row.spot),
    forward: scale(row.forward),
  };
}

/* ─── Per-digest payout lookup ─────────────────────────────────────────── */

export interface PositionPayoutView {
  digest: string;
  kind: string;
  quantity: number;
  betSize: number;
  payout: number | null;
}

/**
 * Look up a single binary position by its mint-key fields. Returns the
 * latest matching row (positions are indexed by digest; if a user somehow
 * minted twice on the same key, we return the most recent).
 */
export interface PositionLookupInput {
  managerId?: string;
  oracleId: string;
  expiry: number;
  strike: number;
  isUp: boolean;
}

export function lookupBinaryPosition(input: PositionLookupInput): PositionPayoutView | null {
  const db = getDb();
  const row = db
    .prepare(
      `SELECT digest, kind, quantity, bet_size, redeemed_amount
         FROM positions
        WHERE oracle_id = ?
          AND expiry = ?
          AND strike = ?
          AND is_up = ?
          AND kind = 'binary'
          ${input.managerId ? "AND manager_id = ?" : ""}
        ORDER BY timestamp_ms DESC
        LIMIT 1`,
    )
    .get(
      input.oracleId,
      input.expiry,
      input.strike,
      input.isUp ? 1 : 0,
      ...(input.managerId ? [input.managerId] : []),
    ) as
    | {
        digest: string;
        kind: string;
        quantity: number;
        bet_size: number;
        redeemed_amount: number | null;
      }
    | undefined;
  if (!row) return null;
  return {
    digest: row.digest,
    kind: row.kind,
    quantity: row.quantity,
    betSize: row.bet_size,
    payout: row.redeemed_amount,
  };
}

export function getPositionPayout(digest: string): PositionPayoutView | null {
  const row = getDb()
    .prepare(
      `SELECT digest, kind, quantity, bet_size, redeemed_amount
         FROM positions WHERE digest = ?`,
    )
    .get(digest) as
    | {
        digest: string;
        kind: string;
        quantity: number;
        bet_size: number;
        redeemed_amount: number | null;
      }
    | undefined;
  if (!row) return null;
  return {
    digest: row.digest,
    kind: row.kind,
    quantity: row.quantity,
    betSize: row.bet_size,
    payout: row.redeemed_amount,
  };
}
