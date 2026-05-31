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

export type SaveState = { vaultId: string | null; valueMicros: number };

function leBytesToNumber(bytes: number[]): number {
  let value = 0;
  for (let i = 0; i < bytes.length; i++) value += bytes[i] * 256 ** i;
  return value;
}

/** Find the user's Save vault and its current redeemable value (principal + yield). */
export async function getSaveState(owner: string): Promise<SaveState> {
  const client = await getSuiClientForBuild();
  const owned = await client.getOwnedObjects({
    owner,
    filter: { StructType: VAULT_TYPE },
    options: { showType: true },
  });
  const vaultId: string | null = owned?.data?.[0]?.data?.objectId ?? null;
  if (!vaultId || !ENV.briskPoolId) return { vaultId, valueMicros: 0 };

  const tx = new Transaction();
  tx.moveCall({
    target: `${PKG}::spending_vault::current_value`,
    typeArguments: [USDC],
    arguments: [tx.object(vaultId), tx.object(ENV.briskPoolId), tx.object(CLOCK_OBJECT_ID)],
  });
  const res = await client.devInspectTransactionBlock({ sender: owner, transactionBlock: tx });
  const rv = res?.results?.[0]?.returnValues?.[0];
  const valueMicros = Array.isArray(rv?.[0]) ? leBytesToNumber(rv[0]) : 0;
  return { vaultId, valueMicros };
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
