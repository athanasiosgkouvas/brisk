import pg from "pg";

// Durable store for payment links. Optional: if DATABASE_URL is unset the relay
// still boots (sponsor/execute/faucet keep working) and link endpoints report
// 503 — so local dev needs no Postgres. On Render, DATABASE_URL comes from the
// managed Postgres wired in render.yaml.

const connectionString = process.env.DATABASE_URL;

// Render's managed Postgres terminates TLS with a self-signed cert; the internal
// (same-region) URL works without SSL, the external URL needs it. Enable SSL for
// any non-local host and don't reject the self-signed chain.
const isLocal = !!connectionString && /@(localhost|127\.0\.0\.1)/.test(connectionString);

export const pool: pg.Pool | null = connectionString
  ? new pg.Pool({
      connectionString,
      ssl: isLocal ? undefined : { rejectUnauthorized: false },
    })
  : null;

export function isDbConfigured(): boolean {
  return pool !== null;
}

/** Create the payment_links table if it doesn't exist. No-op without a DB. */
export async function ensureSchema(): Promise<void> {
  if (!pool) {
    console.warn(
      "[db] DATABASE_URL is unset — payment-link endpoints are disabled. " +
        "Set it (see render.yaml / .env.example) to enable payment links.",
    );
    return;
  }
  await pool.query(`
    CREATE TABLE IF NOT EXISTS payment_links (
      code          TEXT PRIMARY KEY,
      merchant_id   TEXT NOT NULL,
      payee         TEXT NOT NULL,
      amount_micros BIGINT NOT NULL,
      invoice_id    TEXT NOT NULL,
      merchant_name TEXT NOT NULL,
      status        TEXT NOT NULL DEFAULT 'pending',
      digest        TEXT,
      created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
      expires_at    TIMESTAMPTZ,
      paid_at       TIMESTAMPTZ
    );
  `);
  console.log("[db] payment_links schema ready");
}
