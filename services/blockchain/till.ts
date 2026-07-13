import { toBase64 } from "@mysten/sui/utils";

import type { AuthSession } from "@/types/user";
import { getSuiClientForBuild, waitForTxIndexed } from "@/services/blockchain/suiClient";
import { getSpendableUsdcMicros } from "@/services/blockchain/wallet";
import { executeSponsored } from "@/services/blockchain/sponsoredExec";
import { ensureMerchant, findMerchantId } from "@/services/blockchain/merchant";
import {
  buildCreateTillTx,
  buildSweepTillTx,
  buildRenameTillTx,
  buildSetTillActiveTx,
  CREATE_TILL_TARGETS,
  SWEEP_TILL_TARGETS,
  RENAME_TILL_TARGETS,
  SET_TILL_ACTIVE_TARGETS,
} from "@/services/blockchain/paymentTx";
import * as backendApi from "@/services/api/backendApi";
import { ENV } from "@/utils/constants";

/**
 * Merchant receiving accounts ("tills"). A till is a shared on-chain object whose
 * address is what customers pay into — the merchant's private treasury is never
 * exposed. Funds collected sweep to the recorded treasury (daily cron + manual).
 *
 * Listing comes from the backend mirror (shared objects aren't queryable by
 * owner); each till's live balance is read on-chain from its address accumulator.
 */

const PKG = ENV.briskPackageId;
const TILL_PKG = ENV.briskTillPkg;
const CAP_TYPE = `${PKG}::merchant_registry::MerchantCap`;
const TILL_TYPE = `${TILL_PKG}::till::Till`;

export type Till = {
  tillId: string;
  name: string;
  treasury: string;
  active: boolean;
  balanceMicros: number;
};

/** The owner's `MerchantCap` object id + the `Merchant` id it controls, or null. */
async function findMerchantCap(
  owner: string,
): Promise<{ capId: string; merchantId: string } | null> {
  const client = await getSuiClientForBuild();
  const res = await client.listOwnedObjects({ owner, type: CAP_TYPE, include: { json: true } });
  for (const obj of res?.objects ?? []) {
    const capId = obj?.objectId;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const merchant = (obj?.json as any)?.merchant;
    if (typeof capId === "string" && typeof merchant === "string") {
      return { capId, merchantId: merchant };
    }
  }
  return null;
}

/** Ensure the session has a Merchant + cap, returning both ids (registers if needed). */
async function ensureMerchantCap(
  session: AuthSession,
  name: string,
): Promise<{ capId: string; merchantId: string }> {
  const existing = await findMerchantCap(session.address);
  if (existing) return existing;
  // Register (idempotent) then re-query for the freshly-minted cap.
  await ensureMerchant(session, name);
  const cap = await findMerchantCap(session.address);
  if (cap) return cap;
  throw new Error("Merchant registered but its cap could not be resolved; try again.");
}

/** Pull the created shared `Till` id out of a create_till tx's object changes. */
async function tillIdFromTx(digest: string): Promise<string | null> {
  const client = await getSuiClientForBuild();
  // Sponsored tx is executed on Enoki's node; poll until our (lagging) GraphQL
  // fullnode indexes the digest rather than racing it with a one-shot read.
  const r = await waitForTxIndexed(client, digest, { effects: true, objectTypes: true });
  const txn = r.Transaction ?? r.FailedTransaction;
  const types: Record<string, string> = txn?.objectTypes ?? {};
  for (const c of txn?.effects?.changedObjects ?? []) {
    if (c.idOperation === "Created" && types[c.objectId] === TILL_TYPE) return c.objectId;
  }
  return null;
}

/** Live USDC balance sitting in a till's address accumulator (micros). */
export async function getTillBalanceMicros(tillId: string): Promise<number> {
  return getSpendableUsdcMicros(tillId);
}

/**
 * Create a named receiving account. Ensures the merchant exists, runs the
 * cap-gated create_till sponsored, resolves the new Till id, and records it on
 * the backend (so it lists + the daily sweep cron picks it up). `treasury`
 * defaults to the merchant's own address (the private treasury).
 */
export async function createTill(
  session: AuthSession,
  name: string,
  treasury?: string,
): Promise<Till> {
  const { capId, merchantId } = await ensureMerchantCap(session, name);
  const treasuryAddr = treasury ?? session.address;

  const client = await getSuiClientForBuild();
  const tx = buildCreateTillTx({
    sender: session.address,
    capId,
    merchantId,
    name,
    treasury: treasuryAddr,
  });
  const txKindBytes = toBase64(await tx.build({ client, onlyTransactionKind: true }));
  const { digest } = await executeSponsored({
    session,
    txKindBytes,
    allowedMoveCallTargets: CREATE_TILL_TARGETS,
  });

  const tillId = await tillIdFromTx(digest);
  if (!tillId) throw new Error("Till created but its id could not be resolved; try again.");

  // Mirror it on the backend (best-effort — on-chain is source of truth).
  await backendApi
    .recordTill({
      sender: session.address,
      tillId,
      merchantId,
      ownerAddr: session.address,
      treasuryAddr,
      name,
    })
    .catch(() => undefined);

  return { tillId, name, treasury: treasuryAddr, active: true, balanceMicros: 0 };
}

/** List the merchant's ACTIVE tills (from the backend mirror), enriched with
 *  live balances. Removed (disabled) tills are filtered out. */
export async function listTills(owner: string): Promise<Till[]> {
  const summaries = await backendApi.listTills(owner);
  return Promise.all(
    summaries
      .filter((t) => t.active)
      .map(async (t) => ({
        tillId: t.tillId,
        name: t.name,
        treasury: t.treasuryAddr,
        active: t.active,
        balanceMicros: await getTillBalanceMicros(t.tillId).catch(() => 0),
      })),
  );
}

/** Sweep a till's funds to its treasury (the merchant-tapped "Move to treasury"). */
export async function sweepTill(session: AuthSession, tillId: string): Promise<void> {
  const client = await getSuiClientForBuild();
  const tx = buildSweepTillTx({ sender: session.address, tillId });
  const txKindBytes = toBase64(await tx.build({ client, onlyTransactionKind: true }));
  await executeSponsored({
    session,
    txKindBytes,
    allowedMoveCallTargets: SWEEP_TILL_TARGETS,
  });
}

/** Rename a till (cap-gated on-chain, then mirror on the backend). */
export async function renameTill(
  session: AuthSession,
  tillId: string,
  name: string,
): Promise<void> {
  const cap = await findMerchantCap(session.address);
  if (!cap) throw new Error("No merchant account found");
  const client = await getSuiClientForBuild();
  const tx = buildRenameTillTx({
    sender: session.address,
    capId: cap.capId,
    merchantId: cap.merchantId,
    tillId,
    name,
  });
  const txKindBytes = toBase64(await tx.build({ client, onlyTransactionKind: true }));
  await executeSponsored({ session, txKindBytes, allowedMoveCallTargets: RENAME_TILL_TARGETS });
  await backendApi.renameTill(tillId, session.address, name).catch(() => undefined);
}

/** Remove (disable) a till — cap-gated on-chain, then mirror on the backend.
 *  Sweep any remaining funds FIRST: a disabled till is skipped by the daily
 *  sweep cron, so removing one with a balance would strand it. */
export async function removeTill(session: AuthSession, tillId: string): Promise<void> {
  const cap = await findMerchantCap(session.address);
  if (!cap) throw new Error("No merchant account found");
  const client = await getSuiClientForBuild();
  const tx = buildSetTillActiveTx({
    sender: session.address,
    capId: cap.capId,
    merchantId: cap.merchantId,
    tillId,
    active: false,
  });
  const txKindBytes = toBase64(await tx.build({ client, onlyTransactionKind: true }));
  await executeSponsored({ session, txKindBytes, allowedMoveCallTargets: SET_TILL_ACTIVE_TARGETS });
  await backendApi.setTillActive(tillId, session.address, false).catch(() => undefined);
}

/** True iff this address already has a registered merchant (for Pro activation). */
export async function hasMerchant(owner: string): Promise<boolean> {
  return (await findMerchantId(owner)) !== null;
}
