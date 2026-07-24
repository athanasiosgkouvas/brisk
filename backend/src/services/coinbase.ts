import { generateJwt } from "@coinbase/cdp-sdk/auth";

/**
 * Coinbase CDP Onramp/Offramp — the ONLY place Coinbase specifics live.
 *
 * The app + webpay never talk to Coinbase directly: they POST a Brisk endpoint
 * that calls in here for a ready-to-open hosted URL. This keeps the CDP Secret
 * API key server-side and makes a second provider (or a future headless path,
 * if Coinbase adds Sui there) a backend-only swap behind the same contract.
 *
 * Hosted flow (the only Sui-capable path today — same one Slush uses):
 *   1. mint a single-use session token from the CDP token API (JWT-bearer auth)
 *   2. build a pay(-sandbox).coinbase.com URL carrying that token + our params
 * Apple Pay / Google Pay still render inside Coinbase's sheet (Coinbase is the
 * merchant of record), so we need no Apple merchant-id / native modules.
 */

const CDP_API_KEY_ID = process.env.CDP_API_KEY_ID ?? "";
const CDP_API_KEY_SECRET = process.env.CDP_API_KEY_SECRET ?? "";
/** `sandbox` (default, no real money — test card 4242…) or `production`. */
const CDP_ENV = (process.env.CDP_ENV ?? "sandbox").toLowerCase();

// CDP token API — always production host regardless of pay-widget env.
const TOKEN_HOST = "api.developer.coinbase.com";
const TOKEN_PATH = "/onramp/v1/token";
// The hosted pay widget: sandbox mirrors the guest-checkout flow with test cards.
const PAY_HOST = CDP_ENV === "production" ? "pay.coinbase.com" : "pay-sandbox.coinbase.com";

/** Sui is our home network; native Circle USDC is the only asset we ramp. */
const DEFAULT_NETWORK = "sui";
const DEFAULT_ASSET = "USDC";

export const coinbaseEnv = CDP_ENV;

/** True once the CDP Secret API key is configured (else endpoints 503). */
export function isCoinbaseConfigured(): boolean {
  return Boolean(CDP_API_KEY_ID && CDP_API_KEY_SECRET);
}

type AddressEntry = { address: string; blockchains: string[] };

/**
 * Mint a single-use CDP session token (expires in 5 min). Required on every
 * hosted URL since 2025-07-31 — the wallet address rides in the token, never as
 * a query param. `generateJwt` handles both EdDSA and ES256 keys + the exact
 * claims/lifetime the token API expects.
 */
async function mintSessionToken(addresses: AddressEntry[], clientIp?: string): Promise<string> {
  const jwt = await generateJwt({
    apiKeyId: CDP_API_KEY_ID,
    apiKeySecret: CDP_API_KEY_SECRET,
    requestMethod: "POST",
    requestHost: TOKEN_HOST,
    requestPath: TOKEN_PATH,
    expiresIn: 120,
  });

  const res = await fetch(`https://${TOKEN_HOST}${TOKEN_PATH}`, {
    method: "POST",
    headers: { Authorization: `Bearer ${jwt}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      addresses,
      assets: [DEFAULT_ASSET],
      ...(clientIp ? { clientIp } : {}),
    }),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`CDP token mint failed (${res.status}): ${text}`);
  }

  // Response is { token, channel_id }; tolerate a `data`-wrapped variant.
  const json = (await res.json()) as {
    token?: string;
    data?: { token?: string };
  };
  const token = json.token ?? json.data?.token;
  if (!token) throw new Error("CDP token response missing token");
  return token;
}

/** Shared shape for both ramp directions — they differ only by these params. */
type RampSessionParams = {
  /** Destination (onramp) / source (offramp) Sui address. */
  address: string;
  /** ≤50-char correlation id echoed back on the webhook (NOT the raw address). */
  partnerUserRef: string;
  /** Deep link Coinbase returns the user to on completion. */
  redirectUrl: string;
  /** Optional preset fiat amount (USD/CAD/GBP/EUR); Coinbase auto-detects the
   *  user's currency, so this is interpreted in that currency. */
  presetFiatAmount?: number;
  clientIp?: string;
};

/**
 * Build the hosted ONRAMP ("buy USDC") URL. No fiat currency / country is
 * pinned — Coinbase auto-detects for multi-region support and drives the
 * available payment methods accordingly.
 */
export async function createOnrampUrl(params: RampSessionParams): Promise<string> {
  const token = await mintSessionToken(
    [{ address: params.address, blockchains: [DEFAULT_NETWORK] }],
    params.clientIp,
  );

  const url = new URL(`https://${PAY_HOST}/buy/select-asset`);
  url.searchParams.set("sessionToken", token);
  url.searchParams.set("defaultNetwork", DEFAULT_NETWORK);
  url.searchParams.set("defaultAsset", DEFAULT_ASSET);
  if (params.presetFiatAmount && params.presetFiatAmount > 0) {
    url.searchParams.set("presetFiatAmount", String(params.presetFiatAmount));
  }
  url.searchParams.set("partnerUserRef", params.partnerUserRef);
  url.searchParams.set("redirectUrl", params.redirectUrl);
  return url.toString();
}
