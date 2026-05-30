/**
 * Polls predict-server for oracle metadata + forward price and upserts into
 * `oracle_snapshots`. The app no longer hits predict-server directly — it
 * reads from this cache via /api/markets/active.
 *
 * predict-server is undocumented and the JSON shape is unstable, so the
 * parser is defensive (resilient field mapping, fail-soft on missing rows).
 */
import { getDb } from "./db.js";
import * as errorService from "../services/errorService.js";

const REFRESH_INTERVAL_MS = 30_000;
const TRADABLE_WINDOW_MIN_MS = 60_000;
const TRADABLE_WINDOW_MAX_MS = 31 * 24 * 60 * 60_000; // ≤ 1 month (matches longest timeframe bucket)

let timer: NodeJS.Timeout | null = null;
let lastTickMs = 0;
let predictServerUrl = "";
let predictObjectId = "";

export interface MarketsFeedConfig {
  predictServerUrl: string;
  predictObjectId: string;
  intervalMs?: number;
}

function toNumber(value: unknown): number {
  if (typeof value === "number") return value;
  if (typeof value === "string") return Number(value);
  return 0;
}

function toLowerStatus(value: unknown): string {
  return String(value ?? "").toLowerCase();
}

export function startMarketsFeed(config: MarketsFeedConfig): void {
  if (timer) {
    console.warn("[marketsFeed] already running");
    return;
  }
  predictServerUrl = config.predictServerUrl.replace(/\/$/, "");
  predictObjectId = config.predictObjectId;
  const intervalMs = config.intervalMs ?? REFRESH_INTERVAL_MS;
  console.log(`[marketsFeed] starting (interval=${intervalMs}ms)`);
  // Kick off immediately, then on the interval.
  void tick().finally(() => {
    timer = setInterval(() => {
      void tick();
    }, intervalMs);
  });
}

export function stopMarketsFeed(): void {
  if (timer) clearInterval(timer);
  timer = null;
}

export function getMarketsFeedHealth(): { lastTickMs: number; lastTickAgeMs: number } {
  return {
    lastTickMs,
    lastTickAgeMs: lastTickMs === 0 ? -1 : Date.now() - lastTickMs,
  };
}

async function tick(): Promise<void> {
  try {
    const oracleRows = await fetchOracleRows();
    const now = Date.now();
    const fresh = oracleRows.filter((row) => {
      const expiry = toNumber(row.expiry);
      const delta = expiry - now;
      return delta >= TRADABLE_WINDOW_MIN_MS && delta <= TRADABLE_WINDOW_MAX_MS;
    });

    // Fetch state per oracle in parallel; keep failures isolated.
    const enriched = await Promise.all(
      fresh.map(async (row) => {
        const oracleId = String(row.oracle_id ?? row.oracleId ?? "");
        if (!oracleId) return null;
        const state = await fetchOracleStateRow(oracleId).catch(() => null);
        return { row, state };
      }),
    );

    const upsert = getDb().prepare(
      `INSERT INTO oracle_snapshots
         (oracle_id, expiry, asset, status, settlement_price, spot, forward, min_strike, tick_size, last_seen_ms)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(oracle_id, expiry) DO UPDATE SET
         asset = excluded.asset,
         status = excluded.status,
         settlement_price = COALESCE(excluded.settlement_price, oracle_snapshots.settlement_price),
         spot = excluded.spot,
         forward = excluded.forward,
         min_strike = excluded.min_strike,
         tick_size = excluded.tick_size,
         last_seen_ms = excluded.last_seen_ms`,
    );

    for (const entry of enriched) {
      if (!entry) continue;
      const { row, state } = entry;
      const oracleId = String(row.oracle_id ?? row.oracleId ?? "");
      const expiry = toNumber(row.expiry);
      const oracleObj = (state?.oracle as Record<string, unknown> | undefined) ?? {};
      const latestPrice = (state?.latest_price as Record<string, unknown> | undefined) ?? {};
      const settledRaw = toNumber(oracleObj.settlement_price);
      upsert.run(
        oracleId,
        expiry,
        String(row.underlying_asset ?? oracleObj.underlying_asset ?? "ASSET"),
        toLowerStatus(row.status ?? oracleObj.status),
        settledRaw > 0 ? settledRaw : null,
        toNumber(latestPrice.spot) || null,
        toNumber(latestPrice.forward) || null,
        toNumber(row.min_strike) || null,
        toNumber(row.tick_size) || null,
        Date.now(),
      );
    }

    lastTickMs = Date.now();
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    errorService.captureError({ message, source: "marketsFeed.tick" });
  }
}

type OracleRow = Record<string, unknown>;

async function fetchOracleRows(): Promise<OracleRow[]> {
  const res = await fetch(`${predictServerUrl}/predicts/${predictObjectId}/oracles`);
  if (!res.ok) throw new Error(`predict-server /oracles ${res.status}`);
  const json = (await res.json()) as unknown;
  if (Array.isArray(json)) return json as OracleRow[];
  // Some predict-server builds wrap the array in { oracles: [...] }.
  if (json && typeof json === "object" && Array.isArray((json as { oracles?: unknown }).oracles)) {
    return (json as { oracles: OracleRow[] }).oracles;
  }
  return [];
}

async function fetchOracleStateRow(oracleId: string): Promise<Record<string, unknown> | null> {
  const res = await fetch(`${predictServerUrl}/oracles/${oracleId}/state`);
  if (!res.ok) return null;
  return (await res.json()) as Record<string, unknown>;
}
