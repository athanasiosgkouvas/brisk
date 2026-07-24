import { randomBytes } from "node:crypto";

import { pool } from "../db.js";

/**
 * Fiat ramp sessions (Coinbase onramp/offramp) — a provider-agnostic index of
 * every hosted ramp we start. See db.ts `ramp_sessions`.
 *
 * `ref` is the ≤50-char correlation id we generate and hand the provider as
 * `partnerUserRef` (the raw Sui address is 66 chars). The completion webhook
 * echoes it back, letting us map an event → the address/amount it belongs to.
 *
 * Best-effort persistence: without DATABASE_URL the ramp still works (a ref is
 * generated so the hosted URL is valid), we just can't correlate the webhook —
 * matching the faucet/sponsor "boots without a DB" posture.
 */

export type RampKind = "onramp" | "offramp";
export type RampStatus = "created" | "pending" | "success" | "failed";

export type RampSession = {
  ref: string;
  kind: RampKind;
  provider: string;
  address: string;
  amountMicros: number | null;
  status: RampStatus;
  txHash: string | null;
  createdAt: string | null;
  updatedAt: string | null;
};

const COLS = `ref, kind, provider, address, amount_micros, status, tx_hash, created_at, updated_at`;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function rowToSession(r: any): RampSession {
  return {
    ref: r.ref,
    kind: r.kind,
    provider: r.provider,
    address: r.address,
    amountMicros: r.amount_micros == null ? null : Number(r.amount_micros),
    status: r.status,
    txHash: r.tx_hash ?? null,
    createdAt: r.created_at ? new Date(r.created_at).toISOString() : null,
    updatedAt: r.updated_at ? new Date(r.updated_at).toISOString() : null,
  };
}

/** 32-char hex ref — unique, opaque, and well under the 50-char provider cap. */
function generateRef(): string {
  return randomBytes(16).toString("hex");
}

/**
 * Create a ramp session and return its `ref`. Persists when a DB is configured;
 * otherwise returns a fresh ref so the hosted URL is still valid (webhook
 * correlation is simply unavailable in that mode).
 */
export async function createRampSession(input: {
  kind: RampKind;
  address: string;
  amountMicros?: number | null;
  provider?: string;
}): Promise<string> {
  const ref = generateRef();
  if (!pool) return ref;
  await pool.query(
    `INSERT INTO ramp_sessions (ref, kind, provider, address, amount_micros)
       VALUES ($1, $2, $3, $4, $5)`,
    [ref, input.kind, input.provider ?? "coinbase", input.address, input.amountMicros ?? null],
  );
  return ref;
}

export async function getRampSession(ref: string): Promise<RampSession | null> {
  if (!pool) return null;
  const { rows } = await pool.query(`SELECT ${COLS} FROM ramp_sessions WHERE ref = $1`, [ref]);
  return rows[0] ? rowToSession(rows[0]) : null;
}

/**
 * Advance a session's status (idempotent-friendly) from a completion webhook.
 * No-op when the ref is unknown (e.g. started before a DB was configured).
 */
export async function updateRampStatus(
  ref: string,
  status: RampStatus,
  txHash?: string | null,
): Promise<boolean> {
  if (!pool) return false;
  const { rowCount } = await pool.query(
    `UPDATE ramp_sessions
        SET status = $2, tx_hash = COALESCE($3, tx_hash), updated_at = now()
      WHERE ref = $1`,
    [ref, status, txHash ?? null],
  );
  return (rowCount ?? 0) > 0;
}
