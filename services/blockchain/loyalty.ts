import { Transaction } from "@mysten/sui/transactions";
import { toBase64 } from "@mysten/sui/utils";

import type { AuthSession } from "@/types/user";
import { executeSponsored } from "@/services/blockchain/sponsoredExec";
import { getSuiClientForBuild } from "@/services/blockchain/suiClient";
import { ENV } from "@/utils/constants";

/**
 * Closed-loop cashback (`loyalty` module). Every payment mints a soulbound
 * `Points` object to the payer (1% of the amount, in USDC micro-units). This
 * surfaces the user's total and lets them redeem (burn) it — the earn → view →
 * redeem lifecycle.
 */

const PKG = ENV.briskPackageId;
const POINTS_TYPE = `${PKG}::loyalty::Points`;

export type Cashback = {
  /** Total cashback in USDC micro-units (sum of all Points objects). */
  totalMicros: number;
  /** Object ids of the Points, for redemption. */
  ids: string[];
};

/** Read the caller's cashback: sum every owned `Points` object. */
export async function getCashback(owner: string): Promise<Cashback> {
  const client = await getSuiClientForBuild();
  let cursor: string | null = null;
  let totalMicros = 0;
  const ids: string[] = [];
  // Paginate in case of many small rewards.
  do {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const res: any = await client.getOwnedObjects({
      owner,
      filter: { StructType: POINTS_TYPE },
      options: { showContent: true },
      cursor,
    });
    for (const o of res?.data ?? []) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const fields = (o?.data?.content as any)?.fields;
      const amount = Number(fields?.amount ?? 0);
      const id = o?.data?.objectId;
      if (id && amount > 0) {
        totalMicros += amount;
        ids.push(id);
      }
    }
    cursor = res?.hasNextPage ? (res?.nextCursor ?? null) : null;
  } while (cursor);
  return { totalMicros, ids };
}

/** Redeem (burn) the given Points objects in one sponsored PTB. */
export async function redeemCashback(session: AuthSession, ids: string[]): Promise<void> {
  if (ids.length === 0) return;
  const client = await getSuiClientForBuild();
  const tx = new Transaction();
  tx.setSender(session.address);
  for (const id of ids) {
    tx.moveCall({ target: `${PKG}::loyalty::redeem`, arguments: [tx.object(id)] });
  }
  const txKindBytes = toBase64(await tx.build({ client, onlyTransactionKind: true }));
  await executeSponsored({
    session,
    txKindBytes,
    allowedMoveCallTargets: [`${PKG}::loyalty::redeem`],
  });
}
