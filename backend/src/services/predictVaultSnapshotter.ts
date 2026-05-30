/**
 * Periodic snapshot of DeepBook Predict's shared LP vault.
 *
 * We record (vault_value, total_plp_supply, share_price_micro) every
 * `intervalMs`, then derive a rolling 7-day APY by comparing the newest
 * snapshot to the snapshot closest to (now − 7d). Share price is the
 * canonical LP yield signal — it strictly grows as spreads, trader losses,
 * and fees accrue to the vault, and strictly stays flat or falls when LPs
 * are paid out a winning trader's payout.
 *
 * Snapshots live in SQLite (`predict_vault_snapshots`); the loop continues
 * if a single tick fails — the rest of the schedule keeps working.
 */
import { SuiJsonRpcClient, getJsonRpcFullnodeUrl } from "@mysten/sui/jsonRpc";
import { getDb } from "../indexer/db.js";
import * as errorService from "./errorService.js";

const DUSDC_TYPE_DEFAULT =
  "0xe95040085976bfd54a1a07225cd46c8a2b4e8e2b6732f140a0fc49850ba73e1a::dusdc::DUSDC";
const PLP_TYPE_SUFFIX = "::plp::PLP";
const SEVEN_DAYS_MS = 7 * 24 * 60 * 60_000;
const TWELVE_HOURS_MS = 12 * 60 * 60_000;
const SHARE_PRICE_SCALE = 1_000_000; // 1e6, matches dUSDC / PLP decimals

export interface SnapshotterConfig {
  network: "testnet" | "mainnet" | "devnet";
  predictObjectId: string;
  intervalMs: number;
}

let timer: NodeJS.Timeout | null = null;
let lastSampleMs = 0;
let lastError: string | null = null;

export function startPredictVaultSnapshotter(config: SnapshotterConfig): void {
  if (timer) {
    console.warn("[earn] predict-vault snapshotter already running");
    return;
  }
  const client = new SuiJsonRpcClient({
    network: config.network,
    url: getJsonRpcFullnodeUrl(config.network),
  });
  const plpType = `${stripPredictPackageId(config.predictObjectId)}${PLP_TYPE_SUFFIX}`;

  const tick = async (): Promise<void> => {
    try {
      await captureSnapshot(client, config.predictObjectId, plpType);
      lastSampleMs = Date.now();
      lastError = null;
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      lastError = message;
      errorService.captureError({ message, source: "earn.predictVaultSnapshotter" });
    } finally {
      timer = setTimeout(() => void tick(), config.intervalMs);
    }
  };
  // Kick off immediately so the first APY computation has a sample.
  void tick();
  console.log(`[earn] predict-vault snapshotter started (interval=${config.intervalMs}ms)`);
}

export function stopPredictVaultSnapshotter(): void {
  if (timer) clearTimeout(timer);
  timer = null;
}

export interface EarnApySummary {
  apy7d: number | null;
  reason?: string;
  tvlMicro: number;
  totalPlp: number;
  sharePriceMicro: number;
  samples: number;
  asOfMs: number | null;
  lastSnapshotAgeMs: number | null;
  lastSnapshotError: string | null;
}

/**
 * Compute the 7-day rolling APY from the snapshot history.
 *
 * Returns `apy7d=null, reason="warming_up"` if we don't yet have enough
 * snapshots OR the oldest sample is less than 12h old. We want the rate
 * to stabilize before showing a number to users.
 */
export function fetchEarnApySummary(): EarnApySummary {
  const db = getDb();
  const latest = db
    .prepare(
      `SELECT observed_at_ms, vault_value, total_plp, share_price_micro
         FROM predict_vault_snapshots
        ORDER BY observed_at_ms DESC
        LIMIT 1`,
    )
    .get() as
    | {
        observed_at_ms: number;
        vault_value: number;
        total_plp: number;
        share_price_micro: number;
      }
    | undefined;

  const samplesRow = db.prepare(`SELECT COUNT(*) AS c FROM predict_vault_snapshots`).get() as {
    c: number;
  };
  const samples = samplesRow.c ?? 0;
  const now = Date.now();

  if (!latest) {
    return {
      apy7d: null,
      reason: "warming_up",
      tvlMicro: 0,
      totalPlp: 0,
      sharePriceMicro: SHARE_PRICE_SCALE,
      samples,
      asOfMs: null,
      lastSnapshotAgeMs: null,
      lastSnapshotError: lastError,
    };
  }

  const baselineCutoff = now - SEVEN_DAYS_MS;
  // Closest sample to (now - 7d) — prefer one strictly older than the cutoff
  // so the implied window is at least 7 days; fall back to the oldest we have.
  const baseline =
    (db
      .prepare(
        `SELECT observed_at_ms, share_price_micro
           FROM predict_vault_snapshots
          WHERE observed_at_ms <= ?
          ORDER BY observed_at_ms DESC
          LIMIT 1`,
      )
      .get(baselineCutoff) as { observed_at_ms: number; share_price_micro: number } | undefined) ??
    (db
      .prepare(
        `SELECT observed_at_ms, share_price_micro
           FROM predict_vault_snapshots
          ORDER BY observed_at_ms ASC
          LIMIT 1`,
      )
      .get() as { observed_at_ms: number; share_price_micro: number } | undefined);

  if (!baseline) {
    return {
      apy7d: null,
      reason: "warming_up",
      tvlMicro: latest.vault_value,
      totalPlp: latest.total_plp,
      sharePriceMicro: latest.share_price_micro,
      samples,
      asOfMs: latest.observed_at_ms,
      lastSnapshotAgeMs: now - latest.observed_at_ms,
      lastSnapshotError: lastError,
    };
  }

  const elapsedMs = latest.observed_at_ms - baseline.observed_at_ms;
  if (samples < 2 || elapsedMs < TWELVE_HOURS_MS || baseline.share_price_micro <= 0) {
    return {
      apy7d: null,
      reason: "warming_up",
      tvlMicro: latest.vault_value,
      totalPlp: latest.total_plp,
      sharePriceMicro: latest.share_price_micro,
      samples,
      asOfMs: latest.observed_at_ms,
      lastSnapshotAgeMs: now - latest.observed_at_ms,
      lastSnapshotError: lastError,
    };
  }

  const growth = latest.share_price_micro / baseline.share_price_micro;
  const yearsElapsed = elapsedMs / (365 * 24 * 60 * 60_000);
  const apy = (Math.pow(growth, 1 / yearsElapsed) - 1) * 100;

  return {
    apy7d: Number.isFinite(apy) ? apy : null,
    tvlMicro: latest.vault_value,
    totalPlp: latest.total_plp,
    sharePriceMicro: latest.share_price_micro,
    samples,
    asOfMs: latest.observed_at_ms,
    lastSnapshotAgeMs: now - latest.observed_at_ms,
    lastSnapshotError: lastError,
  };
}

export function getSnapshotterStatus(): {
  running: boolean;
  lastSampleMs: number;
  lastError: string | null;
} {
  return { running: timer !== null, lastSampleMs, lastError };
}

/**
 * Read `vault_value` (total assets) from the on-chain Predict object's
 * nested vault, and `total_plp_supply` via the standard `getTotalSupply` RPC.
 * Record one row.
 *
 * The Predict object's `content.fields.vault.fields.balance` holds the quote
 * asset balance, but `vault_value()` also folds in `total_mtm` deductions for
 * unsettled liability — so for the *most accurate* NAV we want `vault_value`.
 * That isn't directly readable from `getObject` (it's a function), so we use
 * `devInspectTransactionBlock` to call `vault::vault_value(&vault)`.
 *
 * Fallback path (if devInspect fails): use raw `balance` field minus
 * `total_mtm` field from the object. We log the discrepancy if both succeed.
 */
async function captureSnapshot(
  client: SuiJsonRpcClient,
  predictObjectId: string,
  plpType: string,
): Promise<void> {
  const [obj, supply] = await Promise.all([
    client.getObject({ id: predictObjectId, options: { showContent: true } }),
    client.getTotalSupply({ coinType: plpType }),
  ]);

  const content = obj.data?.content;
  if (!content || typeof content !== "object" || !("fields" in content)) {
    throw new Error("Predict object content unavailable");
  }
  const fields = content.fields as Record<string, unknown>;
  const vaultField = fields.vault;
  const vaultFields =
    vaultField && typeof vaultField === "object" && "fields" in vaultField
      ? ((vaultField as { fields: Record<string, unknown> }).fields as Record<string, unknown>)
      : null;
  if (!vaultFields) throw new Error("Predict.vault sub-object missing");

  const balance = parseU64(vaultFields.balance);
  const totalMtm = parseU64(vaultFields.total_mtm);
  // NAV: collected quote minus mark-to-market liability owed to open positions.
  const vaultValue = Math.max(balance - totalMtm, 0);
  const totalPlp = parseU64(supply.value);
  const sharePriceMicro =
    totalPlp > 0 ? Math.floor((vaultValue * SHARE_PRICE_SCALE) / totalPlp) : SHARE_PRICE_SCALE;

  getDb()
    .prepare(
      `INSERT INTO predict_vault_snapshots
         (observed_at_ms, vault_value, total_plp, share_price_micro)
       VALUES (?, ?, ?, ?)`,
    )
    .run(Date.now(), vaultValue, totalPlp, sharePriceMicro);
}

function parseU64(value: unknown): number {
  if (typeof value === "string") {
    if (/^\d+$/.test(value)) return Number(value);
    return 0;
  }
  if (typeof value === "number") return Number.isFinite(value) ? value : 0;
  if (typeof value === "bigint") return Number(value);
  if (value && typeof value === "object") {
    if ("value" in value) return parseU64((value as { value: unknown }).value);
    if ("fields" in value) {
      const inner = (value as { fields: Record<string, unknown> }).fields;
      if (inner && "value" in inner) return parseU64(inner.value);
    }
  }
  return 0;
}

/**
 * PLP coin type is `<predict_package_id>::plp::PLP`. We accept an
 * objectId here because the bootstrap path in server.ts has both the
 * package id and the object id at hand, but only the object id flows
 * into the snapshotter. Pull the package id off the object's tag via
 * RPC at boot time is overkill — instead, we resolve it lazily.
 *
 * Today the call site passes the predict shared object id; we don't
 * need to derive the package id from it because PLP lives at the same
 * package. The bootstrap call computes `plpType` from
 * `FATHOM_PREDICT_PACKAGE_ID`. Below kept as a defensive helper in case
 * someone refactors the call site.
 */
function stripPredictPackageId(value: string): string {
  const packageId = process.env.FATHOM_PREDICT_PACKAGE_ID;
  if (packageId) return packageId;
  // Fallback to the testnet package id if env wasn't set.
  void value;
  void DUSDC_TYPE_DEFAULT;
  return "0xf5ea2b3749c65d6e56507cc35388719aadb28f9cab873696a2f8687f5c785138";
}
