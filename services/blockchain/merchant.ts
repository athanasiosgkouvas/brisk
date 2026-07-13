import { toBase64 } from "@mysten/sui/utils";

import type { AuthSession } from "@/types/user";
import { getSuiClientForBuild, waitForTxIndexed } from "@/services/blockchain/suiClient";
import { executeSponsored } from "@/services/blockchain/sponsoredExec";
import {
  buildRegisterMerchantTx,
  REGISTER_MERCHANT_TARGETS,
} from "@/services/blockchain/paymentTx";
import { ENV } from "@/utils/constants";

/**
 * Merchant identity wiring. A Brisk Terminal needs a shared `Merchant` object so
 * a customer's payment PTB can reference it (and the receipt can be bound to a
 * registered merchant). We look one up by the owner's `MerchantCap`, lazily
 * registering on first use.
 */

const PKG = ENV.briskPackageId;
const CAP_TYPE = `${PKG}::merchant_registry::MerchantCap`;
const MERCHANT_TYPE = `${PKG}::merchant_registry::Merchant`;

/** The shared `Merchant` id this owner controls (via their `MerchantCap`), or null. */
export async function findMerchantId(owner: string): Promise<string | null> {
  const client = await getSuiClientForBuild();
  const res = await client.listOwnedObjects({ owner, type: CAP_TYPE, include: { json: true } });
  for (const obj of res?.objects ?? []) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const merchant = (obj?.json as any)?.merchant;
    if (typeof merchant === "string") return merchant;
  }
  return null;
}

/** Pull the created shared `Merchant` id out of a register tx's object changes. */
async function merchantIdFromTx(digest: string): Promise<string | null> {
  const client = await getSuiClientForBuild();
  // Sponsored tx is executed on Enoki's node; poll until our (lagging) GraphQL
  // fullnode indexes the digest rather than racing it with a one-shot read.
  const r = await waitForTxIndexed(client, digest, { effects: true, objectTypes: true });
  const txn = r.Transaction ?? r.FailedTransaction;
  const types: Record<string, string> = txn?.objectTypes ?? {};
  for (const c of txn?.effects?.changedObjects ?? []) {
    if (c.idOperation === "Created" && types[c.objectId] === MERCHANT_TYPE) return c.objectId;
  }
  return null;
}

/**
 * Ensure `session` has a registered, shared `Merchant`, returning its id. Reuses
 * an existing one; otherwise registers it via a sponsored `register_and_share`
 * PTB and resolves the new id from the tx effects (falling back to a re-query to
 * tolerate indexer lag).
 */
export async function ensureMerchant(session: AuthSession, name: string): Promise<string> {
  const existing = await findMerchantId(session.address);
  if (existing) return existing;

  const client = await getSuiClientForBuild();
  const tx = buildRegisterMerchantTx({ sender: session.address, name });
  const txKindBytes = toBase64(await tx.build({ client, onlyTransactionKind: true }));
  const { digest } = await executeSponsored({
    session,
    txKindBytes,
    allowedMoveCallTargets: REGISTER_MERCHANT_TARGETS,
  });

  const fromTx = await merchantIdFromTx(digest);
  if (fromTx) return fromTx;

  // Indexer lag: the cap is owned now; re-query for the bound merchant id.
  const requeried = await findMerchantId(session.address);
  if (requeried) return requeried;
  throw new Error("Merchant registered but its id could not be resolved; try again.");
}
