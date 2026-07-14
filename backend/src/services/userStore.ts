import { pool } from "../db.js";

// User directory: maps a Sui owner address to a Brisk handle (e.g. `john123`),
// so the app can render `john123@brisk` instead of a 0x address for ordinary
// (non-merchant) users. Mirrors merchantStore. Handle is stored bare + lowercase;
// the `@brisk` suffix is a display concern the server adds in responses.

export type BriskUser = { ownerAddr: string; handle: string; avatar: string | null };

/** Thrown when a handle is already held by a DIFFERENT owner (unique violation
 *  on lower(handle)), so the route can return 409 rather than a generic 500. */
export class HandleTakenError extends Error {
  constructor() {
    super("That username is already taken");
    this.name = "HandleTakenError";
  }
}

function requirePool() {
  if (!pool) throw new Error("User directory is unavailable (DATABASE_URL not configured)");
  return pool;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function rowToUser(r: any): BriskUser {
  return { ownerAddr: r.owner_addr, handle: r.handle, avatar: r.avatar ?? null };
}

const SELECT_COLS = `owner_addr, handle, avatar`;

/**
 * Register or change the caller's handle (caller must be verified as `ownerAddr`
 * by the endpoint). Handle is lowercased. `avatar`: undefined = preserve the
 * existing photo, "" / null = remove it, a data URI = set it. Throws
 * `HandleTakenError` when another owner already holds the handle.
 */
export async function upsertHandle(input: {
  ownerAddr: string;
  handle: string;
  avatar?: string | null;
}): Promise<BriskUser> {
  const db = requirePool();
  const handle = input.handle.trim().toLowerCase();
  const touchAvatar = input.avatar !== undefined;
  const avatar = input.avatar && input.avatar.trim() ? input.avatar : null;
  try {
    const { rows } = touchAvatar
      ? await db.query(
          `INSERT INTO users (owner_addr, handle, avatar)
           VALUES ($1, $2, $3)
           ON CONFLICT (owner_addr) DO UPDATE
             SET handle = EXCLUDED.handle, avatar = EXCLUDED.avatar, updated_at = now()
           RETURNING ${SELECT_COLS}`,
          [input.ownerAddr, handle, avatar],
        )
      : await db.query(
          `INSERT INTO users (owner_addr, handle)
           VALUES ($1, $2)
           ON CONFLICT (owner_addr) DO UPDATE SET handle = EXCLUDED.handle, updated_at = now()
           RETURNING ${SELECT_COLS}`,
          [input.ownerAddr, handle],
        );
    return rowToUser(rows[0]);
  } catch (err: unknown) {
    // Unique-violation on the lower(handle) index → the handle is another owner's.
    const e = err as { code?: string; constraint?: string };
    if (e?.code === "23505" && e?.constraint === "users_handle_lower_idx") {
      throw new HandleTakenError();
    }
    throw err;
  }
}

export async function getUserByOwner(ownerAddr: string): Promise<BriskUser | null> {
  const db = requirePool();
  const { rows } = await db.query(`SELECT ${SELECT_COLS} FROM users WHERE owner_addr = $1`, [
    ownerAddr,
  ]);
  return rows[0] ? rowToUser(rows[0]) : null;
}

export async function getUserByHandle(handle: string): Promise<BriskUser | null> {
  const db = requirePool();
  const { rows } = await db.query(
    `SELECT ${SELECT_COLS} FROM users WHERE lower(handle) = lower($1)`,
    [handle],
  );
  return rows[0] ? rowToUser(rows[0]) : null;
}

/** Batch lookup for name rendering (Activity, dashboard): resolve owner addresses
 *  to handles + avatars. */
export async function lookupUsers(addrs: string[]): Promise<BriskUser[]> {
  const db = requirePool();
  if (addrs.length === 0) return [];
  const { rows } = await db.query(
    `SELECT ${SELECT_COLS} FROM users WHERE owner_addr = ANY($1::text[])`,
    [addrs],
  );
  return rows.map(rowToUser);
}
