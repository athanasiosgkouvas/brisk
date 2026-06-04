import { randomBytes } from "node:crypto";

import { pool } from "../db.js";

// Payment-link persistence. A merchant creates a link (short code → invoice);
// a customer resolves it to pay; the payer's app reports settlement so the
// merchant can see status. Backed by Postgres (see db.ts).

export type LinkStatus = "pending" | "paid" | "canceled";

export type PaymentLink = {
  code: string;
  merchantId: string;
  payee: string;
  amountMicros: number;
  invoiceId: string;
  merchantName: string;
  status: LinkStatus;
  reusable: boolean;
  digest: string | null;
  createdAt: string | null;
  expiresAt: string | null;
  expired: boolean;
};

export type CreateLinkInput = {
  merchantId: string;
  payee: string;
  amountMicros: number;
  invoiceId: string;
  merchantName: string;
  reusable?: boolean;
  expiresInSec?: number;
};

export type CancelResult = "canceled" | "not_found" | "forbidden" | "not_pending";

const DEFAULT_TTL_SEC = 24 * 60 * 60; // 24h
const CODE_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";

function generateCode(len = 8): string {
  // Rejection-free base62 from random bytes — uniform enough for an opaque id.
  const bytes = randomBytes(len);
  let out = "";
  for (let i = 0; i < len; i++) out += CODE_ALPHABET[bytes[i] % CODE_ALPHABET.length];
  return out;
}

function requirePool() {
  if (!pool) throw new Error("Payment links are unavailable (DATABASE_URL not configured)");
  return pool;
}

/** Insert a new link, returning its short code. Retries once on a code clash. */
export async function createLink(input: CreateLinkInput): Promise<string> {
  const db = requirePool();
  const ttl = input.expiresInSec ?? DEFAULT_TTL_SEC;
  for (let attempt = 0; attempt < 2; attempt++) {
    const code = generateCode();
    try {
      await db.query(
        `INSERT INTO payment_links
           (code, merchant_id, payee, amount_micros, invoice_id, merchant_name, reusable, expires_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, now() + ($8 || ' seconds')::interval)`,
        [
          code,
          input.merchantId,
          input.payee,
          input.amountMicros,
          input.invoiceId,
          input.merchantName,
          input.reusable ?? false,
          String(ttl),
        ],
      );
      return code;
    } catch (err: unknown) {
      // 23505 = unique_violation (code clash) — retry with a fresh code once.
      if ((err as { code?: string })?.code === "23505" && attempt === 0) continue;
      throw err;
    }
  }
  throw new Error("Failed to allocate a unique payment-link code");
}

const SELECT_COLS = `code, merchant_id, payee, amount_micros, invoice_id, merchant_name,
            status, reusable, digest, created_at, expires_at,
            (expires_at IS NOT NULL AND expires_at < now()) AS expired`;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function rowToLink(r: any): PaymentLink {
  return {
    code: r.code,
    merchantId: r.merchant_id,
    payee: r.payee,
    amountMicros: Number(r.amount_micros),
    invoiceId: r.invoice_id,
    merchantName: r.merchant_name,
    status: r.status,
    reusable: r.reusable,
    digest: r.digest,
    createdAt: r.created_at ? new Date(r.created_at).toISOString() : null,
    expiresAt: r.expires_at ? new Date(r.expires_at).toISOString() : null,
    expired: r.expired,
  };
}

/** Fetch a link by code, or null if it doesn't exist. */
export async function getLink(code: string): Promise<PaymentLink | null> {
  const db = requirePool();
  const { rows } = await db.query(`SELECT ${SELECT_COLS} FROM payment_links WHERE code = $1`, [
    code,
  ]);
  return rows[0] ? rowToLink(rows[0]) : null;
}

/** All links a merchant created (newest first), for the management screen. */
export async function listLinks(payee: string, limit = 50): Promise<PaymentLink[]> {
  const db = requirePool();
  const { rows } = await db.query(
    `SELECT ${SELECT_COLS} FROM payment_links WHERE payee = $1 ORDER BY created_at DESC LIMIT $2`,
    [payee, limit],
  );
  return rows.map(rowToLink);
}

/** Mark a link paid (idempotent — only flips a still-pending row). */
export async function markPaid(code: string, digest: string): Promise<boolean> {
  const db = requirePool();
  const { rowCount } = await db.query(
    `UPDATE payment_links
        SET status = 'paid', digest = $2, paid_at = now()
      WHERE code = $1 AND status = 'pending'`,
    [code, digest],
  );
  return (rowCount ?? 0) > 0;
}

/**
 * Cancel (void) a link so it can no longer be paid. Gated to the creator
 * (`requester` must equal the stored payee) and only valid while still pending.
 */
export async function cancelLink(code: string, requester: string): Promise<CancelResult> {
  const db = requirePool();
  const link = await getLink(code);
  if (!link) return "not_found";
  if (link.payee !== requester) return "forbidden";
  if (link.status !== "pending") return "not_pending";
  await db.query(
    `UPDATE payment_links SET status = 'canceled', canceled_at = now() WHERE code = $1`,
    [code],
  );
  return "canceled";
}
