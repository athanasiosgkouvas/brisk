/**
 * DeepBook orderbook price feed — records the live SUI/DBUSDC mid + best
 * bid/ask + spread every `intervalMs`, mirroring `predictVaultSnapshotter`.
 *
 * Why SUI/DBUSDC specifically: it is the only DeepBook v3 testnet pool with
 * real two-sided liquidity (the DBTC/DBUSDC book is empty — `mid_price`
 * aborts). It is also the exact book the Smart Bet spot leg trades against, so
 * this feed is the honest, live data behind that leg. We deliberately do NOT
 * use it to re-price the Predict prediction markets: those are BTC-only on
 * testnet, and pricing BTC off a SUI book would be dishonest. See
 * `getActiveMarkets` — prediction-market odds stay on the predict-server
 * forward.
 *
 * Read via `devInspectTransactionBlock` (same server-side pattern the vault
 * snapshotter uses); the loop continues if a single tick fails.
 */
import { SuiJsonRpcClient, getJsonRpcFullnodeUrl } from "@mysten/sui/jsonRpc";
import { Transaction } from "@mysten/sui/transactions";
import { getDb } from "./db.js";
import * as errorService from "../services/errorService.js";

// Backend-local DeepBook constants (do NOT import the RN app's utils/constants).
const DEEPBOOK_PACKAGE_ID =
  process.env.FATHOM_DEEPBOOK_PACKAGE_ID ??
  "0x22be4cade64bf2d02412c7e8d0e8beea2f78828b948118d46735315409371a3c";
const SUI_DBUSDC_POOL =
  process.env.FATHOM_DEEPBOOK_SUI_QUOTE_POOL ??
  "0x1c19362ca52b8ffd7a33cee805a67d40f31e6ba303753fd3a4cfdfacea7163a5";
const SUI_TYPE = "0x2::sui::SUI";
const DBUSDC_TYPE =
  process.env.FATHOM_DEEPBOOK_QUOTE_TYPE ??
  "0xf7152c05930480cd740d7311b5b8b45c6f488e3a53a11c3f74a6fac36a52e0d7::DBUSDC::DBUSDC";
// For the SUI(9)/DBUSDC(6) pool, the raw price equals quote micros per 1 SUI,
// i.e. micro-USD (912000 → $0.912). Consumers divide by this to get USD.
const PRICE_MICRO_PER_USD = 1_000_000;

const FEED_ASSET = "SUI";

export interface DeepbookPriceFeedConfig {
  network: "testnet" | "mainnet" | "devnet";
  intervalMs: number;
}

let timer: NodeJS.Timeout | null = null;
let lastSampleMs = 0;
let lastError: string | null = null;

function readLeU64(bytes: number[]): bigint {
  let v = 0n;
  for (let i = 0; i < 8; i += 1) v |= BigInt(bytes[i] ?? 0) << BigInt(i * 8);
  return v;
}

/** Decode a BCS `vector<u64>` (ULEB128 length prefix + n × 8 LE bytes). */
function decodeU64Vec(bytes: number[]): bigint[] {
  if (!bytes || bytes.length === 0) return [];
  // ULEB128 length.
  let idx = 0;
  let len = 0;
  let shift = 0;
  for (;;) {
    const b = bytes[idx++] ?? 0;
    len |= (b & 0x7f) << shift;
    if ((b & 0x80) === 0) break;
    shift += 7;
  }
  const out: bigint[] = [];
  for (let i = 0; i < len; i += 1) {
    out.push(readLeU64(bytes.slice(idx + i * 8, idx + i * 8 + 8)));
  }
  return out;
}

export function startDeepbookPriceFeed(config: DeepbookPriceFeedConfig): void {
  if (timer) {
    console.warn("[deepbook] price feed already running");
    return;
  }
  const client = new SuiJsonRpcClient({
    network: config.network,
    url: getJsonRpcFullnodeUrl(config.network),
  });

  const tick = async (): Promise<void> => {
    try {
      await captureTick(client);
      lastSampleMs = Date.now();
      lastError = null;
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      lastError = message;
      errorService.captureError({ message, source: "deepbook.priceFeed" });
    } finally {
      timer = setTimeout(() => void tick(), config.intervalMs);
    }
  };
  void tick();
  console.log(`[deepbook] price feed started (interval=${config.intervalMs}ms)`);
}

export function stopDeepbookPriceFeed(): void {
  if (timer) clearTimeout(timer);
  timer = null;
}

export function getDeepbookPriceFeedStatus(): {
  running: boolean;
  lastSampleMs: number;
  lastError: string | null;
} {
  return { running: timer !== null, lastSampleMs, lastError };
}

export interface DeepbookTicker {
  asset: string;
  midMicro: number;
  bidMicro: number | null;
  askMicro: number | null;
  spreadBps: number | null;
  microPerUsd: number;
  observedAtMs: number;
  ageMs: number;
}

/** Latest recorded ticker for `asset` (default SUI), or null if none yet. */
export function getLatestDeepbookTicker(asset: string = FEED_ASSET): DeepbookTicker | null {
  const row = getDb()
    .prepare(
      `SELECT asset, mid_micro, bid_micro, ask_micro, spread_bps, observed_at_ms
         FROM deepbook_price_snapshots
        WHERE asset = ?
        ORDER BY observed_at_ms DESC
        LIMIT 1`,
    )
    .get(asset) as
    | {
        asset: string;
        mid_micro: number;
        bid_micro: number | null;
        ask_micro: number | null;
        spread_bps: number | null;
        observed_at_ms: number;
      }
    | undefined;
  if (!row) return null;
  return {
    asset: row.asset,
    midMicro: row.mid_micro,
    bidMicro: row.bid_micro,
    askMicro: row.ask_micro,
    spreadBps: row.spread_bps,
    microPerUsd: PRICE_MICRO_PER_USD,
    observedAtMs: row.observed_at_ms,
    ageMs: Date.now() - row.observed_at_ms,
  };
}

async function captureTick(client: SuiJsonRpcClient): Promise<void> {
  const tx = new Transaction();
  tx.moveCall({
    target: `${DEEPBOOK_PACKAGE_ID}::pool::mid_price`,
    typeArguments: [SUI_TYPE, DBUSDC_TYPE],
    arguments: [tx.object(SUI_DBUSDC_POOL), tx.object("0x6")],
  });
  tx.moveCall({
    target: `${DEEPBOOK_PACKAGE_ID}::pool::get_level2_ticks_from_mid`,
    typeArguments: [SUI_TYPE, DBUSDC_TYPE],
    arguments: [tx.object(SUI_DBUSDC_POOL), tx.pure.u64(1), tx.object("0x6")],
  });

  const inspect = await client.devInspectTransactionBlock({
    transactionBlock: tx,
    sender: "0x0000000000000000000000000000000000000000000000000000000000000000",
  });

  const midRet = inspect?.results?.[0]?.returnValues as Array<[number[], string]> | undefined;
  if (!midRet || midRet.length < 1) throw new Error("mid_price returned no value (empty book?)");
  const midMicro = Number(readLeU64(midRet[0][0]));
  if (midMicro <= 0) throw new Error("mid_price was zero");

  // Best bid/ask from level2 (best-effort — book may be one-sided).
  let bidMicro: number | null = null;
  let askMicro: number | null = null;
  const l2 = inspect?.results?.[1]?.returnValues as Array<[number[], string]> | undefined;
  if (l2 && l2.length >= 3) {
    const bidPrices = decodeU64Vec(l2[0][0]); // bid prices (desc from mid)
    const askPrices = decodeU64Vec(l2[2][0]); // ask prices (asc from mid)
    if (bidPrices.length > 0) bidMicro = Number(bidPrices[0]);
    if (askPrices.length > 0) askMicro = Number(askPrices[0]);
  }
  const spreadBps =
    bidMicro && askMicro && midMicro > 0
      ? Math.round(((askMicro - bidMicro) / midMicro) * 10_000)
      : null;

  getDb()
    .prepare(
      `INSERT INTO deepbook_price_snapshots
         (asset, mid_micro, bid_micro, ask_micro, spread_bps, observed_at_ms)
       VALUES (?, ?, ?, ?, ?, ?)`,
    )
    .run(FEED_ASSET, midMicro, bidMicro, askMicro, spreadBps, Date.now());
}
