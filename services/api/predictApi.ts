import { ENV } from "@/utils/constants";
import type { MarketCard, OracleState } from "@/types/market";

type ManagerSummary = {
  managerId: string;
  owner?: string;
};

type ManagerSummaryResponse = {
  manager_id: string;
  owner: string;
  balances?: Array<{ quote_asset: string; balance: number | string }>;
};

export type PositionPayoutLookupResult =
  | { status: "indexed"; quantity: number }
  | { status: "not_indexed" };

async function predictFetch<T>(path: string): Promise<T> {
  const response = await fetch(`${ENV.predictApiUrl}${path}`);
  if (!response.ok) {
    throw new Error(`Predict API failed (${response.status})`);
  }
  return (await response.json()) as T;
}

function toNumber(value: unknown): number {
  if (typeof value === "number") return value;
  if (typeof value === "string") return Number(value);
  return 0;
}

/**
 * Pulls binary + range markets from the backend indexer.
 *
 * The backend polls predict-server, normalizes the (undocumented, unstable)
 * payload into `oracle_snapshots`, and serves a stable MarketCard[] shape
 * here. The app no longer touches predict-server directly for market discovery.
 */
export async function fetchMarketCards(): Promise<MarketCard[]> {
  const params = new URLSearchParams({ bucket: "month", limit: "100" });
  const response = await fetch(`${ENV.backendUrl}/api/markets/active?${params}`);
  if (!response.ok) {
    throw new Error(`Backend /api/markets/active failed (${response.status})`);
  }
  const json = (await response.json()) as { markets?: MarketCard[] };
  return Array.isArray(json.markets) ? json.markets : [];
}

export async function fetchOracleState(oracleId: string): Promise<OracleState> {
  const response = await fetch(`${ENV.backendUrl}/api/oracles/${oracleId}/state`);
  if (response.status === 404) {
    return {
      oracleId,
      asset: "",
      status: "INACTIVE",
      expiryTimestamp: 0,
    };
  }
  if (!response.ok) {
    throw new Error(`Backend /api/oracles/.../state failed (${response.status})`);
  }
  const body = (await response.json()) as {
    oracleId: string;
    asset: string;
    status: OracleState["status"];
    settlementPrice: number | null;
    expiryTimestamp: number;
    spot: number | null;
  };
  return {
    oracleId: body.oracleId,
    asset: body.asset,
    status: body.status,
    settlementPrice: body.settlementPrice ?? undefined,
    expiryTimestamp: body.expiryTimestamp,
    spot: body.spot ?? undefined,
  };
}

/**
 * Indexer-first manager lookup with predict-server fallback. The indexer
 * subscribes to predict_manager::PredictManagerCreated and stores managers
 * by owner; the fallback only fires while the indexer is warming up after
 * a fresh backfill.
 */
export async function findManagerByOwner(owner: string): Promise<ManagerSummary | null> {
  try {
    const res = await fetch(`${ENV.backendUrl}/api/managers/by-owner/${owner}`);
    if (res.ok) {
      const body = (await res.json()) as { managerId: string; owner: string };
      return { managerId: body.managerId, owner: body.owner };
    }
    if (res.status === 404) return null;
  } catch {
    // fall through to predict-server fallback for transient backend failures
  }

  const managers = await predictFetch<Array<Record<string, unknown>>>("/managers");
  const lower = owner.toLowerCase();
  for (const item of managers) {
    const candidateOwner = String(item.owner ?? item.user ?? "").toLowerCase();
    if (candidateOwner === lower) {
      return {
        managerId: String(item.manager_id ?? item.managerId ?? item.id ?? ""),
        owner: String(item.owner ?? ""),
      };
    }
  }
  return null;
}

export async function fetchManagerDusdcBalance(owner: string): Promise<number> {
  const manager = await findManagerByOwner(owner);
  if (!manager?.managerId) return 0;
  const summary = await predictFetch<ManagerSummaryResponse>(
    `/managers/${manager.managerId}/summary`,
  );
  const balances = summary.balances ?? [];
  const dusdc = balances.find(
    (b) => String(b.quote_asset).toLowerCase() === ENV.dusdcType.toLowerCase(),
  );
  return toNumber(dusdc?.balance ?? 0);
}

/**
 * Indexer-only payout lookup. Returns null while the position hasn't yet
 * been ingested (typical lag 2-3s); callers retry on that. Predict-server
 * is no longer queried for this — the indexer is canonical.
 */
export async function fetchPositionPayout(
  managerId: string,
  oracleId: string,
  expiry: number,
  strike: number,
  isUp: boolean,
): Promise<number | null> {
  try {
    const result = await lookupPositionPayout(managerId, oracleId, expiry, strike, isUp);
    return result.status === "indexed" ? result.quantity : null;
  } catch {
    return null;
  }
}

export async function lookupPositionPayout(
  managerId: string,
  oracleId: string,
  expiry: number,
  strike: number,
  isUp: boolean,
): Promise<PositionPayoutLookupResult> {
  const params = new URLSearchParams({
    managerId,
    oracleId,
    expiry: String(expiry),
    strike: String(strike),
    isUp: String(isUp),
  });
  const res = await fetch(`${ENV.backendUrl}/api/positions/lookup?${params}`);
  if (res.status === 404) {
    return { status: "not_indexed" };
  }
  if (!res.ok) {
    throw new Error(`Position lookup failed (${res.status})`);
  }
  const json = (await res.json()) as { quantity?: number };
  if (json.quantity && json.quantity > 0) {
    return { status: "indexed", quantity: json.quantity };
  }
  return { status: "not_indexed" };
}
