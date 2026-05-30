import cors from "cors";
import dotenv from "dotenv";
import express from "express";
import rateLimit from "express-rate-limit";
import { z } from "zod";
import { EnokiClient } from "@mysten/enoki";
import * as analyticsService from "./services/analyticsService.js";
import * as errorService from "./services/errorService.js";
import {
  buildReliabilityReport,
  type ReliabilityThresholds,
} from "./services/reliabilityService.js";
import {
  assertWithinDailyLimit,
  getDailyLimit,
  logSponsorship,
  SponsorshipLimitError,
} from "./services/sponsorshipGuard.js";
import {
  startPredictVaultSnapshotter,
  stopPredictVaultSnapshotter,
  fetchEarnApySummary,
  getSnapshotterStatus,
} from "./services/predictVaultSnapshotter.js";
import {
  startDeepbookPriceFeed,
  stopDeepbookPriceFeed,
  getDeepbookPriceFeedStatus,
  getLatestDeepbookTicker,
} from "./indexer/deepbookPriceFeed.js";
import { bootIndexer, indexerHealth, shutdownIndexer } from "./indexer/index.js";
import { closeDb } from "./indexer/db.js";
import { getActiveThemes } from "./indexer/themes.js";
import {
  getEventIngestionStatus,
  findManagerByOwner,
  getActiveMarkets,
  getAdminStats,
  getCursorAges,
  getLeaderboard,
  getOracleState,
  getPositionPayout,
  getSocialRetentionSummary,
  recordSponsorAttempt,
  getSponsorshipUsage,
  getUserPositions,
  getUserStats,
  lookupBinaryPosition,
} from "./indexer/derivedStats.js";

dotenv.config();

const app = express();
const port = Number(process.env.PORT ?? 3001);

const enokiPrivateKey = process.env.ENOKI_PRIVATE_KEY;
if (!enokiPrivateKey) {
  throw new Error("Missing ENOKI_PRIVATE_KEY");
}

const enokiClient = new EnokiClient({ apiKey: enokiPrivateKey });

// Locked-down CORS: only the explicitly-configured app origins (comma-
// separated in CORS_ALLOWED_ORIGINS) plus the fathom:// deep-link scheme.
// In dev (no env var set), fall back to the permissive default so local
// Expo + ngrok flows keep working.
const corsAllowList = (process.env.CORS_ALLOWED_ORIGINS ?? "")
  .split(",")
  .map((value) => value.trim())
  .filter(Boolean);
const corsAllowAll = corsAllowList.length === 0;
app.use(
  cors({
    origin: corsAllowAll
      ? true
      : (origin, callback) => {
          // Mobile native fetches (Expo, Hermes) often send no Origin header
          // at all — they aren't browser CORS requests, so allow them.
          if (!origin) return callback(null, true);
          if (corsAllowList.includes(origin)) return callback(null, true);
          if (origin.startsWith("fathom://")) return callback(null, true);
          return callback(new Error(`Origin ${origin} not allowed by CORS`));
        },
  }),
);
app.use(express.json({ limit: "1mb" }));
app.use(
  rateLimit({
    windowMs: 60_000,
    max: 120,
    standardHeaders: true,
    legacyHeaders: false,
  }),
);

const sponsorSchema = z.object({
  sender: z.string().startsWith("0x"),
  transactionKindBytes: z.string().min(10),
  allowedMoveCallTargets: z.array(z.string()).optional(),
  allowedAddresses: z.array(z.string()).optional(),
  network: z.enum(["mainnet", "testnet", "devnet"]).optional(),
});

const executeSchema = z.object({
  digest: z.string().min(10),
  signature: z.string().min(10),
});

const faucetSchema = z.object({
  address: z.string().startsWith("0x"),
});

const analyticsSchema = z.object({
  event: z.string().min(2),
  properties: z.record(z.string(), z.unknown()).optional(),
});

const errorReportSchema = z.object({
  message: z.string().min(2),
  source: z.string().optional(),
  stack: z.string().optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
});

const faucetTracker = new Map<string, number[]>();
const faucetWindowMs = Number(process.env.FAUCET_WINDOW_MS ?? 3_600_000);
const faucetMaxRequests = Number(process.env.FAUCET_MAX_REQUESTS_PER_WINDOW ?? 3);
const faucetRedirectUrl = process.env.FAUCET_REDIRECT_URL ?? "https://faucet.suilearn.io/";

const predictPackageId =
  process.env.FATHOM_PREDICT_PACKAGE_ID ??
  "0xf5ea2b3749c65d6e56507cc35388719aadb28f9cab873696a2f8687f5c785138";
const predictObjectId =
  process.env.FATHOM_PREDICT_OBJECT_ID ??
  "0xc8736204d12f0a7277c86388a68bf8a194b0a14c5538ad13f22cbd8e2a38028a";
const predictServerUrl =
  process.env.FATHOM_PREDICT_SERVER_URL ?? "https://predict-server.testnet.mystenlabs.com";
// Fathom's own router package — indexes HedgedSwapExecuted from Smart Bets.
const routerPackageId =
  process.env.FATHOM_ROUTER_PACKAGE_ID ??
  "0x92555862cc0dbcedfd6f7ff15bc5ebf42e5bc33e81bf87dac0e611bf45e1c89c";

// Boot indexer first so every request sees a populated DB. Idempotent if
// already running (e.g. tsx watch reloads). Indexer can be skipped with
// INDEXER_ENABLED=false (used by tests).
bootIndexer({
  network: "testnet",
  predictPackageId,
  predictObjectId,
  predictServerUrl,
  routerPackageId,
});

// Background loop that periodically snapshots DeepBook Predict's shared LP
// vault (vault_value + total_plp_supply) so /api/earn/apy can derive a
// rolling 7-day APY. Off when INDEXER_ENABLED=false to keep test runs hermetic.
if (process.env.INDEXER_ENABLED !== "false") {
  const snapshotIntervalMs = Number(process.env.PREDICT_VAULT_SNAPSHOT_MS ?? 300_000);
  startPredictVaultSnapshotter({
    network: "testnet",
    predictObjectId,
    intervalMs: snapshotIntervalMs,
  });

  // Live DeepBook SUI/DBUSDC mid + spread feed — the real book the Smart Bet
  // spot leg trades against. Surfaced via GET /api/deepbook/ticker.
  const deepbookFeedIntervalMs = Number(process.env.DEEPBOOK_PRICE_FEED_MS ?? 15_000);
  startDeepbookPriceFeed({ network: "testnet", intervalMs: deepbookFeedIntervalMs });
}

// Tick must be fresher than this for /health to return ok. Configurable via env
// so deployers can tune it for their RPC latency profile.
const indexerStaleAlarmMs = Number(process.env.INDEXER_STALE_ALARM_MS ?? 30_000);
const reliabilityThresholds: ReliabilityThresholds = {
  sponsorWindowMs: Number(process.env.SLO_SPONSOR_WINDOW_MS ?? 60 * 60_000),
  sponsorMinAttempts: Number(process.env.SLO_SPONSOR_MIN_ATTEMPTS ?? 20),
  sponsorMinSuccessRate: Number(process.env.SLO_SPONSOR_MIN_SUCCESS_RATE ?? 0.97),
  indexerMaxTickAgeMs: indexerStaleAlarmMs,
  marketsFeedMaxTickAgeMs: Number(process.env.SLO_MARKETS_FEED_STALE_MS ?? 90_000),
  claimWindowMs: Number(process.env.SLO_CLAIM_WINDOW_MS ?? 24 * 60 * 60_000),
  claimSlaMs: Number(process.env.SLO_CLAIM_SLA_MS ?? 15 * 60_000),
  claimMinSettled: Number(process.env.SLO_CLAIM_MIN_SETTLED ?? 10),
  claimMinCompletionRate: Number(process.env.SLO_CLAIM_MIN_COMPLETION_RATE ?? 0.9),
  claimP95MaxMs: Number(process.env.SLO_CLAIM_P95_MAX_MS ?? 15 * 60_000),
};

function getReliabilityReport() {
  return buildReliabilityReport({
    thresholds: reliabilityThresholds,
    indexer: indexerHealth(),
  });
}

app.get("/health", (_req, res) => {
  const health = indexerHealth();
  const reliability = getReliabilityReport();
  const cursors = getCursorAges();
  const maxCursorAgeMs = cursors.length === 0 ? -1 : Math.max(...cursors.map((c) => c.ageMs));
  // Poller liveness is the real alarm. Cursor ages are informational only —
  // a rare-event filter (e.g. predict_manager_created) can sit for days
  // without an event yet still be healthy.
  const stale = health.lastTickMs > 0 && health.lastTickAgeMs > indexerStaleAlarmMs;
  const degraded = stale || reliability.status === "degraded";
  const snapshotter = getSnapshotterStatus();
  const deepbookFeed = getDeepbookPriceFeedStatus();
  res.status(degraded ? 503 : 200).json({
    status: degraded ? "degraded" : "ok",
    service: "fathom-backend",
    indexer: health,
    indexerStaleAlarmMs,
    cursors,
    maxCursorAgeMs,
    snapshotter: {
      running: snapshotter.running,
      lastSampleMs: snapshotter.lastSampleMs,
      lastSampleAgeMs: snapshotter.lastSampleMs > 0 ? Date.now() - snapshotter.lastSampleMs : null,
      lastError: snapshotter.lastError,
    },
    deepbookPriceFeed: {
      running: deepbookFeed.running,
      lastSampleMs: deepbookFeed.lastSampleMs,
      lastSampleAgeMs:
        deepbookFeed.lastSampleMs > 0 ? Date.now() - deepbookFeed.lastSampleMs : null,
      lastError: deepbookFeed.lastError,
    },
    reliability,
  });
});

app.get("/api/admin/stats", (_req, res) => {
  res.json({
    indexer: indexerHealth(),
    cursors: getCursorAges(),
    reliability: getReliabilityReport(),
    stats: getAdminStats(),
  });
});

app.get("/api/admin/reliability", (_req, res) => {
  const report = getReliabilityReport();
  res.status(report.status === "degraded" ? 503 : 200).json(report);
});

// ─── Google OAuth mobile redirect proxy ────────────────────────────────────
//
// Problem 1 — ngrok interstitial: Chrome Custom Tab looks like a browser, so
//   ngrok (free tier) injects a warning page instead of forwarding to the backend.
//   Fix: send `ngrok-skip-browser-warning` response header so ngrok passes through.
//
// Problem 2 — JS custom-scheme redirect blocked: Recent Chrome versions silently
//   drop JavaScript-initiated navigation to custom schemes (fathom://) inside
//   Custom Tabs as a security measure.
//   Fix: two-step relay.
//
// Step 1 — /auth/callback
//   Google sends id_token in the URL *fragment* (#id_token=…), which is only
//   visible to the browser, never to the server.  This page extracts it via JS
//   and navigates to /auth/relay as a normal https:// URL (query string), which
//   the server CAN read.
//
// Step 2 — /auth/relay
//   Server receives id_token as a query param and issues an HTTP 302 to
//   fathom://oauth?id_token=…  Chrome Custom Tabs always follow HTTP-level
//   redirects to custom schemes, firing the Android intent / iOS deep-link,
//   which expo-web-browser intercepts to complete the auth session.

app.get("/auth/callback", (_req, res) => {
  res.setHeader("Content-Type", "text/html; charset=utf-8");
  res.setHeader("ngrok-skip-browser-warning", "true");
  res.send(`<!DOCTYPE html>
<html>
  <head><meta charset="utf-8" /><title>Signing in…</title></head>
  <body>
    <script>
      var hash   = window.location.hash.slice(1);
      var search = window.location.search.slice(1);
      var src    = new URLSearchParams(hash || search);
      var relay  = new URLSearchParams();
      var tok = src.get("id_token");
      var err = src.get("error");
      var desc = src.get("error_description");
      if (tok)  relay.set("id_token", tok);
      if (err)  relay.set("error", err);
      if (desc) relay.set("error_description", desc);
      window.location.replace("/auth/relay?" + relay.toString());
    </script>
    <noscript>Please enable JavaScript to complete sign-in.</noscript>
  </body>
</html>`);
});

const relaySchema = z.object({
  id_token: z.string().min(10).optional(),
  error: z.string().optional(),
  error_description: z.string().optional(),
});

app.get("/auth/relay", (req, res) => {
  const parsed = relaySchema.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).send("Invalid OAuth relay parameters");
    return;
  }

  const deepLink = new URLSearchParams();
  const { id_token, error, error_description } = parsed.data;
  if (id_token) deepLink.set("id_token", id_token);
  if (error) deepLink.set("error", error);
  if (error_description) deepLink.set("error_description", error_description);

  res.redirect(`fathom://oauth?${deepLink.toString()}`);
});

app.post("/api/sponsor", async (req, res) => {
  const parsed = sponsorSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues[0]?.message ?? "Invalid payload" });
    return;
  }

  try {
    assertWithinDailyLimit(parsed.data.sender);
  } catch (err) {
    if (err instanceof SponsorshipLimitError) {
      res.status(429).json({
        error: err.message,
        used: err.used,
        limit: err.limit,
      });
      return;
    }
    throw err;
  }

  const startedAt = Date.now();
  try {
    const sponsored = await enokiClient.createSponsoredTransaction({
      network: parsed.data.network ?? "testnet",
      sender: parsed.data.sender,
      transactionKindBytes: parsed.data.transactionKindBytes,
      allowedMoveCallTargets: parsed.data.allowedMoveCallTargets,
      allowedAddresses: parsed.data.allowedAddresses,
    });

    logSponsorship(sponsored.digest, parsed.data.sender);
    recordSponsorAttempt({
      endpoint: "sponsor",
      sender: parsed.data.sender,
      digest: sponsored.digest,
      success: true,
      latencyMs: Date.now() - startedAt,
    });
    res.json({ bytes: sponsored.bytes, digest: sponsored.digest });
  } catch (error: unknown) {
    // Keep the structured Enoki rejection in dev logs — the SDK collapses
    // useful detail (allow-listed addresses, dry-run aborts) into an opaque
    // 400 status without it.
    console.error("[sponsor] enoki rejected", {
      message: error instanceof Error ? error.message : String(error),
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      cause: (error as any)?.cause,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      response: (error as any)?.response,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      body: (error as any)?.body,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      data: (error as any)?.data,
      sender: parsed.data.sender,
      targets: parsed.data.allowedMoveCallTargets,
      txKindLen: parsed.data.transactionKindBytes?.length,
    });
    recordSponsorAttempt({
      endpoint: "sponsor",
      sender: parsed.data.sender,
      success: false,
      latencyMs: Date.now() - startedAt,
      errorMessage: error instanceof Error ? error.message : "unknown error",
    });
    res.status(500).json({
      error: "Failed to create sponsored transaction",
      details: error instanceof Error ? error.message : "unknown error",
    });
  }
});

app.post("/api/execute", async (req, res) => {
  const parsed = executeSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues[0]?.message ?? "Invalid payload" });
    return;
  }

  const startedAt = Date.now();
  try {
    const result = await enokiClient.executeSponsoredTransaction({
      digest: parsed.data.digest,
      signature: parsed.data.signature,
    });
    recordSponsorAttempt({
      endpoint: "execute",
      digest: parsed.data.digest,
      success: true,
      latencyMs: Date.now() - startedAt,
    });
    res.json({ digest: result.digest });
  } catch (error: unknown) {
    recordSponsorAttempt({
      endpoint: "execute",
      digest: parsed.data.digest,
      success: false,
      latencyMs: Date.now() - startedAt,
      errorMessage: error instanceof Error ? error.message : "unknown error",
    });
    res.status(500).json({
      error: "Failed to execute sponsored transaction",
      details: error instanceof Error ? error.message : "unknown error",
    });
  }
});

app.post("/api/faucet/request", (req, res) => {
  const parsed = faucetSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues[0]?.message ?? "Invalid payload" });
    return;
  }

  const now = Date.now();
  const existing = faucetTracker.get(parsed.data.address) ?? [];
  const windowed = existing.filter((timestamp) => now - timestamp <= faucetWindowMs);
  if (windowed.length >= faucetMaxRequests) {
    res.status(429).json({ accepted: false, error: "Faucet rate limit exceeded" });
    return;
  }

  faucetTracker.set(parsed.data.address, [...windowed, now]);
  res.json({
    accepted: true,
    message: "Open the external faucet and request USDC for this address.",
    redirectUrl: faucetRedirectUrl,
  });
});

// ─── Indexer-backed user endpoints ─────────────────────────────────────────

const addressSchema = z.string().startsWith("0x").min(4);

app.get("/api/user/:address/stats", (req, res) => {
  const parsed = addressSchema.safeParse(req.params.address);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid address" });
    return;
  }
  res.json(getUserStats(parsed.data));
});

const positionsQuerySchema = z.object({
  status: z.enum(["pending", "settled", "all"]).optional(),
  limit: z.coerce.number().int().positive().max(500).optional(),
});

app.get("/api/user/:address/positions", (req, res) => {
  const addr = addressSchema.safeParse(req.params.address);
  if (!addr.success) {
    res.status(400).json({ error: "Invalid address" });
    return;
  }
  const q = positionsQuerySchema.safeParse(req.query);
  if (!q.success) {
    res.status(400).json({ error: q.error.issues[0]?.message ?? "Invalid query" });
    return;
  }
  res.json({
    positions: getUserPositions(addr.data, q.data.status ?? "all", q.data.limit ?? 50),
  });
});

app.get("/api/user/:address/sponsorship", (req, res) => {
  const addr = addressSchema.safeParse(req.params.address);
  if (!addr.success) {
    res.status(400).json({ error: "Invalid address" });
    return;
  }
  res.json(getSponsorshipUsage(addr.data, getDailyLimit()));
});

app.get("/api/user/:address/social-retention", (req, res) => {
  const addr = addressSchema.safeParse(req.params.address);
  if (!addr.success) {
    res.status(400).json({ error: "Invalid address" });
    return;
  }
  const q = leaderboardQuerySchema.safeParse(req.query);
  if (!q.success) {
    res.status(400).json({ error: q.error.issues[0]?.message ?? "Invalid query" });
    return;
  }
  res.json(getSocialRetentionSummary(addr.data, q.data.bucket ?? "week"));
});

const leaderboardQuerySchema = z.object({
  bucket: z.enum(["day", "week", "month", "all"]).optional(),
  limit: z.coerce.number().int().positive().max(500).optional(),
});

app.get("/api/leaderboard", (req, res) => {
  const q = leaderboardQuerySchema.safeParse(req.query);
  if (!q.success) {
    res.status(400).json({ error: q.error.issues[0]?.message ?? "Invalid query" });
    return;
  }
  res.json({
    bucket: q.data.bucket ?? "week",
    entries: getLeaderboard(q.data.bucket ?? "week", q.data.limit ?? 50),
  });
});

const activeMarketsQuerySchema = z.object({
  bucket: z.enum(["quick", "today", "week", "month"]).optional(),
  kind: z.enum(["binary", "range"]).optional(),
  limit: z.coerce.number().int().positive().max(200).optional(),
});

app.get("/api/markets/active", (req, res) => {
  const q = activeMarketsQuerySchema.safeParse(req.query);
  if (!q.success) {
    res.status(400).json({ error: q.error.issues[0]?.message ?? "Invalid query" });
    return;
  }
  res.json({
    bucket: q.data.bucket ?? "today",
    markets: getActiveMarkets({
      bucket: q.data.bucket,
      kind: q.data.kind,
      limit: q.data.limit,
    }),
  });
});

app.get("/api/positions/:digest/payout", (req, res) => {
  const digest = req.params.digest;
  if (!digest || digest.length < 4) {
    res.status(400).json({ error: "Invalid digest" });
    return;
  }
  const payout = getPositionPayout(digest);
  if (!payout) {
    res.status(404).json({ error: "Position not indexed yet" });
    return;
  }
  res.json(payout);
});

const oracleStateQuerySchema = z.object({
  expiry: z.coerce.number().int().nonnegative().optional(),
});

app.get("/api/themes/active", (_req, res) => {
  res.json({ themes: getActiveThemes() });
});

app.get("/api/managers/by-owner/:owner", (req, res) => {
  const owner = req.params.owner;
  if (!owner || !owner.startsWith("0x")) {
    res.status(400).json({ error: "Invalid owner" });
    return;
  }
  const manager = findManagerByOwner(owner);
  if (!manager) {
    res.status(404).json({ error: "Manager not indexed yet" });
    return;
  }
  res.json(manager);
});

app.get("/api/oracles/:oracleId/state", (req, res) => {
  const id = req.params.oracleId;
  if (!id || id.length < 4) {
    res.status(400).json({ error: "Invalid oracleId" });
    return;
  }
  const q = oracleStateQuerySchema.safeParse(req.query);
  if (!q.success) {
    res.status(400).json({ error: q.error.issues[0]?.message ?? "Invalid query" });
    return;
  }
  const state = getOracleState(id, q.data.expiry);
  if (!state) {
    res.status(404).json({ error: "Oracle not indexed yet" });
    return;
  }
  res.json(state);
});

const positionLookupSchema = z.object({
  managerId: z.string().optional(),
  oracleId: z.string().min(4),
  expiry: z.coerce.number().int().nonnegative(),
  strike: z.coerce.number().int().nonnegative(),
  isUp: z.enum(["true", "false"]),
});

app.get("/api/positions/lookup", (req, res) => {
  const q = positionLookupSchema.safeParse(req.query);
  if (!q.success) {
    res.status(400).json({ error: q.error.issues[0]?.message ?? "Invalid query" });
    return;
  }
  const found = lookupBinaryPosition({
    managerId: q.data.managerId,
    oracleId: q.data.oracleId,
    expiry: q.data.expiry,
    strike: q.data.strike,
    isUp: q.data.isUp === "true",
  });
  if (!found) {
    res.status(404).json({ error: "Position not indexed yet" });
    return;
  }
  res.json(found);
});

app.post("/api/analytics/track", (req, res) => {
  const parsed = analyticsSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues[0]?.message ?? "Invalid payload" });
    return;
  }

  analyticsService.trackEvent(parsed.data.event, undefined, parsed.data.properties);
  res.json({ accepted: true });
});

app.post("/api/errors/report", (req, res) => {
  const parsed = errorReportSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues[0]?.message ?? "Invalid payload" });
    return;
  }

  errorService.captureError(parsed.data);
  res.json({ accepted: true });
});

// ─── Earn (DeepBook Predict LP) endpoint ───────────────────────────────────

app.get("/api/earn/apy", (_req, res) => {
  res.json(fetchEarnApySummary());
});

// Live DeepBook SUI/DBUSDC ticker (mid + best bid/ask + spread). This is the
// real book the Smart Bet spot leg trades against. NOTE: it does NOT price the
// prediction markets — those are BTC-only on testnet and the DBTC book is
// empty, so re-pricing BTC off a SUI book would be dishonest.
app.get("/api/deepbook/ticker", (_req, res) => {
  const ticker = getLatestDeepbookTicker();
  const status = getDeepbookPriceFeedStatus();
  res.json({ ticker, feedRunning: status.running, feedLastError: status.lastError });
});

// Kept exported for compatibility with the indexer status helper.
export function getEventIngestionSnapshotForFilters(filterNames: string[]) {
  return getEventIngestionStatus(filterNames);
}

const server = app.listen(port, () => {
  console.log(`[fathom-backend] listening on :${port}`);
});

// Graceful shutdown: stop accepting new requests, halt the indexer and
// vault snapshotter, close the SQLite handle, then exit. Without this an
// in-flight tx could be force-killed mid-write under SIGTERM (Render /
// Fly / Railway / Docker stop).
let shuttingDown = false;
function shutdown(signal: NodeJS.Signals): void {
  if (shuttingDown) return;
  shuttingDown = true;
  console.log(`[fathom-backend] received ${signal}, draining…`);
  const timeout = setTimeout(() => {
    console.warn("[fathom-backend] forced exit after 10s drain");
    process.exit(1);
  }, 10_000);
  timeout.unref();
  server.close(() => {
    try {
      shutdownIndexer();
    } catch (error) {
      console.warn("[fathom-backend] indexer shutdown failed", error);
    }
    try {
      stopPredictVaultSnapshotter();
    } catch (error) {
      console.warn("[fathom-backend] snapshotter shutdown failed", error);
    }
    try {
      stopDeepbookPriceFeed();
    } catch (error) {
      console.warn("[fathom-backend] deepbook price feed shutdown failed", error);
    }
    try {
      closeDb();
    } catch (error) {
      console.warn("[fathom-backend] db close failed", error);
    }
    clearTimeout(timeout);
    process.exit(0);
  });
}

process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));
