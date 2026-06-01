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
  const client = await getSuiClientForBuild();

  // Deposit must source from owned Coin objects (sponsorable). Funds sitting in
  // the Address Balance can't be sponsored (the gas station rejects
  // FundsWithdrawal), so guide the user instead of failing cryptically.
  const { balance } = await client.core.getBalance({ owner: session.address, coinType: USDC });
  if (Number(balance.coinBalance) < amountMicros) {
    throw new Error(
      "Not enough spendable coins for this deposit. Receive USDC or withdraw to your wallet first, then deposit.",
    );
  }

  // Pick coins largest-first until they cover the amount.
  const { objects } = await client.core.listCoins({ owner: session.address, coinType: USDC });
  const sorted = [...objects].sort((a, b) => Number(b.balance) - Number(a.balance));
  const coinObjectIds: string[] = [];
  let acc = 0n;
  for (const c of sorted) {
    coinObjectIds.push(c.objectId);
    acc += BigInt(c.balance);
    if (acc >= BigInt(amountMicros)) break;
  }

  await sponsor(
    session,
    buildDepositTx({ sender: session.address, vaultId, amountMicros, coinObjectIds }),
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
