import { suiClient, getSuiClientForBuild } from "@/services/blockchain/suiClient";
import { CLOCK_OBJECT_ID, ENV, PLP_TYPE } from "@/utils/constants";

/**
 * Lightweight on-device view of DeepBook Predict's shared LP vault. Reads
 * the Predict shared object directly via Sui RPC and derives share price
 * from `vault_value / total_plp_supply`.
 *
 * `vault_value` is computed on-chain as `balance - total_mtm` (collected
 * quote minus mark-to-market liability owed to open positions). We mirror
 * that math here so the app doesn't need a backend round-trip for the
 * deposit/withdraw preview.
 */
export interface PredictVaultState {
  vaultValueMicro: number;
  totalMtmMicro: number;
  totalMaxPayoutMicro: number;
  rawBalanceMicro: number;
  totalPlpSupplyMicro: number;
  sharePriceMicro: number;
  tradingPaused: boolean;
  maxTotalExposurePct: number;
}

const SHARE_PRICE_SCALE = 1_000_000;

function parseU64(value: unknown): number {
  if (value === null || value === undefined) return 0;
  if (typeof value === "string") {
    return /^\d+$/.test(value) ? Number(value) : 0;
  }
  if (typeof value === "number") return Number.isFinite(value) ? value : 0;
  if (typeof value === "bigint") return Number(value);
  if (typeof value === "object") {
    const inner = value as Record<string, unknown>;
    if ("value" in inner) return parseU64(inner.value);
    if ("fields" in inner) return parseU64(inner.fields);
  }
  return 0;
}

function readNestedFields(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object") return null;
  const obj = value as Record<string, unknown>;
  if ("fields" in obj && obj.fields && typeof obj.fields === "object") {
    return obj.fields as Record<string, unknown>;
  }
  return obj;
}

// Demo-mode mock so the Earn tab renders meaningfully when the Predict
// object is unreachable. Numbers are chosen to be believable for a live
// pitch (~$10M TVL, 1.024 share price, ~80% exposure headroom).
export function getMockPredictVaultState(): PredictVaultState {
  const totalPlpSupplyMicro = 9_765_625_000_000; // 9,765,625 PLP
  const vaultValueMicro = 10_000_000_000_000; // 10M dUSDC NAV
  const sharePriceMicro = Math.floor((vaultValueMicro * SHARE_PRICE_SCALE) / totalPlpSupplyMicro);
  return {
    vaultValueMicro,
    totalMtmMicro: 320_000_000_000,
    totalMaxPayoutMicro: 1_800_000_000_000,
    rawBalanceMicro: vaultValueMicro + 320_000_000_000,
    totalPlpSupplyMicro,
    sharePriceMicro,
    tradingPaused: false,
    maxTotalExposurePct: 80,
  };
}

export async function fetchPredictVaultState(): Promise<PredictVaultState> {
  const [obj, supply] = await Promise.all([
    suiClient.getObject({ id: ENV.predictObjectId, options: { showContent: true } }),
    suiClient.getTotalSupply({ coinType: PLP_TYPE }),
  ]);

  const content =
    obj.data?.content && typeof obj.data.content === "object" ? obj.data.content : null;
  const fields = content && "fields" in content ? readNestedFields(content) : null;
  if (!fields) throw new Error("Predict object content unavailable");

  const vaultFields = readNestedFields(fields.vault);
  if (!vaultFields) throw new Error("Predict.vault sub-object missing");

  const balanceMicro = parseU64(vaultFields.balance);
  const totalMtmMicro = parseU64(vaultFields.total_mtm);
  const totalMaxPayoutMicro = parseU64(vaultFields.total_max_payout);
  const vaultValueMicro = Math.max(balanceMicro - totalMtmMicro, 0);

  const totalPlpSupplyMicro = parseU64(supply.value);
  const sharePriceMicro =
    totalPlpSupplyMicro > 0
      ? Math.floor((vaultValueMicro * SHARE_PRICE_SCALE) / totalPlpSupplyMicro)
      : SHARE_PRICE_SCALE;

  return {
    vaultValueMicro,
    totalMtmMicro,
    totalMaxPayoutMicro,
    rawBalanceMicro: balanceMicro,
    totalPlpSupplyMicro,
    sharePriceMicro,
    tradingPaused: Boolean(fields.trading_paused),
    maxTotalExposurePct: parseU64(fields.max_total_exposure_pct),
  };
}

/**
 * Defensive read of Predict's on-chain withdrawal rate-limiter via devInspect.
 * Used by the Earn tab to display "Available now: X dUSDC" before a withdraw
 * — when the protocol is paying out winners aggressively this cap is the only
 * thing standing between the user and a noisy on-chain abort.
 *
 * Returns `null` if the read fails (RPC error, schema drift); UI falls back
 * to allowing the user-entered amount and letting the chain reject if the
 * limit truly bites.
 */
export async function fetchAvailableWithdrawalMicro(): Promise<number | null> {
  try {
    const { Transaction } = await import("@mysten/sui/transactions");
    const tx = new Transaction();
    tx.moveCall({
      target: `${ENV.predictPackageId}::predict::available_withdrawal`,
      arguments: [tx.object(ENV.predictObjectId), tx.object(CLOCK_OBJECT_ID)],
    });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const client = (await getSuiClientForBuild()) as any;
    const inspect = await client.devInspectTransactionBlock({
      transactionBlock: tx,
      sender: "0x0000000000000000000000000000000000000000000000000000000000000000",
    });
    const ret = inspect?.results?.[0]?.returnValues as Array<[number[], string]> | undefined;
    if (!ret || ret.length === 0) return null;
    const bytes = ret[0][0];
    let v = 0n;
    for (let i = 0; i < 8; i += 1) {
      v |= BigInt(bytes[i] ?? 0) << BigInt(i * 8);
    }
    // u64::MAX → vault is effectively unrate-limited; report a large but
    // finite cap so the UI clamps to "MAX of your position" rather than
    // overflowing JS numbers.
    if (v === 0xffffffffffffffffn) return Number.MAX_SAFE_INTEGER;
    return Number(v);
  } catch {
    return null;
  }
}
