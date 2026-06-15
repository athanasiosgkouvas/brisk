import { pool } from "../db.js";
import { generateCode } from "./codes.js";

// Gift cards are on-chain escrowed objects (the Move `gift_card` module owns the
// balance, fee, claim + redemption). This table is a thin METADATA INDEX so the
// app can list a customer's / merchant's cards and serve the /g/:code share
// landing. Live balances are read on-chain; the claim secret never touches here.

export type GiftCardRow = {
  objectId: string;
  claimCode: string;
  merchantId: string;
  buyerAddr: string;
  recipientAddr: string | null;
  faceValueMicros: number;
  status: string;
  createdAt: string | null;
};

function requirePool() {
  if (!pool) throw new Error("Gift cards are unavailable (DATABASE_URL not configured)");
  return pool;
}

const SELECT_COLS = `object_id, claim_code, merchant_id, buyer_addr, recipient_addr,
  face_value_micros, status, created_at`;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function rowToCard(r: any): GiftCardRow {
  return {
    objectId: r.object_id,
    claimCode: r.claim_code,
    merchantId: r.merchant_id,
    buyerAddr: r.buyer_addr,
    recipientAddr: r.recipient_addr ?? null,
    faceValueMicros: Number(r.face_value_micros),
    status: r.status,
    createdAt: r.created_at ? new Date(r.created_at).toISOString() : null,
  };
}

/** Index a freshly-minted on-chain gift card. Allocates a short claim code. The
 *  legacy balance/fee columns (NOT NULL on the deployed table) are written as 0
 *  — the real values live on-chain. */
export async function recordCard(input: {
  objectId: string;
  merchantId: string;
  buyerAddr: string;
  faceValueMicros: number;
}): Promise<{ claimCode: string }> {
  const db = requirePool();
  for (let attempt = 0; attempt < 2; attempt++) {
    const code = generateCode();
    try {
      await db.query(
        `INSERT INTO gift_cards
           (object_id, claim_code, merchant_id, buyer_addr, face_value_micros, balance_micros, fee_micros, merchant_net_micros, status, funded_at)
         VALUES ($1, $2, $3, $4, $5, 0, 0, 0, 'active', now())`,
        [input.objectId, code, input.merchantId, input.buyerAddr, input.faceValueMicros],
      );
      return { claimCode: code };
    } catch (err: unknown) {
      if ((err as { code?: string })?.code === "23505" && attempt === 0) continue;
      throw err;
    }
  }
  throw new Error("Failed to allocate a unique gift-card code");
}

export async function getByCode(code: string): Promise<GiftCardRow | null> {
  const db = requirePool();
  const { rows } = await db.query(`SELECT ${SELECT_COLS} FROM gift_cards WHERE claim_code = $1`, [
    code,
  ]);
  return rows[0] ? rowToCard(rows[0]) : null;
}

/** Record the recipient after an on-chain claim. First-writer-wins; idempotent
 *  if the same recipient re-reports. Returns false only if the code is unknown. */
export async function setRecipient(code: string, recipient: string): Promise<boolean> {
  const db = requirePool();
  const existing = await getByCode(code);
  if (!existing) return false;
  await db.query(
    `UPDATE gift_cards SET recipient_addr = $2, claimed_at = now()
       WHERE claim_code = $1 AND (recipient_addr IS NULL OR recipient_addr = $2)`,
    [code, recipient],
  );
  return true;
}

export async function listForCustomer(customer: string): Promise<GiftCardRow[]> {
  const db = requirePool();
  const { rows } = await db.query(
    `SELECT ${SELECT_COLS} FROM gift_cards WHERE recipient_addr = $1 ORDER BY created_at DESC`,
    [customer],
  );
  return rows.map(rowToCard);
}

export async function listForMerchant(merchantId: string): Promise<GiftCardRow[]> {
  const db = requirePool();
  const { rows } = await db.query(
    `SELECT ${SELECT_COLS} FROM gift_cards WHERE merchant_id = $1 ORDER BY created_at DESC LIMIT 200`,
    [merchantId],
  );
  return rows.map(rowToCard);
}
