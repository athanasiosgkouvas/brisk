import { toBase64, toHex, fromHex } from "@mysten/sui/utils";
import { blake2b } from "@noble/hashes/blake2.js";
import * as Crypto from "expo-crypto";

import type { AuthSession } from "@/types/user";
import { getSuiClientForBuild } from "@/services/blockchain/suiClient";
import { executeSponsored } from "@/services/blockchain/sponsoredExec";
import {
  buildMintGiftCardTx,
  buildClaimGiftCardTx,
  buildRedeemGiftCardTx,
  buildRegiftGiftCardTx,
  MINT_GIFT_CARD_TARGETS,
  CLAIM_GIFT_CARD_TARGETS,
  REDEEM_GIFT_CARD_TARGETS,
  REGIFT_GIFT_CARD_TARGETS,
} from "@/services/blockchain/paymentTx";
import * as backendApi from "@/services/api/backendApi";
import { ENV } from "@/utils/constants";

// On-chain gift cards (Move `gift_card`), merchant-prepaid promise model: the
// merchant is paid (minus the protocol fee) at issuance, and the card is a
// redeemable promise that holds no escrow. The claim secret travels only in the
// share link. All txs are sponsored (Enoki pays gas; the user signs), so
// buyers/recipients never need SUI.

// Match the card object by module::struct, NOT the call-package id: the `GiftCard`
// type origin is fixed at the package version where it was introduced, so it
// stays stable across later upgrades that change only function bodies.
const GIFT_CARD_TYPE_SUFFIX = "::gift_card::GiftCard";

/** 32-byte claim secret; its blake2b256 is what the card stores on-chain. */
function newSecret(): Uint8Array {
  return Crypto.getRandomBytes(32);
}
function hashSecret(secret: Uint8Array): Uint8Array {
  // Must equal Move `sui::hash::blake2b256` (BLAKE2b, 32-byte output).
  return blake2b(secret, { dkLen: 32 });
}

/** Resolve the created GiftCard object id from a mint tx's effects. */
async function giftCardIdFromTx(digest: string): Promise<string | null> {
  const client = await getSuiClientForBuild();
  const r = await client.getTransaction({ digest, include: { effects: true, objectTypes: true } });
  const txn = r.Transaction ?? r.FailedTransaction;
  const types: Record<string, string> = txn?.objectTypes ?? {};
  for (const c of txn?.effects?.changedObjects ?? []) {
    if (c.idOperation === "Created" && types[c.objectId]?.includes(GIFT_CARD_TYPE_SUFFIX)) {
      return c.objectId;
    }
  }
  return null;
}

/**
 * Buy a gift card: a sponsored mint that pays the merchant their net (face minus
 * the protocol fee) immediately and skims the fee to the treasury — the card
 * itself holds no escrow, just the redeemable promise. Returns a shareable claim
 * link with the secret in the URL fragment (never sent to the backend).
 */
export async function purchaseGiftCard(
  session: AuthSession,
  input: { merchantId: string; faceValueMicros: number },
): Promise<{
  url: string;
  faceValueMicros: number;
  objectId: string;
  claimCode: string;
  secretHex: string;
}> {
  const secret = newSecret();
  const claimHash = hashSecret(secret);
  const client = await getSuiClientForBuild();
  const tx = buildMintGiftCardTx({
    sender: session.address,
    merchantId: input.merchantId,
    faceMicros: input.faceValueMicros,
    claimHash,
  });
  const txKindBytes = toBase64(await tx.build({ client, onlyTransactionKind: true }));
  const { digest } = await executeSponsored({
    session,
    txKindBytes,
    allowedMoveCallTargets: MINT_GIFT_CARD_TARGETS,
  });
  const objectId = await giftCardIdFromTx(digest);
  if (!objectId) throw new Error("Gift card minted but its id couldn't be resolved; try again.");
  const { url, claimCode } = await backendApi.recordGiftCard({
    sender: session.address,
    objectId,
    merchantId: input.merchantId,
    faceValueMicros: input.faceValueMicros,
  });
  const secretHex = toHex(secret);
  return {
    url: `${url}#s=${secretHex}`,
    faceValueMicros: input.faceValueMicros,
    objectId,
    claimCode,
    secretHex,
  };
}

/**
 * Re-gift a card you hold: reset it on-chain with a fresh secret (sponsored) so
 * it can be claimed by someone new. Reuses the card's existing share code (the
 * landing only maps code → object), so the returned link is the same `/g/<code>`
 * URL with the NEW secret in the fragment. The old secret is invalidated.
 */
export async function regiftGiftCard(
  session: AuthSession,
  input: { cardId: string; claimCode: string },
): Promise<{ url: string; secretHex: string }> {
  const secret = newSecret();
  const claimHash = hashSecret(secret);
  const client = await getSuiClientForBuild();
  const tx = buildRegiftGiftCardTx({
    sender: session.address,
    cardId: input.cardId,
    claimHash,
  });
  const txKindBytes = toBase64(await tx.build({ client, onlyTransactionKind: true }));
  await executeSponsored({
    session,
    txKindBytes,
    allowedMoveCallTargets: REGIFT_GIFT_CARD_TARGETS,
  });
  const secretHex = toHex(secret);
  return { url: `${ENV.backendUrl}/g/${input.claimCode}#s=${secretHex}`, secretHex };
}

/** Claim a card to the caller's address (sponsored), then record the recipient. */
export async function claimGiftCard(
  session: AuthSession,
  input: { cardId: string; code?: string; secretHex: string },
): Promise<void> {
  const client = await getSuiClientForBuild();
  const tx = buildClaimGiftCardTx({
    sender: session.address,
    cardId: input.cardId,
    secret: fromHex(input.secretHex),
  });
  const txKindBytes = toBase64(await tx.build({ client, onlyTransactionKind: true }));
  await executeSponsored({
    session,
    txKindBytes,
    allowedMoveCallTargets: CLAIM_GIFT_CARD_TARGETS,
  });
  if (input.code)
    await backendApi.recordGiftCardClaim(input.code, session.address).catch(() => undefined);
}

/** Draw down `amount` of a claimed card's promise (sponsored; no funds move —
 *  the merchant was prepaid at issuance). Returns the tx digest. */
export async function redeemGiftCard(
  session: AuthSession,
  input: { cardId: string; merchantId: string; amountMicros: number },
): Promise<string> {
  const client = await getSuiClientForBuild();
  const tx = buildRedeemGiftCardTx({
    sender: session.address,
    cardId: input.cardId,
    merchantId: input.merchantId,
    amountMicros: input.amountMicros,
  });
  const txKindBytes = toBase64(await tx.build({ client, onlyTransactionKind: true }));
  const { digest } = await executeSponsored({
    session,
    txKindBytes,
    allowedMoveCallTargets: REDEEM_GIFT_CARD_TARGETS,
  });
  return digest;
}

/** Read a card's remaining redeemable value, merchant id, and current recipient
 *  on-chain. In the prepaid model the on-chain `balance` is always empty; the
 *  live remaining is tracked in `face_value` (drawn down by each redeem). The
 *  recipient is null when the card is unclaimed (mint-fresh or just re-gifted). */
export async function readGiftCard(
  cardId: string,
): Promise<{ balanceMicros: number; merchantId: string; recipient: string | null } | null> {
  const client = await getSuiClientForBuild();
  const { object } = await client.getObject({ objectId: cardId, include: { json: true } });
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const fields = object?.json as any;
  if (!fields) return null;
  const balanceMicros = Number(fields.face_value ?? 0);
  return {
    balanceMicros,
    merchantId: String(fields.merchant),
    recipient: parseOption(fields.recipient),
  };
}

/** Parse a Move `Option<address>` from getObject content into address | null.
 *  Sui may surface it as a bare string, null, or an `{ fields: { vec: [...] } }`
 *  wrapper depending on shape — handle all. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function parseOption(v: any): string | null {
  if (!v) return null;
  if (typeof v === "string") return v;
  const vec = v?.fields?.vec ?? v?.vec;
  if (Array.isArray(vec)) return vec.length ? String(vec[0]) : null;
  return null;
}
