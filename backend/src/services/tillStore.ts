import { pool } from "../db.js";

// Persistence for merchant receiving accounts ("tills"). A till is created
// on-chain by the merchant (cap-gated); the backend records the resulting object
// id so it can (a) list a merchant's tills and (b) run the daily sweep cron over
// every active till. The on-chain Till is the source of truth for funds + the
// sweep destination; this table is a queryable mirror. Backed by Postgres (db.ts).

export type Till = {
  tillId: string;
  merchantId: string;
  ownerAddr: string;
  treasuryAddr: string;
  name: string;
  active: boolean;
  createdAt: string | null;
  lastSweptAt: string | null;
};

export type CreateTillInput = {
  tillId: string;
  merchantId: string;
  ownerAddr: string;
  treasuryAddr: string;
  name: string;
};

function requirePool() {
  if (!pool) throw new Error("Tills are unavailable (DATABASE_URL not configured)");
  return pool;
}

const SELECT_COLS = `till_id, merchant_id, owner_addr, treasury_addr, name, active,
            created_at, last_swept_at`;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function rowToTill(r: any): Till {
  return {
    tillId: r.till_id,
    merchantId: r.merchant_id,
    ownerAddr: r.owner_addr,
    treasuryAddr: r.treasury_addr,
    name: r.name,
    active: r.active,
    createdAt: r.created_at ? new Date(r.created_at).toISOString() : null,
    lastSweptAt: r.last_swept_at ? new Date(r.last_swept_at).toISOString() : null,
  };
}

/** Record a till after its on-chain create_till tx. Idempotent on re-record. */
export async function createTill(input: CreateTillInput): Promise<void> {
  const db = requirePool();
  await db.query(
    `INSERT INTO tills (till_id, merchant_id, owner_addr, treasury_addr, name)
     VALUES ($1, $2, $3, $4, $5)
     ON CONFLICT (till_id) DO UPDATE
       SET name = EXCLUDED.name, treasury_addr = EXCLUDED.treasury_addr, active = true`,
    [input.tillId, input.merchantId, input.ownerAddr, input.treasuryAddr, input.name],
  );
}

export async function getTill(tillId: string): Promise<Till | null> {
  const db = requirePool();
  const { rows } = await db.query(`SELECT ${SELECT_COLS} FROM tills WHERE till_id = $1`, [tillId]);
  return rows[0] ? rowToTill(rows[0]) : null;
}

/** All tills a merchant owns (newest first), for the Pro management screen. */
export async function listTills(ownerAddr: string, limit = 50): Promise<Till[]> {
  const db = requirePool();
  const { rows } = await db.query(
    `SELECT ${SELECT_COLS} FROM tills WHERE owner_addr = $1 ORDER BY created_at DESC LIMIT $2`,
    [ownerAddr, limit],
  );
  return rows.map(rowToTill);
}

/** The merchant's first active till — the payout target for gift-card purchases
 *  (funds land here and sweep to treasury like any other sale). */
export async function firstActiveTillForMerchant(merchantId: string): Promise<Till | null> {
  const db = requirePool();
  const { rows } = await db.query(
    `SELECT ${SELECT_COLS} FROM tills WHERE merchant_id = $1 AND active = true
       ORDER BY created_at ASC LIMIT 1`,
    [merchantId],
  );
  return rows[0] ? rowToTill(rows[0]) : null;
}

/** Active tills across all merchants — the daily sweep cron's work list. */
export async function listActiveTills(): Promise<Till[]> {
  const db = requirePool();
  const { rows } = await db.query(
    `SELECT ${SELECT_COLS} FROM tills WHERE active = true ORDER BY created_at ASC`,
  );
  return rows.map(rowToTill);
}

/** Stamp a successful sweep (best-effort bookkeeping; on-chain is source of truth). */
export async function markSwept(tillId: string): Promise<void> {
  const db = requirePool();
  await db.query(`UPDATE tills SET last_swept_at = now() WHERE till_id = $1`, [tillId]);
}

/** Toggle active state. Gated to the owner at the endpoint layer. */
export async function setActive(tillId: string, active: boolean): Promise<boolean> {
  const db = requirePool();
  const { rowCount } = await db.query(`UPDATE tills SET active = $2 WHERE till_id = $1`, [
    tillId,
    active,
  ]);
  return (rowCount ?? 0) > 0;
}

/** Update the cached treasury address after an on-chain set_treasury. */
export async function setTreasury(tillId: string, treasuryAddr: string): Promise<boolean> {
  const db = requirePool();
  const { rowCount } = await db.query(`UPDATE tills SET treasury_addr = $2 WHERE till_id = $1`, [
    tillId,
    treasuryAddr,
  ]);
  return (rowCount ?? 0) > 0;
}

/** Update the cached display name after an on-chain rename. */
export async function setName(tillId: string, name: string): Promise<boolean> {
  const db = requirePool();
  const { rowCount } = await db.query(`UPDATE tills SET name = $2 WHERE till_id = $1`, [
    tillId,
    name,
  ]);
  return (rowCount ?? 0) > 0;
}
