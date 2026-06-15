import { Transaction } from "@mysten/sui/transactions";
import { toBase64 } from "@mysten/sui/utils";

import type { AuthSession } from "@/types/user";
import { executeSponsored } from "@/services/blockchain/sponsoredExec";
import { getSuiClientForBuild } from "@/services/blockchain/suiClient";
import {
  buildDepositTx,
  buildOpenVaultTx,
  buildWithdrawTx,
  DEPOSIT_TARGETS,
  OPEN_VAULT_TARGETS,
  VAULT_TYPE,
  WITHDRAW_TARGETS,
} from "@/services/blockchain/vaultTx";
import { CLOCK_OBJECT_ID, ENV } from "@/utils/constants";

const PKG = ENV.briskPackageId;
const USDC = ENV.usdcType;

export type SaveState = {
  vaultId: string | null;
  /** Total redeemable value = principal + accrued yield. */
  valueMicros: number;
  /** Deposited principal (excludes accrued yield). */
  principalMicros: number;
  /** Accrued yield = value − principal. */
  earnedMicros: number;
  /** Pool APY in basis points (10% = 1000). */
  apyBps: number;
};

const EMPTY_SAVE = (vaultId: string | null): SaveState => ({
  vaultId,
  valueMicros: 0,
  principalMicros: 0,
  earnedMicros: 0,
  apyBps: ENV.briskApyBps,
});

function leBytesToNumber(bytes: number[]): number {
  let value = 0;
  for (let i = 0; i < bytes.length; i++) value += bytes[i] * 256 ** i;
  return value;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function readU64(res: any, index: number): number {
  const rv = res?.results?.[index]?.returnValues?.[0];
  return Array.isArray(rv?.[0]) ? leBytesToNumber(rv[0]) : 0;
}

/** Find the user's Save vault and its value broken into principal + earned yield. */
export async function getSaveState(owner: string): Promise<SaveState> {
  const client = await getSuiClientForBuild();
  const owned = await client.getOwnedObjects({
    owner,
    filter: { StructType: VAULT_TYPE },
    options: { showType: true },
  });
  const vaultId: string | null = owned?.data?.[0]?.data?.objectId ?? null;
  if (!vaultId || !ENV.briskPoolId) return EMPTY_SAVE(vaultId);

  // One devInspect, two views: total value (principal + live accrual) and principal.
  const tx = new Transaction();
  for (const fn of ["current_value", "principal"]) {
    tx.moveCall({
      target: `${PKG}::spending_vault::${fn}`,
      typeArguments: [USDC],
      arguments:
        fn === "current_value"
          ? [tx.object(vaultId), tx.object(ENV.briskPoolId), tx.object(CLOCK_OBJECT_ID)]
          : [tx.object(vaultId)],
    });
  }
  const res = await client.devInspectTransactionBlock({ sender: owner, transactionBlock: tx });
  const valueMicros = readU64(res, 0);
  const principalMicros = readU64(res, 1);
  return {
    vaultId,
    valueMicros,
    principalMicros,
    earnedMicros: Math.max(0, valueMicros - principalMicros),
    apyBps: ENV.briskApyBps,
  };
}

export type SaveHistoryItem = {
  kind: "deposit" | "withdraw" | "activate";
  amountMicros: number;
  timestampMs: number;
  digest: string;
};

/**
 * The user's own Save activity: their transactions that call spending_vault
 * (deposit / withdraw / open). Save moves aren't in the main feed (the
 * counterparty is the pool object, not an address), so we read them here. Amount
 * is the magnitude of the user's own USDC balance change in that tx.
 */
export async function getSaveHistory(owner: string, limit = 20): Promise<SaveHistoryItem[]> {
  const client = await getSuiClientForBuild();
  const res = await client.queryTransactionBlocks({
    filter: { FromAddress: owner },
    options: { showBalanceChanges: true, showInput: true },
    limit: 30,
    order: "descending",
  });
  const items: SaveHistoryItem[] = [];
  for (const tx of res?.data ?? []) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const cmds: any[] = (tx as any)?.transaction?.data?.transaction?.transactions ?? [];
    let kind: SaveHistoryItem["kind"] | null = null;
    for (const c of cmds) {
      const mc = c?.MoveCall;
      if (mc?.module !== "spending_vault") continue;
      if (mc.function === "deposit") kind = "deposit";
      else if (mc.function === "withdraw") kind = "withdraw";
      else if (mc.function === "open" && !kind) kind = "activate";
    }
    if (!kind) continue;
    let amountMicros = 0;
    for (const bc of tx?.balanceChanges ?? []) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const ownerAddr = (bc as any)?.owner?.AddressOwner;
      if (bc?.coinType === USDC && ownerAddr === owner) {
        amountMicros = Math.abs(Number(bc.amount));
      }
    }
    items.push({ kind, amountMicros, timestampMs: Number(tx.timestampMs ?? 0), digest: tx.digest });
  }
  return items.slice(0, limit);
}

async function sponsor(session: AuthSession, tx: Transaction, targets: string[]) {
  const client = await getSuiClientForBuild();
  const txKindBytes = toBase64(await tx.build({ client, onlyTransactionKind: true }));
  return executeSponsored({ session, txKindBytes, allowedMoveCallTargets: targets });
}

/** Activate Save (open an empty vault). Returns the new vault id. */
export async function openVault(session: AuthSession): Promise<void> {
  await sponsor(session, buildOpenVaultTx(session.address), OPEN_VAULT_TARGETS);
}

export async function depositToSave(
  session: AuthSession,
  vaultId: string,
  amountMicros: number,
): Promise<void> {
  await sponsor(
    session,
    buildDepositTx({ sender: session.address, vaultId, amountMicros }),
    DEPOSIT_TARGETS,
  );
}

export async function withdrawFromSave(
  session: AuthSession,
  vaultId: string,
  amountMicros: number,
): Promise<void> {
  await sponsor(
    session,
    buildWithdrawTx({ sender: session.address, vaultId, amountMicros }),
    WITHDRAW_TARGETS,
  );
}
