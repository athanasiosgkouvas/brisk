import { bcs } from "@mysten/sui/bcs";
import { Transaction } from "@mysten/sui/transactions";
import { toBase64 } from "@mysten/sui/utils";

import type { AuthSession } from "@/types/user";
import { executeSponsored } from "@/services/blockchain/sponsoredExec";
import { getSuiClientForBuild } from "@/services/blockchain/suiClient";
import { fetchAddressTransactions } from "@/services/blockchain/txHistory";
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

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function readU64(res: any, index: number): number {
  // Unified simulate returns each command's return values as raw BCS bytes.
  // `commandResults` sits at the top level of the result (sibling of Transaction),
  // not inside the unwrapped transaction — read it straight off `res`.
  const out = res?.commandResults?.[index]?.returnValues?.[0]?.bcs;
  return out ? Number(bcs.U64.parse(out)) : 0;
}

/** Find the user's Save vault and its value broken into principal + earned yield. */
export async function getSaveState(owner: string): Promise<SaveState> {
  const client = await getSuiClientForBuild();
  const owned = await client.listOwnedObjects({ owner, type: VAULT_TYPE });
  const vaultId: string | null = owned?.objects?.[0]?.objectId ?? null;
  if (!vaultId || !ENV.briskPoolId) return EMPTY_SAVE(vaultId);

  // One simulate, two views: total value (principal + live accrual) and principal.
  const tx = new Transaction();
  tx.setSender(owner);
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
  // `checksEnabled: false` inspects non-entry public views (the old devInspect use).
  const res = await client.simulateTransaction({
    transaction: tx,
    include: { commandResults: true },
    checksEnabled: false,
  });
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
  const txs = await fetchAddressTransactions(owner, { direction: "sent", last: 30 });
  const items: SaveHistoryItem[] = [];
  for (const tx of txs) {
    let kind: SaveHistoryItem["kind"] | null = null;
    for (const mc of tx.moveCalls) {
      if (mc.module !== "spending_vault") continue;
      if (mc.function === "deposit") kind = "deposit";
      else if (mc.function === "withdraw") kind = "withdraw";
      else if (mc.function === "open" && !kind) kind = "activate";
    }
    if (!kind) continue;
    let amountMicros = 0;
    for (const bc of tx.balanceChanges) {
      if (bc.coinType === USDC && bc.address === owner) {
        amountMicros = Math.abs(Number(bc.amount));
      }
    }
    items.push({ kind, amountMicros, timestampMs: tx.timestampMs, digest: tx.digest });
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
