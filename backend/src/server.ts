import path from "node:path";
import { fileURLToPath } from "node:url";
import { WebSocketServer, WebSocket, type RawData } from "ws";
import cors from "cors";
import dotenv from "dotenv";
import express from "express";
import rateLimit from "express-rate-limit";
import { z } from "zod";
import { EnokiClient } from "@mysten/enoki";
import * as analyticsService from "./services/analyticsService.js";
import * as errorService from "./services/errorService.js";
import * as linkStore from "./services/linkStore.js";
import * as tillStore from "./services/tillStore.js";
import * as merchantStore from "./services/merchantStore.js";
import * as userStore from "./services/userStore.js";
import * as giftCardStore from "./services/giftCardStore.js";
import * as posStore from "./services/posStore.js";
import { ensureSchema, isDbConfigured } from "./db.js";

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
// Fallbacks so ERP/webhook posts in other content types are still captured
// (see POST /pos/v1/sale). JSON above wins for application/json.
app.use(express.urlencoded({ extended: true, limit: "1mb" }));
app.use(express.text({ type: ["text/*", "application/xml", "*/xml"], limit: "1mb" }));
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

// Serve the browser payment app (webpay/dist, built alongside the backend) under
// /pay. Static assets first; the SPA fallback (below, before listen) handles the
// /pay/:code deep routes so the code resolves client-side. Same-origin with the
// API, so no CORS entry is needed for the SPA.
const WEBPAY_DIST = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../webpay/dist");
app.use("/pay", express.static(WEBPAY_DIST));

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

const createLinkSchema = z.object({
  sender: z.string().startsWith("0x"),
  merchantId: z.string().startsWith("0x"),
  payee: z.string().startsWith("0x"),
  amountMicros: z
    .number()
    .int()
    .positive()
    .max(1_000_000 * 10 ** 6),
  invoiceId: z.string().min(1).max(128),
  merchant: z.string().min(1).max(128),
  // When present, the link pays into this till (receiving account) — the
  // customer never sees the merchant's private treasury. Falls back to `payee`.
  tillId: z.string().startsWith("0x").optional(),
  reusable: z.boolean().optional(),
  expiresInSec: z
    .number()
    .int()
    .positive()
    .max(30 * 24 * 60 * 60)
    .optional(),
});

// Tills (merchant receiving accounts). The Till is created on-chain by the
// merchant (cap-gated); these just mirror it for listing + the sweep cron.
const tillCreateSchema = z.object({
  sender: z.string().startsWith("0x"),
  tillId: z.string().startsWith("0x"),
  merchantId: z.string().startsWith("0x"),
  ownerAddr: z.string().startsWith("0x"),
  treasuryAddr: z.string().startsWith("0x"),
  name: z.string().min(1).max(128),
});

const tillTreasurySchema = z.object({
  sender: z.string().startsWith("0x"),
  treasuryAddr: z.string().startsWith("0x"),
});

const tillActiveSchema = z.object({
  sender: z.string().startsWith("0x"),
  active: z.boolean(),
});

const tillRenameSchema = z.object({
  sender: z.string().startsWith("0x"),
  name: z.string().min(1).max(128),
});

const tillIdSchema = z.string().startsWith("0x").min(4);

const markPaidSchema = z.object({
  digest: z.string().min(10),
});

const cancelLinkSchema = z.object({
  sender: z.string().startsWith("0x"),
});

const merchantQuerySchema = z.string().startsWith("0x").min(4);

// Merchant directory: a business name tied to the on-chain Merchant + owner,
// plus optional business metadata. Only businessName is required here so partial
// updates (e.g. an inline rename) validate; the app enforces name + VAT at setup.
const optionalField = (max: number) => z.string().trim().max(max).optional();
const merchantProfileSchema = z.object({
  sender: z.string().startsWith("0x"),
  merchantId: z.string().startsWith("0x"),
  businessName: z.string().trim().min(2).max(40),
  vatId: optionalField(32),
  city: optionalField(64),
  country: optionalField(64),
  phone: optionalField(32),
  email: z.string().trim().max(120).email().optional().or(z.literal("")),
  category: optionalField(40),
  logoUrl: z.string().trim().url().max(512).optional().or(z.literal("")),
});

// Brisk username rules (kept in lockstep with utils/handle.ts on the app):
// 3–20 chars; lowercase letters/digits/underscore; must start with a letter; no
// trailing or consecutive underscores; not reserved. Stored bare; the `@brisk`
// suffix is added in responses.
const RESERVED_HANDLES = new Set([
  "brisk",
  "admin",
  "administrator",
  "support",
  "help",
  "helpdesk",
  "root",
  "system",
  "official",
  "security",
  "team",
  "staff",
  "mod",
  "moderator",
  "contact",
  "info",
  "noreply",
  "no_reply",
  "payments",
  "payment",
  "wallet",
  "account",
  "null",
  "undefined",
  "me",
  "everyone",
]);
const registerUserSchema = z.object({
  sender: z.string().startsWith("0x"),
  handle: z
    .string()
    .trim()
    .toLowerCase()
    .regex(/^[a-z0-9_]{3,20}$/, "3–20 lowercase letters, numbers, or _")
    .refine((h) => /^[a-z]/.test(h), "Must start with a letter")
    .refine((h) => !h.endsWith("_"), "Can't end with an underscore")
    .refine((h) => !h.includes("__"), "No consecutive underscores")
    .refine((h) => !RESERVED_HANDLES.has(h), "That username is reserved"),
  // Optional compressed avatar data URI: undefined = preserve, "" = remove.
  avatar: z.string().max(300_000).nullable().optional(),
});

const microAmount = z
  .number()
  .int()
  .positive()
  .max(1_000_000 * 10 ** 6);

// --- Gift cards (merchant-prepaid; the backend is a metadata index only) ---
// The GiftCard lives on-chain (Move `gift_card`): the merchant is paid at
// issuance and the card is a redeemable promise (no escrow). The backend just
// indexes {objectId, claim_code, merchant, buyer, recipient} so the app can list
// a customer's cards and render the /g/:code share landing. The claim SECRET is
// never sent here — it lives only in the share-link fragment.
const giftCardRecordSchema = z.object({
  sender: z.string().startsWith("0x"), // buyer
  objectId: z.string().startsWith("0x"), // on-chain GiftCard object id
  merchantId: z.string().startsWith("0x"),
  faceValueMicros: microAmount,
});
const giftCardClaimSchema = z.object({ recipient: z.string().startsWith("0x") });

const codeParamSchema = z.string().regex(/^[A-Za-z0-9]{8}$/);

// Short codes are exactly 8 base62 chars (see linkStore.generateCode).
const linkCodeSchema = z.string().regex(/^[A-Za-z0-9]{8}$/);

// Public https origin used to build shareable link URLs. Falls back to the
// request's own host when unset so local/ngrok runs still produce a usable link.
const publicBaseUrl = (process.env.PUBLIC_BASE_URL ?? "").replace(/\/+$/, "");

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
// Upgraded package that introduced payment_receipt::record_payment (the
// best-effort receipt leg). Defaults to BRISK_PACKAGE_ID when unset (pre-upgrade).
const briskRecordPkg = process.env.BRISK_RECORD_PKG ?? briskPkg;
// Upgraded package carrying the `till` module (merchant receiving accounts that
// hide the private treasury). Defaults to BRISK_PACKAGE_ID when unset.
const briskTillPkg = process.env.BRISK_TILL_PKG ?? briskPkg;
// Upgraded package carrying the `gift_card` module (merchant-prepaid, claimable,
// re-giftable gift cards). Defaults to BRISK_PACKAGE_ID when unset.
const briskGiftCardPkg = process.env.BRISK_GIFT_CARD_PKG ?? briskPkg;
if (!briskPkg) {
  console.warn(
    "[config] BRISK_PACKAGE_ID is unset — the sponsor relay will fail CLOSED " +
      "and sponsor no transactions. Set it (see render.yaml / .env.example).",
  );
}
const serverAllowedTargets = new Set<string>([
  `${briskPkg}::payment_receipt::pay`,
  `${briskRecordPkg}::payment_receipt::record_payment`,
  `${briskPkg}::merchant_registry::register_and_share`,
  `${briskPkg}::spending_vault::open`,
  `${briskPkg}::spending_vault::deposit`,
  `${briskPkg}::spending_vault::withdraw`,
  // Merchant receiving accounts ("tills"). create_till/set_treasury/rename/
  // set_active are MerchantCap-gated; sweep is the manual "Move to treasury" leg
  // (permissionless on-chain, but sponsored when a merchant taps it in-app). The
  // daily auto-sweep runs server-side with its own gas, NOT through this relay.
  `${briskTillPkg}::till::create_till`,
  `${briskTillPkg}::till::sweep`,
  `${briskTillPkg}::till::set_treasury`,
  `${briskTillPkg}::till::rename`,
  `${briskTillPkg}::till::set_active`,
  // On-chain gift cards: mint (buyer pays merchant net + treasury fee upfront),
  // claim (recipient binds via hashed secret), redeem (recipient draws down the
  // promise), regift (recipient resets the card to hand it onward with a new
  // secret). All sponsored so users never need SUI. MUST also be on the Enoki
  // dashboard allowlist.
  `${briskGiftCardPkg}::gift_card::mint`,
  `${briskGiftCardPkg}::gift_card::claim`,
  `${briskGiftCardPkg}::gift_card::redeem`,
  `${briskGiftCardPkg}::gift_card::regift`,
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

// ─── ERP point-of-sale integration ───────────────────────────────────────────
// Real-time bridge: an external ERP initiates a sale (POST /pos/v1/sale) tagged
// with a terminalId (embedded in aadeProviderSignatureData); the backend routes
// it over a WebSocket to the specific merchant phone bound to that terminal; the
// phone runs the NFC charge, settles on-chain, and reports the tx digest, which
// the ERP polls for via GET /pos/v1/sessions/:sessionId.
//
// Transport: single free Render instance ⇒ an in-memory terminalId→socket map is
// sufficient (no pub/sub). Durable state (terminals, sessions) lives in Postgres
// so nothing is lost across a socket reconnect or a redeploy — a sale that lands
// while the socket is briefly down is drained to the terminal on reconnect.

// terminalId -> live WebSocket (this instance only).
const terminalSockets = new Map<string, WebSocket>();

// How long a sale may stay PROCESSING before it's lazily timed out, so a sale the
// device never resolved doesn't leave the ERP polling forever. Generous enough to
// cover the NFC charge + settlement + digest lookup (and a short device queue).
const posSessionTtlSec = Number(process.env.POS_SESSION_TTL_SEC ?? 300);

const terminalRegisterSchema = z.object({
  deviceId: z.string().min(8).max(128),
  sender: z.string().startsWith("0x"),
  merchantId: z.string().startsWith("0x"),
  tillId: z.string().startsWith("0x"),
  name: z.string().trim().min(1).max(64),
});

const saleSchema = z.object({
  sessionId: z.string().min(1).max(128),
  aadeProviderSignatureData: z.string().min(1).max(512),
});

// Success is reported by supplying a `digest` (→ becomes the aadeTransactionId);
// a failure is reported with `state`. `state` therefore only carries the two
// non-success outcomes, so it can never be mistaken for a success-without-digest.
const saleResultSchema = z
  .object({
    token: z.string().min(1),
    digest: z.string().min(10).optional(),
    state: z.enum(["FAILED", "TIMEOUT", "CANCELED"]).optional(),
  })
  .refine((v) => !!v.digest || !!v.state, {
    message: "Provide a digest (success) or a terminal state",
  });

/**
 * Parse the ERP's `aadeProviderSignatureData` — a `;`-delimited string whose
 * meaningful fields are the LAST FIVE: price, net, vat, total (all integer
 * cents), and terminalId. Parsing from the end ignores the variable-length
 * prefix (signature hash, timestamps). `total` includes any tip and is the
 * charge amount. Example:
 *   95A9…;;20260712115724;700;618;82;700;12345678
 *                          ^price ^net ^vat ^total ^terminalId
 */
function parseAadeProviderSignatureData(raw: string): {
  priceCents: number;
  netCents: number;
  vatCents: number;
  totalCents: number;
  terminalId: string;
} | null {
  const parts = raw.split(";");
  if (parts.length < 5) return null;
  const [priceStr, netStr, vatStr, totalStr, terminalId] = parts.slice(-5);
  const priceCents = Number(priceStr);
  const netCents = Number(netStr);
  const vatCents = Number(vatStr);
  const totalCents = Number(totalStr);
  if (
    !Number.isInteger(priceCents) ||
    !Number.isInteger(netCents) ||
    !Number.isInteger(vatCents) ||
    !Number.isInteger(totalCents) ||
    totalCents <= 0 ||
    !terminalId
  ) {
    return null;
  }
  return { priceCents, netCents, vatCents, totalCents, terminalId };
}

/** Push a JSON message to a terminal's socket if it's connected. */
function pushToTerminal(terminalId: string, message: Record<string, unknown>): boolean {
  const ws = terminalSockets.get(terminalId);
  if (!ws || ws.readyState !== WebSocket.OPEN) return false;
  ws.send(JSON.stringify(message));
  return true;
}

/** Build the SALE message a terminal acts on. */
function saleMessage(session: posStore.PosSession, tillId: string) {
  return {
    type: "SALE" as const,
    sessionId: session.sessionId,
    amountMicros: session.amountMicros,
    totalCents: session.totalCents,
    netCents: session.netCents,
    vatCents: session.vatCents,
    tillId,
  };
}

// Register (or re-register) a terminal — called by the merchant device. Returns
// the auth token used for the socket + result reporting. Gated by the per-sender
// daily cap as cheap anti-abuse, like the other device-driven POST routes.
app.post("/pos/v1/terminals", async (req, res) => {
  if (!isDbConfigured()) {
    res.status(503).json({ error: "POS is not available" });
    return;
  }
  const parsed = terminalRegisterSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues[0]?.message ?? "Invalid payload" });
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
    const terminal = await posStore.registerTerminal({
      deviceId: parsed.data.deviceId,
      ownerAddr: parsed.data.sender,
      merchantId: parsed.data.merchantId,
      tillId: parsed.data.tillId,
      name: parsed.data.name,
    });
    console.log("[pos] terminal registered", {
      terminalId: terminal.terminalId,
      ownerAddr: terminal.ownerAddr,
      tillId: terminal.tillId,
    });
    res.json({ terminalId: terminal.terminalId, token: terminal.token });
  } catch (error: unknown) {
    console.error("[pos] terminal register failed", error instanceof Error ? error.message : error);
    res.status(500).json({ error: "Failed to register terminal" });
  }
});

app.post("/pos/v1/sale", async (req, res) => {
  console.log("[pos] POST /pos/v1/sale", {
    timestamp: new Date().toISOString(),
    ip: req.ip,
    headers: req.headers,
    query: req.query,
    body: req.body,
    rawBodyType: typeof req.body,
  });
  if (!isDbConfigured()) {
    res.status(503).json({ error: "POS is not available" });
    return;
  }
  const parsed = saleSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues[0]?.message ?? "Invalid payload" });
    return;
  }
  const sig = parseAadeProviderSignatureData(parsed.data.aadeProviderSignatureData);
  if (!sig) {
    res.status(400).json({ error: "Malformed aadeProviderSignatureData" });
    return;
  }

  try {
    // Normalize the code as a human may have keyed it into the ERP (lowercase,
    // spaces/hyphens) into the canonical stored form before lookup.
    const terminalId = posStore.normalizeTerminalCode(sig.terminalId);
    const terminal = await posStore.getTerminal(terminalId);
    if (!terminal) {
      console.warn("[pos] sale for unknown terminal", { terminalId });
      res.status(404).json({ error: "Unknown terminal" });
      return;
    }

    const amountMicros = sig.totalCents * 10_000; // 1 cent = 10^4 USDC micros
    // Store + route under the canonical terminalId so redelivery on reconnect
    // (which keys on the socket's normalized id) always finds the session.
    const session = await posStore.createSession({
      sessionId: parsed.data.sessionId,
      terminalId,
      amountMicros,
      netCents: sig.netCents,
      vatCents: sig.vatCents,
      totalCents: sig.totalCents,
    });

    // Push to the live terminal socket (best-effort). The session is marked
    // delivered only when the device ACKs it over the socket, so a push that
    // never lands (offline / half-open socket) is redelivered on next connect.
    const pushed = pushToTerminal(terminalId, saleMessage(session, terminal.tillId));
    console.log("[pos] sale routed", {
      sessionId: session.sessionId,
      terminalId,
      amountMicros,
      pushed,
    });

    res
      .status(200)
      .json({ state: "PROCESSING", sessionType: "SALE", sessionId: session.sessionId });
  } catch (error: unknown) {
    console.error("[pos] sale failed", error instanceof Error ? error.message : error);
    res.status(500).json({ error: "Failed to initiate sale" });
  }
});

app.get("/pos/v1/sessions/:sessionId", async (req, res) => {
  const { sessionId } = req.params;
  console.log("[pos] GET /pos/v1/sessions/:sessionId", {
    timestamp: new Date().toISOString(),
    ip: req.ip,
    query: req.query,
    sessionId,
  });
  if (!isDbConfigured()) {
    res.status(503).json({ error: "POS is not available" });
    return;
  }
  try {
    // Time out a stale PROCESSING session before reading, so the ERP gets a
    // terminal answer rather than polling a never-resolved sale indefinitely.
    await posStore.expireStaleSession(sessionId, posSessionTtlSec);
    const session = await posStore.getSession(sessionId);
    if (!session) {
      console.log("[pos] session not found", { sessionId });
      res.status(404).json({ error: "Session not found" });
      return;
    }
    // Map the internal state to the ERP-facing shape. A merchant cancel is
    // surfaced as a FAILURE of type CANCEL; every other outcome is a SALE.
    const responseBody =
      session.state === "CANCELED"
        ? { state: "FAILURE", sessionType: "CANCEL", aadeData: { aadeTransactionId: null } }
        : {
            state: session.state,
            sessionType: "SALE",
            aadeData: { aadeTransactionId: session.aadeTransactionId },
          };
    console.log("[pos] session resolved", { sessionId, responseBody });
    res.status(200).json(responseBody);
  } catch (error: unknown) {
    console.error("[pos] session lookup failed", error instanceof Error ? error.message : error);
    res.status(500).json({ error: "Failed to load session" });
  }
});

// The merchant device reports the sale outcome: a digest on success (→ becomes
// the aadeTransactionId the ERP polls), or a terminal FAILED/TIMEOUT state.
// Authenticated with the terminal's token.
app.post("/pos/v1/sessions/:sessionId/result", async (req, res) => {
  const { sessionId } = req.params;
  if (!isDbConfigured()) {
    res.status(503).json({ error: "POS is not available" });
    return;
  }
  const parsed = saleResultSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues[0]?.message ?? "Invalid payload" });
    return;
  }
  try {
    const session = await posStore.getSession(sessionId);
    if (!session) {
      res.status(404).json({ error: "Session not found" });
      return;
    }
    const terminal = await posStore.getTerminal(session.terminalId);
    if (!terminal || terminal.token !== parsed.data.token) {
      res.status(403).json({ error: "Invalid terminal token" });
      return;
    }
    if (parsed.data.digest) {
      const updated = await posStore.markSuccess(sessionId, parsed.data.digest);
      console.log("[pos] session settled", { sessionId, digest: parsed.data.digest, updated });
    } else {
      const state = parsed.data.state ?? "FAILED";
      const updated = await posStore.markFailed(sessionId, state);
      console.log("[pos] session marked", { sessionId, state, updated });
    }
    res.json({ ok: true });
  } catch (error: unknown) {
    console.error("[pos] result failed", error instanceof Error ? error.message : error);
    res.status(500).json({ error: "Failed to record result" });
  }
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

/**
 * Dump every scrap of an Enoki error into a flat object so server logs
 * actually show what the gas station rejected, instead of the SDK's opaque
 * "Request to gas station failed" wrapper.
 */
function dumpEnokiError(error: unknown): Record<string, unknown> {
  const e = error as Record<string, unknown>;
  return {
    name: e?.name ?? typeof error,
    message: e?.message ?? String(error),
    stack: typeof e?.stack === "string" ? e.stack : undefined,
    status: e?.status,
    statusText: e?.statusText,
    cause:
      e?.cause instanceof Error
        ? {
            name: e.cause.name,
            message: e.cause.message,
            stack: e.cause.stack,
            response: (e.cause as unknown as Record<string, unknown>)?.response,
            errors: (e.cause as unknown as Record<string, unknown>)?.errors,
          }
        : e?.cause,
    response: e?.response,
    errors: e?.errors,
    data: e?.data,
    responseData:
      typeof e?.response === "object" && e?.response !== null
        ? (e.response as Record<string, unknown>)?.data
        : undefined,
    headers: e?.headers,
  };
}

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
    console.error("[sponsor] enoki rejected", {
      ...dumpEnokiError(error),
      sender: parsed.data.sender,
      network: parsed.data.network ?? "testnet",
      allowedMoveCallTargets: parsed.data.allowedMoveCallTargets,
      allowedAddresses: parsed.data.allowedAddresses,
      txKindBytesLength: parsed.data.transactionKindBytes?.length,
      txKindBytesPrefix: parsed.data.transactionKindBytes?.slice(0, 64),
      timestamp: new Date().toISOString(),
    });
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
    console.error("[execute] enoki rejected", {
      ...dumpEnokiError(error),
      digest: parsed.data.digest,
      signaturePrefix: parsed.data.signature?.slice(0, 32),
      timestamp: new Date().toISOString(),
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

// ─── Payment links ───────────────────────────────────────────────────────────
// A merchant mints a short-code link (code → invoice), shares it over any
// channel, and the customer pays it. The link store is durable (Postgres); the
// /p/:code landing page bounces installed apps into brisk://pay and shows a web
// fallback otherwise — the same redirect trick as /auth/callback → brisk://oauth.

function baseUrlFor(req: express.Request): string {
  if (publicBaseUrl) return publicBaseUrl;
  const proto = (req.headers["x-forwarded-proto"] as string)?.split(",")[0] ?? req.protocol;
  return `${proto}://${req.get("host")}`;
}

function escapeHtml(s: string): string {
  return s.replace(
    /[&<>"']/g,
    (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!,
  );
}

function formatUsdMicros(micros: number): string {
  const [int, dec] = (micros / 10 ** 6).toFixed(2).split(".");
  return `$${int.replace(/\B(?=(\d{3})+(?!\d))/g, ",")}.${dec}`;
}

app.post("/api/links", async (req, res) => {
  if (!isDbConfigured()) {
    res.status(503).json({ error: "Payment links are not available" });
    return;
  }
  const parsed = createLinkSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues[0]?.message ?? "Invalid payload" });
    return;
  }
  // Reuse the sponsorship per-sender cap as a cheap anti-abuse gate on minting.
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
    const code = await linkStore.createLink({
      merchantId: parsed.data.merchantId,
      payee: parsed.data.payee,
      ownerAddr: parsed.data.sender,
      tillId: parsed.data.tillId,
      amountMicros: parsed.data.amountMicros,
      invoiceId: parsed.data.invoiceId,
      merchantName: parsed.data.merchant,
      reusable: parsed.data.reusable,
      expiresInSec: parsed.data.expiresInSec,
    });
    logSponsorship(parsed.data.sender);
    res.json({ code, url: `${baseUrlFor(req)}/p/${code}` });
  } catch (error: unknown) {
    console.error("[links] create failed", error instanceof Error ? error.message : error);
    res.status(500).json({ error: "Failed to create payment link" });
  }
});

app.get("/api/links/:code", async (req, res) => {
  if (!isDbConfigured()) {
    res.status(503).json({ error: "Payment links are not available" });
    return;
  }
  const code = linkCodeSchema.safeParse(req.params.code);
  if (!code.success) {
    res.status(400).json({ error: "Invalid code" });
    return;
  }
  try {
    const link = await linkStore.getLink(code.data);
    if (!link) {
      res.status(404).json({ error: "Payment link not found" });
      return;
    }
    if (link.expired) {
      res.status(410).json({ error: "Payment link expired" });
      return;
    }
    if (link.status === "canceled") {
      res.status(410).json({ error: "Payment link canceled" });
      return;
    }
    res.json({
      merchantId: link.merchantId,
      payee: link.payee,
      tillId: link.tillId,
      amountMicros: link.amountMicros,
      invoiceId: link.invoiceId,
      merchant: link.merchantName,
      status: link.status,
      reusable: link.reusable,
    });
  } catch (error: unknown) {
    console.error("[links] resolve failed", error instanceof Error ? error.message : error);
    res.status(500).json({ error: "Failed to resolve payment link" });
  }
});

app.post("/api/links/:code/paid", async (req, res) => {
  if (!isDbConfigured()) {
    res.status(503).json({ error: "Payment links are not available" });
    return;
  }
  const code = linkCodeSchema.safeParse(req.params.code);
  const parsed = markPaidSchema.safeParse(req.body);
  if (!code.success || !parsed.success) {
    res.status(400).json({ error: "Invalid payload" });
    return;
  }
  try {
    const updated = await linkStore.markPaid(code.data, parsed.data.digest);
    res.json({ ok: true, updated });
  } catch (error: unknown) {
    console.error("[links] markPaid failed", error instanceof Error ? error.message : error);
    res.status(500).json({ error: "Failed to update payment link" });
  }
});

// Cancel (void) an unpaid link. Gated to the creator: `sender` must equal the
// link's payee (the merchant that minted it).
app.post("/api/links/:code/cancel", async (req, res) => {
  if (!isDbConfigured()) {
    res.status(503).json({ error: "Payment links are not available" });
    return;
  }
  const code = linkCodeSchema.safeParse(req.params.code);
  const parsed = cancelLinkSchema.safeParse(req.body);
  if (!code.success || !parsed.success) {
    res.status(400).json({ error: "Invalid payload" });
    return;
  }
  try {
    const result = await linkStore.cancelLink(code.data, parsed.data.sender);
    if (result === "not_found") {
      res.status(404).json({ error: "Payment link not found" });
      return;
    }
    if (result === "forbidden") {
      res.status(403).json({ error: "Only the merchant who created this link can cancel it" });
      return;
    }
    if (result === "not_pending") {
      res.status(409).json({ error: "Only a pending link can be canceled" });
      return;
    }
    res.json({ ok: true });
  } catch (error: unknown) {
    console.error("[links] cancel failed", error instanceof Error ? error.message : error);
    res.status(500).json({ error: "Failed to cancel payment link" });
  }
});

// List the links a merchant created (newest first), for the management screen.
app.get("/api/links", async (req, res) => {
  if (!isDbConfigured()) {
    res.status(503).json({ error: "Payment links are not available" });
    return;
  }
  const merchant = merchantQuerySchema.safeParse(req.query.merchant);
  if (!merchant.success) {
    res.status(400).json({ error: "A merchant address is required" });
    return;
  }
  try {
    const links = await linkStore.listLinks(merchant.data);
    const now = Date.now();
    res.json({
      links: links.map((l) => ({
        code: l.code,
        url: `${baseUrlFor(req)}/p/${l.code}`,
        amountMicros: l.amountMicros,
        merchant: l.merchantName,
        // Surface a derived "expired" status to the client (DB keeps it pending).
        status:
          l.status === "pending" && l.expiresAt && new Date(l.expiresAt).getTime() < now
            ? "expired"
            : l.status,
        reusable: l.reusable,
        createdAt: l.createdAt,
        expiresAt: l.expiresAt,
      })),
    });
  } catch (error: unknown) {
    console.error("[links] list failed", error instanceof Error ? error.message : error);
    res.status(500).json({ error: "Failed to list payment links" });
  }
});

// ─── Tills (merchant receiving accounts) ────────────────────────────────────

// Record a till after its on-chain create_till tx. The Till already exists on
// chain (cap-gated); this mirrors it so the merchant can list it and the cron
// can sweep it. Gated by the per-sender sponsorship cap as cheap anti-abuse.
app.post("/api/tills", async (req, res) => {
  if (!isDbConfigured()) {
    res.status(503).json({ error: "Tills are not available" });
    return;
  }
  const parsed = tillCreateSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues[0]?.message ?? "Invalid payload" });
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
    await tillStore.createTill({
      tillId: parsed.data.tillId,
      merchantId: parsed.data.merchantId,
      ownerAddr: parsed.data.ownerAddr,
      treasuryAddr: parsed.data.treasuryAddr,
      name: parsed.data.name,
    });
    res.json({ ok: true });
  } catch (error: unknown) {
    console.error("[tills] create failed", error instanceof Error ? error.message : error);
    res.status(500).json({ error: "Failed to record till" });
  }
});

// List the tills a merchant owns (newest first), for the Pro management screen.
app.get("/api/tills", async (req, res) => {
  if (!isDbConfigured()) {
    res.status(503).json({ error: "Tills are not available" });
    return;
  }
  const merchant = merchantQuerySchema.safeParse(req.query.merchant);
  if (!merchant.success) {
    res.status(400).json({ error: "A merchant address is required" });
    return;
  }
  try {
    const tills = await tillStore.listTills(merchant.data);
    res.json({
      tills: tills.map((t) => ({
        tillId: t.tillId,
        merchantId: t.merchantId,
        treasuryAddr: t.treasuryAddr,
        name: t.name,
        active: t.active,
        createdAt: t.createdAt,
        lastSweptAt: t.lastSweptAt,
      })),
    });
  } catch (error: unknown) {
    console.error("[tills] list failed", error instanceof Error ? error.message : error);
    res.status(500).json({ error: "Failed to list tills" });
  }
});

// Update the cached treasury address after an on-chain set_treasury. Gated to
// the owner (the on-chain set_treasury is itself cap-gated; this just mirrors).
app.post("/api/tills/:tillId/treasury", async (req, res) => {
  if (!isDbConfigured()) {
    res.status(503).json({ error: "Tills are not available" });
    return;
  }
  const tillId = tillIdSchema.safeParse(req.params.tillId);
  const parsed = tillTreasurySchema.safeParse(req.body);
  if (!tillId.success || !parsed.success) {
    res.status(400).json({ error: "Invalid payload" });
    return;
  }
  try {
    const till = await tillStore.getTill(tillId.data);
    if (!till) {
      res.status(404).json({ error: "Till not found" });
      return;
    }
    if (till.ownerAddr !== parsed.data.sender) {
      res.status(403).json({ error: "Only the merchant who owns this till can update it" });
      return;
    }
    await tillStore.setTreasury(tillId.data, parsed.data.treasuryAddr);
    res.json({ ok: true });
  } catch (error: unknown) {
    console.error("[tills] set treasury failed", error instanceof Error ? error.message : error);
    res.status(500).json({ error: "Failed to update till" });
  }
});

// Enable/disable a till (e.g. retire a per-client account). Gated to the owner.
app.post("/api/tills/:tillId/active", async (req, res) => {
  if (!isDbConfigured()) {
    res.status(503).json({ error: "Tills are not available" });
    return;
  }
  const tillId = tillIdSchema.safeParse(req.params.tillId);
  const parsed = tillActiveSchema.safeParse(req.body);
  if (!tillId.success || !parsed.success) {
    res.status(400).json({ error: "Invalid payload" });
    return;
  }
  try {
    const till = await tillStore.getTill(tillId.data);
    if (!till) {
      res.status(404).json({ error: "Till not found" });
      return;
    }
    if (till.ownerAddr !== parsed.data.sender) {
      res.status(403).json({ error: "Only the merchant who owns this till can update it" });
      return;
    }
    await tillStore.setActive(tillId.data, parsed.data.active);
    res.json({ ok: true });
  } catch (error: unknown) {
    console.error("[tills] set active failed", error instanceof Error ? error.message : error);
    res.status(500).json({ error: "Failed to update till" });
  }
});

// Rename a till (mirror after an on-chain rename). Gated to the owner.
app.post("/api/tills/:tillId/rename", async (req, res) => {
  if (!isDbConfigured()) {
    res.status(503).json({ error: "Tills are not available" });
    return;
  }
  const tillId = tillIdSchema.safeParse(req.params.tillId);
  const parsed = tillRenameSchema.safeParse(req.body);
  if (!tillId.success || !parsed.success) {
    res.status(400).json({ error: "Invalid payload" });
    return;
  }
  try {
    const till = await tillStore.getTill(tillId.data);
    if (!till) {
      res.status(404).json({ error: "Till not found" });
      return;
    }
    if (till.ownerAddr !== parsed.data.sender) {
      res.status(403).json({ error: "Only the merchant who owns this till can update it" });
      return;
    }
    await tillStore.setName(tillId.data, parsed.data.name);
    res.json({ ok: true });
  } catch (error: unknown) {
    console.error("[tills] rename failed", error instanceof Error ? error.message : error);
    res.status(500).json({ error: "Failed to rename till" });
  }
});

// --- Merchant directory ----------------------------------------------------
// Maps the on-chain Merchant (+ owner address) to a business name, so the app
// renders names instead of 0x everywhere. Owner-gated by the `sender` claim
// (the on-chain Merchant is itself cap-gated; this just mirrors the name).
app.post("/api/merchants", async (req, res) => {
  if (!isDbConfigured()) {
    res.status(503).json({ error: "Merchant directory is not available" });
    return;
  }
  const parsed = merchantProfileSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues[0]?.message ?? "Invalid payload" });
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
    // If a profile already exists for this merchant, only its owner may edit it.
    const existing = await merchantStore.getProfileByMerchantId(parsed.data.merchantId);
    if (existing && existing.ownerAddr !== parsed.data.sender) {
      res.status(403).json({ error: "Only the merchant owner can edit this profile" });
      return;
    }
    const profile = await merchantStore.upsertProfile({
      merchantId: parsed.data.merchantId,
      ownerAddr: parsed.data.sender,
      businessName: parsed.data.businessName,
      vatId: parsed.data.vatId,
      city: parsed.data.city,
      country: parsed.data.country,
      phone: parsed.data.phone,
      email: parsed.data.email,
      category: parsed.data.category,
      logoUrl: parsed.data.logoUrl,
    });
    res.json({ profile });
  } catch (error: unknown) {
    console.error("[merchants] upsert failed", error instanceof Error ? error.message : error);
    res.status(500).json({ error: "Failed to save business profile" });
  }
});

app.get("/api/merchants/by-owner/:address", async (req, res) => {
  if (!isDbConfigured()) {
    res.status(503).json({ error: "Merchant directory is not available" });
    return;
  }
  const addr = merchantQuerySchema.safeParse(req.params.address);
  if (!addr.success) {
    res.status(400).json({ error: "A valid address is required" });
    return;
  }
  try {
    const profile = await merchantStore.getProfileByOwner(addr.data);
    if (!profile) {
      res.status(404).json({ error: "No profile" });
      return;
    }
    res.json({ profile });
  } catch (error: unknown) {
    console.error("[merchants] by-owner failed", error instanceof Error ? error.message : error);
    res.status(500).json({ error: "Failed to load profile" });
  }
});

// Batch lookup for name rendering (Activity, dashboard): resolve any of the
// given merchant ids and/or owner addresses to profiles. Comma-separated, ≤50.
app.get("/api/merchants/lookup", async (req, res) => {
  if (!isDbConfigured()) {
    res.json({ profiles: [] });
    return;
  }
  const split = (v: unknown): string[] =>
    typeof v === "string"
      ? v
          .split(",")
          .map((s) => s.trim())
          .filter((s) => s.startsWith("0x"))
          .slice(0, 50)
      : [];
  const ids = split(req.query.ids);
  const addrs = split(req.query.addrs);
  try {
    // Also resolve till addresses → their business (so a payment into a till
    // shows the business name/logo, not a short address).
    const [profiles, tillBusinesses] = await Promise.all([
      merchantStore.lookupProfiles(ids, addrs),
      merchantStore.lookupTillBusinesses(addrs),
    ]);
    res.json({ profiles: [...profiles, ...tillBusinesses] });
  } catch (error: unknown) {
    console.error("[merchants] lookup failed", error instanceof Error ? error.message : error);
    res.json({ profiles: [] });
  }
});

// Search the directory by business name (customer "buy a gift card" picker). An
// empty query browses ALL merchants so the customer can discover businesses
// without knowing an exact name; a query does a substring match.
app.get("/api/merchants/search", async (req, res) => {
  if (!isDbConfigured()) {
    res.json({ profiles: [] });
    return;
  }
  const q = (typeof req.query.q === "string" ? req.query.q : "").trim();
  try {
    const profiles =
      q.length >= 1 ? await merchantStore.searchByName(q) : await merchantStore.listAll();
    res.json({ profiles });
  } catch (error: unknown) {
    console.error("[merchants] search failed", error instanceof Error ? error.message : error);
    res.json({ profiles: [] });
  }
});

app.get("/api/merchants/:merchantId", async (req, res) => {
  if (!isDbConfigured()) {
    res.status(503).json({ error: "Merchant directory is not available" });
    return;
  }
  const id = merchantQuerySchema.safeParse(req.params.merchantId);
  if (!id.success) {
    res.status(400).json({ error: "A valid merchant id is required" });
    return;
  }
  try {
    const profile = await merchantStore.getProfileByMerchantId(id.data);
    if (!profile) {
      res.status(404).json({ error: "No profile" });
      return;
    }
    res.json({ profile });
  } catch (error: unknown) {
    console.error("[merchants] get failed", error instanceof Error ? error.message : error);
    res.status(500).json({ error: "Failed to load profile" });
  }
});

// --- User directory (Brisk usernames) -------------------------------------
// A handle per owner address, so the app renders `john123@brisk` instead of a
// 0x address. Mirrors the merchant-directory routes.
const withAlias = (u: userStore.BriskUser) => ({ ...u, alias: `${u.handle}@brisk` });

// Register or change the caller's handle. Owner-gated: sender IS the owner.
app.post("/api/users", async (req, res) => {
  if (!isDbConfigured()) {
    res.status(503).json({ error: "User directory is not available" });
    return;
  }
  const parsed = registerUserSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues[0]?.message ?? "Invalid payload" });
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
    const user = await userStore.upsertHandle({
      ownerAddr: parsed.data.sender,
      handle: parsed.data.handle,
      avatar: parsed.data.avatar,
    });
    res.json({ user: withAlias(user) });
  } catch (error: unknown) {
    if (error instanceof userStore.HandleTakenError) {
      res.status(409).json({ error: error.message });
      return;
    }
    console.error("[users] register failed", error instanceof Error ? error.message : error);
    res.status(500).json({ error: "Failed to save username" });
  }
});

// The mandatory username gate keys on this 404.
app.get("/api/users/by-owner/:address", async (req, res) => {
  if (!isDbConfigured()) {
    res.status(503).json({ error: "User directory is not available" });
    return;
  }
  const addr = merchantQuerySchema.safeParse(req.params.address);
  if (!addr.success) {
    res.status(400).json({ error: "A valid address is required" });
    return;
  }
  try {
    const user = await userStore.getUserByOwner(addr.data);
    if (!user) {
      res.status(404).json({ error: "No username" });
      return;
    }
    res.json({ user: withAlias(user) });
  } catch (error: unknown) {
    console.error("[users] by-owner failed", error instanceof Error ? error.message : error);
    res.status(500).json({ error: "Failed to load username" });
  }
});

// Batch address→handle lookup for name rendering. Comma-separated, ≤50.
app.get("/api/users/lookup", async (req, res) => {
  if (!isDbConfigured()) {
    res.json({ users: [] });
    return;
  }
  const addrs =
    typeof req.query.addrs === "string"
      ? req.query.addrs
          .split(",")
          .map((s) => s.trim())
          .filter((s) => s.startsWith("0x"))
          .slice(0, 50)
      : [];
  try {
    const users = await userStore.lookupUsers(addrs);
    res.json({ users: users.map(withAlias) });
  } catch (error: unknown) {
    console.error("[users] lookup failed", error instanceof Error ? error.message : error);
    res.json({ users: [] });
  }
});

// Resolve a handle → owner address (Send recipient by username).
app.get("/api/users/resolve/:handle", async (req, res) => {
  if (!isDbConfigured()) {
    res.status(503).json({ error: "User directory is not available" });
    return;
  }
  const handle = z
    .string()
    .trim()
    .toLowerCase()
    .regex(/^[a-z0-9_]{3,20}$/)
    .safeParse(req.params.handle);
  if (!handle.success) {
    res.status(400).json({ error: "A valid username is required" });
    return;
  }
  try {
    const user = await userStore.getUserByHandle(handle.data);
    if (!user) {
      res.status(404).json({ error: "No such username" });
      return;
    }
    res.json({ user: withAlias(user) });
  } catch (error: unknown) {
    console.error("[users] resolve failed", error instanceof Error ? error.message : error);
    res.status(500).json({ error: "Failed to resolve username" });
  }
});

// --- Gift cards (on-chain escrow; the backend is a metadata index) --------
// Record a freshly-minted on-chain GiftCard so we can list it + serve the
// /g/:code share landing. The escrow + fee live on-chain; the claim SECRET stays
// in the share-link fragment and never reaches the backend.
app.post("/api/giftcards/record", async (req, res) => {
  if (!isDbConfigured()) {
    res.status(503).json({ error: "Gift cards are not available" });
    return;
  }
  const parsed = giftCardRecordSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues[0]?.message ?? "Invalid payload" });
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
    const card = await giftCardStore.recordCard({
      objectId: parsed.data.objectId,
      merchantId: parsed.data.merchantId,
      buyerAddr: parsed.data.sender,
      faceValueMicros: parsed.data.faceValueMicros,
    });
    const base = publicBaseUrl || baseUrlFor(req);
    res.json({ claimCode: card.claimCode, url: `${base}/g/${card.claimCode}` });
  } catch (error: unknown) {
    console.error("[giftcards] record failed", error instanceof Error ? error.message : error);
    res.status(500).json({ error: "Failed to record gift card" });
  }
});

// Resolve a claim code -> on-chain object id + issuer name (claim screen + /g
// landing). The app reads the live balance on-chain.
app.get("/api/giftcards/code/:code", async (req, res) => {
  if (!isDbConfigured()) {
    res.status(503).json({ error: "Gift cards are not available" });
    return;
  }
  const code = codeParamSchema.safeParse(req.params.code);
  if (!code.success) {
    res.status(400).json({ error: "Invalid code" });
    return;
  }
  try {
    const card = await giftCardStore.getByCode(code.data);
    if (!card) {
      res.status(404).json({ error: "Gift card not found" });
      return;
    }
    const profile = await merchantStore.getProfileByMerchantId(card.merchantId);
    res.json({
      objectId: card.objectId,
      merchantId: card.merchantId,
      issuerName: profile?.businessName ?? null,
      faceValueMicros: card.faceValueMicros,
      claimed: card.recipientAddr != null,
    });
  } catch (error: unknown) {
    console.error("[giftcards] resolve failed", error instanceof Error ? error.message : error);
    res.status(500).json({ error: "Failed to load gift card" });
  }
});

// Record the recipient after an on-chain claim (best-effort index update).
app.post("/api/giftcards/code/:code/claim", async (req, res) => {
  if (!isDbConfigured()) {
    res.status(503).json({ error: "Gift cards are not available" });
    return;
  }
  const code = codeParamSchema.safeParse(req.params.code);
  const parsed = giftCardClaimSchema.safeParse(req.body);
  if (!code.success || !parsed.success) {
    res.status(400).json({ error: "Invalid payload" });
    return;
  }
  try {
    const ok = await giftCardStore.setRecipient(code.data, parsed.data.recipient);
    if (!ok) {
      res.status(404).json({ error: "Gift card not found" });
      return;
    }
    res.json({ ok: true });
  } catch (error: unknown) {
    console.error("[giftcards] claim failed", error instanceof Error ? error.message : error);
    res.status(500).json({ error: "Failed to record claim" });
  }
});

// Index rows for a customer's claimed cards / a merchant's issued cards. Live
// balances are read on-chain by the app; this just enumerates the cards.
app.get("/api/giftcards", async (req, res) => {
  if (!isDbConfigured()) {
    res.json({ cards: [] });
    return;
  }
  const customer = typeof req.query.customer === "string" ? req.query.customer : "";
  const merchant = typeof req.query.merchant === "string" ? req.query.merchant : "";
  try {
    if (customer.startsWith("0x")) {
      res.json({ cards: await giftCardStore.listForCustomer(customer) });
      return;
    }
    if (merchant.startsWith("0x")) {
      res.json({ cards: await giftCardStore.listForMerchant(merchant) });
      return;
    }
    res.status(400).json({ error: "A customer or merchant address is required" });
  } catch (error: unknown) {
    console.error("[giftcards] list failed", error instanceof Error ? error.message : error);
    res.status(500).json({ error: "Failed to list gift cards" });
  }
});

// Shareable gift-card landing page. The claim SECRET is in the URL *fragment*
// (#s=…), which the browser never sends to the server; the page reads it client-
// side and builds brisk://claim?card=<objectId>&s=<secret>. The server only
// resolves code -> objectId + issuer + face value for display.
app.get("/g/:code", async (req, res) => {
  res.setHeader("Content-Type", "text/html; charset=utf-8");
  res.setHeader("ngrok-skip-browser-warning", "true");
  const code = codeParamSchema.safeParse(req.params.code);
  const card = code.success && isDbConfigured() ? await giftCardStore.getByCode(code.data) : null;
  const objectId = card?.objectId ?? "";
  const amount = card ? formatUsdMicros(card.faceValueMicros) : "";
  const profile = card ? await merchantStore.getProfileByMerchantId(card.merchantId) : null;
  const issuer = profile?.businessName ? escapeHtml(profile.businessName) : "a Brisk merchant";
  const title = card ? `Gift card · ${amount}` : "Brisk gift card";
  res.send(`<!doctype html><html lang="en"><head><meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>${escapeHtml(title)}</title>
<style>body{font-family:-apple-system,system-ui,sans-serif;background:#060912;color:#F4F8FB;display:flex;min-height:100vh;margin:0;align-items:center;justify-content:center;text-align:center}
.card{padding:32px;max-width:360px}.amt{font-size:44px;font-weight:800;color:#00E5A0;margin:8px 0}
a.btn{display:inline-block;margin-top:20px;padding:14px 22px;border-radius:16px;background:#00E5A0;color:#060912;font-weight:700;text-decoration:none}
.sub{color:#8FA0B5;font-size:14px}</style></head>
<body><div class="card">
<div class="sub">Gift card from ${issuer}</div>
<div class="amt">${amount || "Brisk gift card"}</div>
<div class="sub">Open Brisk to add it to your account.</div>
<a class="btn" id="open" href="brisk://">Open in Brisk</a>
</div>
<script>(function(){
  var card=${JSON.stringify(objectId)};
  var code=${JSON.stringify(code.success ? code.data : "")};
  var secret=(location.hash.match(/[#&]s=([^&]+)/)||[])[1]||"";
  if(!card){return;}
  var dl="brisk://claim?card="+encodeURIComponent(card)+"&code="+encodeURIComponent(code)+(secret?"&s="+encodeURIComponent(secret):"");
  document.getElementById("open").href=dl;
  try{ window.location.href=dl; }catch(e){}
})();</script>
</body></html>`);
});

// Merchant-shared "sell gift cards" landing: a customer opens this to buy a gift
// card for the merchant. Bounces into brisk://buy-gift-card?merchant=…&name=….
app.get("/gc/:merchantId", async (req, res) => {
  res.setHeader("Content-Type", "text/html; charset=utf-8");
  res.setHeader("ngrok-skip-browser-warning", "true");
  const id = merchantQuerySchema.safeParse(req.params.merchantId);
  const profile =
    id.success && isDbConfigured() ? await merchantStore.getProfileByMerchantId(id.data) : null;
  const merchantId = id.success ? id.data : "";
  const name = profile?.businessName ? escapeHtml(profile.businessName) : "this merchant";
  res.send(`<!doctype html><html lang="en"><head><meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>Buy a gift card${profile ? ` · ${name}` : ""}</title>
<style>body{font-family:-apple-system,system-ui,sans-serif;background:#060912;color:#F4F8FB;display:flex;min-height:100vh;margin:0;align-items:center;justify-content:center;text-align:center}
.card{padding:32px;max-width:360px}.amt{font-size:32px;font-weight:800;color:#00E5A0;margin:8px 0}
a.btn{display:inline-block;margin-top:20px;padding:14px 22px;border-radius:16px;background:#00E5A0;color:#060912;font-weight:700;text-decoration:none}
.sub{color:#8FA0B5;font-size:14px}</style></head>
<body><div class="card">
<div class="sub">Gift card</div>
<div class="amt">${name}</div>
<div class="sub">Open Brisk to buy a gift card for them.</div>
<a class="btn" id="open" href="brisk://">Open in Brisk</a>
</div>
<script>(function(){
  var m=${JSON.stringify(merchantId)};
  if(!m){return;}
  var dl="brisk://buy-gift-card?merchant="+encodeURIComponent(m)+"&name="+encodeURIComponent(${JSON.stringify(profile?.businessName ?? "")});
  document.getElementById("open").href=dl;
  try{ window.location.href=dl; }catch(e){}
})();</script>
</body></html>`);
});

// Shareable landing page. Tries to open the app (brisk://pay?code=…); if that
// doesn't take over, reveals a web fallback (amount + get-the-app + QR).
app.get("/p/:code", async (req, res) => {
  res.setHeader("Content-Type", "text/html; charset=utf-8");
  res.setHeader("ngrok-skip-browser-warning", "true");

  const code = linkCodeSchema.safeParse(req.params.code);
  const link = code.success && isDbConfigured() ? await linkStore.getLink(code.data) : null;

  const canceled = link?.status === "canceled";
  if (!link || link.expired || canceled) {
    const msg = !link
      ? "This payment link is invalid."
      : canceled
        ? "This payment link was canceled."
        : "This payment link has expired.";
    res.status(!link ? 404 : 410).send(`<!DOCTYPE html><html><head>
<meta charset="utf-8"/><meta name="viewport" content="width=device-width, initial-scale=1"/>
<title>Brisk</title></head>
<body style="margin:0;background:#0a0e12;color:#e8eef2;font-family:-apple-system,system-ui,sans-serif;
display:flex;min-height:100vh;align-items:center;justify-content:center;text-align:center;padding:24px">
<div><div style="font-size:40px">🔗</div><h2>${escapeHtml(msg)}</h2>
<p style="color:#8aa">Ask the merchant for a fresh link.</p></div></body></html>`);
    return;
  }

  const deepLink = `brisk://pay?code=${link.code}`;
  const amount = formatUsdMicros(link.amountMicros);
  const merchant = escapeHtml(link.merchantName);
  const paid = link.status === "paid";
  const pageUrl = `${baseUrlFor(req)}/p/${link.code}`;
  const qr = `https://api.qrserver.com/v1/create-qr-code/?size=220x220&margin=0&data=${encodeURIComponent(pageUrl)}`;

  res.status(200).send(`<!DOCTYPE html><html><head>
<meta charset="utf-8"/><meta name="viewport" content="width=device-width, initial-scale=1"/>
<title>Pay ${amount} · Brisk</title>
<style>
  :root{color-scheme:dark}
  body{margin:0;background:#0a0e12;color:#e8eef2;font-family:-apple-system,system-ui,sans-serif;
    display:flex;min-height:100vh;align-items:center;justify-content:center;padding:24px}
  .card{width:100%;max-width:380px;text-align:center}
  .label{font-size:13px;letter-spacing:2px;text-transform:uppercase;color:#7e8a96}
  .amt{font-size:48px;font-weight:800;margin:6px 0 2px;
    background:linear-gradient(90deg,#34d399,#60a5fa,#a78bfa);-webkit-background-clip:text;background-clip:text;color:transparent}
  .merchant{color:#aebac4;margin-bottom:24px}
  .btn{display:block;width:100%;box-sizing:border-box;padding:16px;border-radius:16px;border:0;
    font-size:16px;font-weight:700;text-decoration:none;cursor:pointer;margin-top:12px}
  .primary{background:linear-gradient(90deg,#34d399,#60a5fa);color:#06121a}
  .ghost{background:#121821;color:#e8eef2;border:1px solid #243040}
  .disabled{background:#121821;color:#5b6772;border:1px solid #1c2530;cursor:not-allowed}
  .fallback{margin-top:28px;opacity:0;transition:opacity .4s;border-top:1px solid #1c2530;padding-top:24px}
  .fallback.show{opacity:1}
  .qr{background:#fff;padding:10px;border-radius:12px;display:inline-block;margin-top:14px}
  .paid{color:#34d399;font-weight:700;margin-bottom:16px}
  small{color:#7e8a96}
</style></head>
<body><div class="card">
  <div class="label">${paid ? "Already paid" : "Payment request"}</div>
  <div class="amt">${amount}</div>
  <div class="merchant">to ${merchant}</div>
  ${paid ? '<div class="paid">✓ This request has been paid.</div>' : ""}
  <a class="btn primary" href="${deepLink}">Open in Brisk</a>
  <div class="fallback" id="fallback">
    <p>Don't have Brisk yet?</p>
    <a class="btn primary" href="/pay/${link.code}">Pay in browser</a>
    <a class="btn ghost" href="https://play.google.com/store" target="_blank" rel="noopener">Get it on Google Play</a>
    <a class="btn ghost" href="https://apps.apple.com/" target="_blank" rel="noopener">Download on the App Store</a>
    <div class="qr"><img src="${qr}" width="220" height="220" alt="Scan to open this link"/></div>
    <p><small>Scan with your phone to open this request in Brisk.</small></p>
  </div>
</div>
<script>
  // Try to hand off to the installed app immediately; if we're still here after
  // a moment, the app isn't installed (or didn't take over) — show the fallback.
  (function () {
    var fired = false;
    try { window.location.href = ${JSON.stringify(deepLink)}; fired = true; } catch (e) {}
    setTimeout(function () { document.getElementById("fallback").classList.add("show"); }, 1500);
  })();
</script>
</body></html>`);
});

// SPA fallback: any /pay/* path that isn't a static asset serves the web pay app
// shell, which reads the :code from the path and resolves it client-side.
app.get("/pay/*splat", (_req, res) => {
  res.sendFile(path.join(WEBPAY_DIST, "index.html"));
});

const server = app.listen(port, () => {
  console.log(`[brisk-backend] listening on :${port}`);
});

// ─── POS terminal WebSocket ──────────────────────────────────────────────────
// Merchant phones (in terminal mode) hold a socket open here; the backend pushes
// SALE messages down the socket for the matching terminalId. Attached to the same
// http.Server (Render free supports WS upgrades on the same port). Auth: the
// terminalId + token issued at registration, passed as query params.

type LiveSocket = WebSocket & { isAlive?: boolean };

const posWss = new WebSocketServer({ noServer: true });

server.on("upgrade", (req, socket, head) => {
  let url: URL;
  try {
    url = new URL(req.url ?? "", "http://localhost");
  } catch {
    socket.destroy();
    return;
  }
  if (url.pathname !== "/pos/v1/socket") {
    socket.destroy();
    return;
  }
  const terminalId = url.searchParams.get("terminalId") ?? "";
  const token = url.searchParams.get("token") ?? "";

  void (async () => {
    if (!isDbConfigured()) {
      socket.write("HTTP/1.1 503 Service Unavailable\r\n\r\n");
      socket.destroy();
      return;
    }
    const terminal = await posStore.getTerminal(terminalId).catch(() => null);
    if (!terminal || !token || terminal.token !== token) {
      socket.write("HTTP/1.1 401 Unauthorized\r\n\r\n");
      socket.destroy();
      return;
    }
    posWss.handleUpgrade(req, socket, head, (ws) => {
      posWss.emit("connection", ws, terminal);
    });
  })();
});

posWss.on("connection", (ws: LiveSocket, terminal: posStore.PosTerminal) => {
  const { terminalId, tillId } = terminal;
  console.log("[pos] terminal socket connected", { terminalId });

  // Last-writer-wins: if the same terminal reconnects, drop the stale socket.
  const prior = terminalSockets.get(terminalId);
  if (prior && prior !== ws) prior.terminate();
  terminalSockets.set(terminalId, ws);
  void posStore.touchTerminal(terminalId).catch(() => {});

  ws.isAlive = true;
  ws.on("pong", () => {
    ws.isAlive = true;
  });
  // The device ACKs each SALE it receives; that (not the send) is what marks the
  // session delivered, so an un-received push is redelivered on the next connect.
  ws.on("message", (data: RawData) => {
    let msg: unknown;
    try {
      msg = JSON.parse(data.toString());
    } catch {
      return; // ignore non-JSON frames
    }
    const m = msg as { type?: unknown; sessionId?: unknown };
    if (m?.type === "ACK" && typeof m.sessionId === "string") {
      void posStore
        .markDelivered(m.sessionId)
        .catch((e) =>
          console.warn("[pos] ack markDelivered failed", e instanceof Error ? e.message : e),
        );
    }
  });
  ws.on("close", () => {
    if (terminalSockets.get(terminalId) === ws) terminalSockets.delete(terminalId);
    console.log("[pos] terminal socket closed", { terminalId });
  });
  ws.on("error", (err) => {
    console.warn("[pos] terminal socket error", { terminalId, error: err.message });
  });

  // Redeliver any sales that haven't been ACKed yet (arrived while offline, or a
  // prior push that never landed). The device de-dupes by sessionId.
  void posStore
    .getUndeliveredSessions(terminalId, posSessionTtlSec)
    .then((pending) => {
      for (const session of pending) {
        ws.send(JSON.stringify(saleMessage(session, tillId)));
        console.log("[pos] redelivering pending sale", {
          terminalId,
          sessionId: session.sessionId,
        });
      }
    })
    .catch((e) => console.error("[pos] drain failed", e instanceof Error ? e.message : e));
});

// Heartbeat: terminate sockets that stop answering pings (30s) so the registry
// doesn't leak dead entries (Render's proxy silently drops idle connections).
const posHeartbeat = setInterval(() => {
  for (const ws of posWss.clients as Set<LiveSocket>) {
    if (ws.isAlive === false) {
      ws.terminate();
      continue;
    }
    ws.isAlive = false;
    ws.ping();
  }
}, 30_000);
posHeartbeat.unref();

void ensureSchema().catch((e) => console.error("[db] ensureSchema failed", e));

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
