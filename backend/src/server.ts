import cors from "cors";
import dotenv from "dotenv";
import express from "express";
import rateLimit from "express-rate-limit";
import { z } from "zod";
import { EnokiClient } from "@mysten/enoki";
import * as analyticsService from "./services/analyticsService.js";
import * as errorService from "./services/errorService.js";

dotenv.config();

const app = express();
// Behind a single Render/ngrok proxy — trust exactly one hop so the rate
// limiter keys on the real client IP without letting clients spoof XFF.
app.set("trust proxy", 1);
const port = Number(process.env.PORT ?? 3001);

const enokiPrivateKey = process.env.ENOKI_PRIVATE_KEY;
if (!enokiPrivateKey) {
  throw new Error("Missing ENOKI_PRIVATE_KEY");
}

const enokiClient = new EnokiClient({ apiKey: enokiPrivateKey });

// Locked-down CORS: only the explicitly-configured app origins (comma-separated
// in CORS_ALLOWED_ORIGINS) plus the brisk:// deep-link scheme. In dev (no env
// var set), fall back to permissive so local Expo + ngrok flows keep working.
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
          // Mobile native fetches (Expo, Hermes) often send no Origin header —
          // they aren't browser CORS requests, so allow them.
          if (!origin) return callback(null, true);
          if (corsAllowList.includes(origin)) return callback(null, true);
          if (origin.startsWith("brisk://")) return callback(null, true);
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

// Visibility: log every API request that actually reaches the backend.
app.use((req, _res, next) => {
  if (req.path.startsWith("/api/")) console.log(`[req] ${req.method} ${req.path}`);
  next();
});

// ─── Validation schemas ─────────────────────────────────────────────────────

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

// ─── In-memory sponsorship daily limit (anti-abuse) ─────────────────────────
// A rolling 24h per-sender cap. In-memory is fine for a hackathon relay; swap
// for a durable store if the backend ever runs multi-instance.

const sponsorshipLog = new Map<string, number[]>();
const sponsorshipWindowMs = 24 * 60 * 60_000;
const sponsorshipDailyLimit = Number(process.env.SPONSORSHIP_DAILY_LIMIT_TX_COUNT ?? 50);

function getSponsorshipUsage(sender: string) {
  const now = Date.now();
  const windowed = (sponsorshipLog.get(sender) ?? []).filter((t) => now - t <= sponsorshipWindowMs);
  sponsorshipLog.set(sender, windowed);
  return {
    usedCount: windowed.length,
    dailyLimit: sponsorshipDailyLimit,
    remaining: Math.max(0, sponsorshipDailyLimit - windowed.length),
    windowMs: sponsorshipWindowMs,
  };
}

class SponsorshipLimitError extends Error {
  constructor(
    public used: number,
    public limit: number,
  ) {
    super(`Daily sponsorship limit reached (${used}/${limit})`);
  }
}

function assertWithinDailyLimit(sender: string) {
  const usage = getSponsorshipUsage(sender);
  if (usage.remaining <= 0) throw new SponsorshipLimitError(usage.usedCount, usage.dailyLimit);
}

function logSponsorship(sender: string) {
  const list = sponsorshipLog.get(sender) ?? [];
  list.push(Date.now());
  sponsorshipLog.set(sender, list);
}

// ─── Sponsorship guardrails ─────────────────────────────────────────────────
// The per-sender cap is bypassable (anyone can rotate zkLogin addresses), so the
// real protections are: (1) only sponsor calls into the Brisk package + the few
// framework coin/balance ops the SDK emits, and (2) a global daily ceiling that
// caps total sponsored txs regardless of how many addresses are used.

const SUI_FW = "0x0000000000000000000000000000000000000000000000000000000000000002";
const briskPkg = process.env.BRISK_PACKAGE_ID ?? "";
if (!briskPkg) {
  console.warn(
    "[config] BRISK_PACKAGE_ID is unset — the sponsor relay will fail CLOSED " +
      "and sponsor no transactions. Set it (see render.yaml / .env.example).",
  );
}
const serverAllowedTargets = new Set<string>([
  `${briskPkg}::payment_receipt::pay`,
  `${briskPkg}::merchant_registry::register_and_share`,
  `${briskPkg}::spending_vault::open`,
  `${briskPkg}::spending_vault::deposit`,
  `${briskPkg}::spending_vault::withdraw`,
  // Framework coin/balance ops the CoinWithBalance resolver may emit. The
  // coin-output path (used by Save deposit) sources from the Address Balance via
  // `coin::redeem_funds`; `balance::redeem_funds` covers the balance-output path.
  `${SUI_FW}::coin::redeem_funds`,
  `${SUI_FW}::coin::into_balance`,
  `${SUI_FW}::coin::from_balance`,
  `${SUI_FW}::coin::send_funds`,
  `${SUI_FW}::coin::destroy_zero`,
  `${SUI_FW}::balance::send_funds`,
  `${SUI_FW}::balance::redeem_funds`,
]);

function targetsAllowed(targets: string[] | undefined): boolean {
  // Fail closed: the relay holds the Enoki gas key, so it sponsors ONLY calls
  // into Brisk's own package + the framework coin/balance ops. A sponsor request
  // must declare a non-empty target list that is a subset of the server set — the
  // client can never widen it, and an unconfigured relay sponsors nothing. (All
  // sponsored flows — pay-with-receipt, vault open/deposit/withdraw — carry Move
  // calls; pure P2P transfers go the unsponsored native-gasless route.)
  if (!briskPkg) return false; // not configured → sponsor nothing
  if (!targets || targets.length === 0) return false;
  return targets.every((t) => serverAllowedTargets.has(t));
}

const globalDailyCeiling = Number(process.env.SPONSORSHIP_GLOBAL_DAILY_MAX ?? 5000);
let globalDay = "";
let globalCount = 0;
function withinGlobalCeiling(): boolean {
  const today = new Date().toISOString().slice(0, 10);
  if (today !== globalDay) {
    globalDay = today;
    globalCount = 0;
  }
  if (globalCount >= globalDailyCeiling) return false;
  globalCount += 1;
  return true;
}

// ─── Faucet proxy (rate-limited) ────────────────────────────────────────────

const faucetTracker = new Map<string, number[]>();
const faucetWindowMs = Number(process.env.FAUCET_WINDOW_MS ?? 3_600_000);
const faucetMaxRequests = Number(process.env.FAUCET_MAX_REQUESTS_PER_WINDOW ?? 3);
const faucetRedirectUrl = process.env.FAUCET_REDIRECT_URL ?? "https://faucet.sui.io/";

// ─── Health ─────────────────────────────────────────────────────────────────

app.get("/health", (_req, res) => {
  res.json({ status: "ok", service: "brisk-backend" });
});

// ─── Google OAuth mobile redirect proxy ─────────────────────────────────────
//
// Google's web client only accepts https:// redirect URIs, and Chrome Custom
// Tabs drop JS-initiated navigations to custom schemes. So: Google → backend
// /auth/callback (extracts id_token from the URL fragment via JS, forwards to
// /auth/relay as a query) → /auth/relay issues an HTTP 302 to brisk://oauth,
// which Custom Tabs DO follow, firing the deep link expo-web-browser listens
// for. The ngrok-skip-browser-warning header bypasses ngrok's free interstitial.

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

  res.redirect(`brisk://oauth?${deepLink.toString()}`);
});

// ─── Sponsored transactions (Enoki) ──────────────────────────────────────────

app.post("/api/sponsor", async (req, res) => {
  const parsed = sponsorSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues[0]?.message ?? "Invalid payload" });
    return;
  }

  // Only sponsor calls into Brisk's own package + the framework coin/balance ops.
  if (!targetsAllowed(parsed.data.allowedMoveCallTargets)) {
    res.status(403).json({ error: "Requested move-call targets are not sponsorable" });
    return;
  }
  // Global circuit breaker (caps total daily sponsorships across all senders).
  if (!withinGlobalCeiling()) {
    res.status(429).json({ error: "Sponsorship temporarily unavailable, try again later" });
    return;
  }

  try {
    assertWithinDailyLimit(parsed.data.sender);
  } catch (err) {
    if (err instanceof SponsorshipLimitError) {
      res.status(429).json({ error: err.message, used: err.used, limit: err.limit });
      return;
    }
    throw err;
  }

  try {
    const sponsored = await enokiClient.createSponsoredTransaction({
      network: parsed.data.network ?? "testnet",
      sender: parsed.data.sender,
      transactionKindBytes: parsed.data.transactionKindBytes,
      allowedMoveCallTargets: parsed.data.allowedMoveCallTargets,
      allowedAddresses: parsed.data.allowedAddresses,
    });

    logSponsorship(parsed.data.sender);
    res.json({ bytes: sponsored.bytes, digest: sponsored.digest });
  } catch (error: unknown) {
    // Keep the structured Enoki rejection in dev logs — the SDK collapses useful
    // detail (allow-listed addresses, dry-run aborts) into an opaque 400 status.
    console.error("[sponsor] enoki rejected", {
      message: error instanceof Error ? error.message : String(error),
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      cause: (error as any)?.cause,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      response: (error as any)?.response,
      sender: parsed.data.sender,
      targets: parsed.data.allowedMoveCallTargets,
      txKindLen: parsed.data.transactionKindBytes?.length,
    });
    // Detail stays in the server log above; clients get a generic message.
    res.status(500).json({ error: "Failed to create sponsored transaction" });
  }
});

app.post("/api/execute", async (req, res) => {
  const parsed = executeSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues[0]?.message ?? "Invalid payload" });
    return;
  }

  try {
    const result = await enokiClient.executeSponsoredTransaction({
      digest: parsed.data.digest,
      signature: parsed.data.signature,
    });
    res.json({ digest: result.digest });
  } catch (error: unknown) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const e = error as any;
    // Enoki collapses gas-station failures into an opaque 400; unfold the nested
    // `errors[].data` so logs show the real reason (dry-run abort, bad signature,
    // unsupported tx shape, …) instead of just "Request to gas station failed".
    console.error("[execute] enoki rejected", {
      message: error instanceof Error ? error.message : String(error),
      cause: e?.cause?.message ?? e?.cause,
      errors: JSON.stringify(e?.errors ?? e?.cause?.errors, null, 2),
      digest: parsed.data.digest,
    });
    res.status(500).json({ error: "Failed to execute sponsored transaction" });
  }
});

const addressSchema = z.string().startsWith("0x").min(4);

app.get("/api/user/:address/sponsorship", (req, res) => {
  const addr = addressSchema.safeParse(req.params.address);
  if (!addr.success) {
    res.status(400).json({ error: "Invalid address" });
    return;
  }
  res.json(getSponsorshipUsage(addr.data));
});

// ─── Faucet ───────────────────────────────────────────────────────────────

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
    message: "Open the external faucet and request funds for this address.",
    redirectUrl: faucetRedirectUrl,
  });
});

// ─── Analytics + error reporting ─────────────────────────────────────────────

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

const server = app.listen(port, () => {
  console.log(`[brisk-backend] listening on :${port}`);
});

// Graceful shutdown.
let shuttingDown = false;
function shutdown(signal: NodeJS.Signals): void {
  if (shuttingDown) return;
  shuttingDown = true;
  console.log(`[brisk-backend] received ${signal}, draining…`);
  const timeout = setTimeout(() => {
    console.warn("[brisk-backend] forced exit after 10s drain");
    process.exit(1);
  }, 10_000);
  timeout.unref();
  server.close(() => {
    clearTimeout(timeout);
    process.exit(0);
  });
}

process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));
