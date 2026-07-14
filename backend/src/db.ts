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
  // Lifecycle columns added after the initial release — idempotent so existing
  // deployments migrate on boot without a separate migration step.
  await pool.query(`ALTER TABLE payment_links
    ADD COLUMN IF NOT EXISTS reusable    BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN IF NOT EXISTS canceled_at TIMESTAMPTZ;`);
  // Links may target a merchant "till" (receiving account) instead of a raw
  // payee address. Nullable for backward-compat with pre-till links.
  await pool.query(`ALTER TABLE payment_links
    ADD COLUMN IF NOT EXISTS till_id TEXT;`);
  // The merchant who created the link (their zkLogin address). Needed to list a
  // merchant's links now that `payee` is the till address, not the merchant.
  // Backfill legacy rows: before tills, payee WAS the merchant address.
  await pool.query(`ALTER TABLE payment_links
    ADD COLUMN IF NOT EXISTS owner_addr TEXT;`);
  await pool.query(`UPDATE payment_links SET owner_addr = payee WHERE owner_addr IS NULL;`);

  // Merchant receiving accounts ("tills"). One row per on-chain Till object; the
  // till_id (object id) is the customer-facing destination, owner_addr is the
  // merchant's zkLogin address (the listing/auth key), treasury_addr is the
  // recorded sweep destination. The daily cron lists active tills and sweeps each.
  await pool.query(`
    CREATE TABLE IF NOT EXISTS tills (
      till_id       TEXT PRIMARY KEY,
      merchant_id   TEXT NOT NULL,
      owner_addr    TEXT NOT NULL,
      treasury_addr TEXT NOT NULL,
      name          TEXT NOT NULL,
      active        BOOLEAN NOT NULL DEFAULT true,
      created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
      last_swept_at TIMESTAMPTZ
    );
  `);
  await pool.query(`CREATE INDEX IF NOT EXISTS tills_owner_idx ON tills (owner_addr);`);
  await pool.query(`CREATE INDEX IF NOT EXISTS tills_active_idx ON tills (active) WHERE active;`);

  // gen_random_uuid() for gift-card ids.
  await pool.query(`CREATE EXTENSION IF NOT EXISTS pgcrypto;`);

  // --- Merchant directory ------------------------------------------------
  // One profile per on-chain Merchant (and per owner address). Gives every
  // merchant a human business name + URL-safe slug so the app can render names
  // instead of 0x addresses (Activity, links, dashboard, gift cards).
  await pool.query(`
    CREATE TABLE IF NOT EXISTS merchant_profiles (
      merchant_id   TEXT PRIMARY KEY,
      owner_addr    TEXT NOT NULL,
      business_name TEXT NOT NULL,
      slug          TEXT NOT NULL,
      created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
    );
  `);
  await pool.query(
    `CREATE UNIQUE INDEX IF NOT EXISTS merchant_profiles_owner_idx ON merchant_profiles (owner_addr);`,
  );
  await pool.query(
    `CREATE UNIQUE INDEX IF NOT EXISTS merchant_profiles_slug_idx ON merchant_profiles (slug);`,
  );
  await pool.query(
    `CREATE INDEX IF NOT EXISTS merchant_profiles_name_idx ON merchant_profiles (lower(business_name));`,
  );
  // Richer directory fields (added after the initial release) — nullable so
  // existing rows migrate on boot. business_name stays the required core; these
  // are optional business metadata surfaced in setup + the gift-card picker.
  await pool.query(`ALTER TABLE merchant_profiles
    ADD COLUMN IF NOT EXISTS vat_id   TEXT,
    ADD COLUMN IF NOT EXISTS city     TEXT,
    ADD COLUMN IF NOT EXISTS country  TEXT,
    ADD COLUMN IF NOT EXISTS phone    TEXT,
    ADD COLUMN IF NOT EXISTS email    TEXT,
    ADD COLUMN IF NOT EXISTS category TEXT,
    ADD COLUMN IF NOT EXISTS logo_url TEXT;`);

  // --- User directory (Brisk usernames) ----------------------------------
  // One handle per owner address, so the app renders `john123@brisk` instead of
  // a 0x address for ordinary (non-merchant) users. Handle stored bare +
  // lowercase; case-insensitive uniqueness via the lower(handle) index.
  await pool.query(`
    CREATE TABLE IF NOT EXISTS users (
      owner_addr TEXT PRIMARY KEY,
      handle     TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
  `);
  await pool.query(
    `CREATE UNIQUE INDEX IF NOT EXISTS users_handle_lower_idx ON users (lower(handle));`,
  );
  // Optional compressed avatar as a small data URI (personal profile photo).
  await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS avatar TEXT;`);

  // --- Gift cards: merchant-prepaid (this table is a metadata INDEX) ------
  // Mint/claim/redeem/regift live on-chain (Move `gift_card`); the merchant is
  // paid at issuance and the card holds no escrow. We index object_id +
  // claim_code + merchant + buyer + recipient so the app can list cards and
  // serve the /g/:code share landing. The legacy balance/fee columns (from the
  // earlier DB-ledger design) are kept NOT NULL but written as 0.
  await pool.query(`
    CREATE TABLE IF NOT EXISTS gift_cards (
      id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      claim_code          TEXT UNIQUE NOT NULL,
      merchant_id         TEXT NOT NULL,
      buyer_addr          TEXT NOT NULL,
      recipient_addr      TEXT,
      face_value_micros   BIGINT NOT NULL,
      balance_micros      BIGINT NOT NULL,
      fee_micros          BIGINT NOT NULL,
      merchant_net_micros BIGINT NOT NULL,
      status              TEXT NOT NULL DEFAULT 'pending_payment',
      purchase_fee_digest      TEXT,
      purchase_merchant_digest TEXT,
      created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
      funded_at           TIMESTAMPTZ,
      claimed_at          TIMESTAMPTZ,
      expires_at          TIMESTAMPTZ
    );
  `);
  // On-chain GiftCard object id (added when gift cards moved on-chain).
  await pool.query(`ALTER TABLE gift_cards ADD COLUMN IF NOT EXISTS object_id TEXT;`);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS gift_cards (
      id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      claim_code          TEXT UNIQUE NOT NULL,
      merchant_id         TEXT NOT NULL,
      buyer_addr          TEXT NOT NULL,
      recipient_addr      TEXT,
      face_value_micros   BIGINT NOT NULL,
      balance_micros      BIGINT NOT NULL,
      fee_micros          BIGINT NOT NULL,
      merchant_net_micros BIGINT NOT NULL,
      status              TEXT NOT NULL DEFAULT 'pending_payment',
      purchase_fee_digest      TEXT,
      purchase_merchant_digest TEXT,
      created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
      funded_at           TIMESTAMPTZ,
      claimed_at          TIMESTAMPTZ,
      expires_at          TIMESTAMPTZ
    );
  `);
  await pool.query(
    `CREATE INDEX IF NOT EXISTS gift_cards_merchant_idx ON gift_cards (merchant_id);`,
  );
  await pool.query(
    `CREATE INDEX IF NOT EXISTS gift_cards_recipient_idx ON gift_cards (recipient_addr);`,
  );
  await pool.query(`CREATE INDEX IF NOT EXISTS gift_cards_buyer_idx ON gift_cards (buyer_addr);`);

  // Gift-card redemption (debit) log — idempotent by settlement digest.
  await pool.query(`
    CREATE TABLE IF NOT EXISTS gift_card_redemptions (
      id            BIGSERIAL PRIMARY KEY,
      gift_card_id  UUID NOT NULL REFERENCES gift_cards(id),
      customer_addr TEXT NOT NULL,
      debit_micros  BIGINT NOT NULL,
      sale_micros   BIGINT NOT NULL,
      cash_micros   BIGINT NOT NULL,
      tx_digest     TEXT,
      created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
    );
  `);
  await pool.query(
    `CREATE UNIQUE INDEX IF NOT EXISTS gift_card_redemptions_digest_idx
       ON gift_card_redemptions (tx_digest) WHERE tx_digest IS NOT NULL;`,
  );

  // --- POS terminals + sessions (ERP ↔ backend ↔ merchant phone) ---------
  // A terminal binds a merchant device (terminal_id, generated by the app) to
  // its owner/merchant/till + an auth token used for the WebSocket + result
  // report. A session is one ERP-initiated sale; the merchant device settles it
  // on-chain and reports the digest as aade_transaction_id, which the ERP polls.
  await pool.query(`
    CREATE TABLE IF NOT EXISTS pos_terminals (
      terminal_id  TEXT PRIMARY KEY,
      owner_addr   TEXT NOT NULL,
      merchant_id  TEXT NOT NULL,
      till_id      TEXT NOT NULL,
      name         TEXT NOT NULL,
      token        TEXT NOT NULL,
      created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
      last_seen_at TIMESTAMPTZ
    );
  `);
  await pool.query(
    `CREATE INDEX IF NOT EXISTS pos_terminals_owner_idx ON pos_terminals (owner_addr);`,
  );
  // Stable per-device key the app sends; the short terminal_id is bound to it so
  // a device keeps its code across re-registrations. Nullable + unique.
  await pool.query(`ALTER TABLE pos_terminals ADD COLUMN IF NOT EXISTS device_id TEXT;`);
  await pool.query(
    `CREATE UNIQUE INDEX IF NOT EXISTS pos_terminals_device_idx ON pos_terminals (device_id) WHERE device_id IS NOT NULL;`,
  );

  await pool.query(`
    CREATE TABLE IF NOT EXISTS pos_sessions (
      session_id          TEXT PRIMARY KEY,
      terminal_id         TEXT NOT NULL,
      amount_micros       BIGINT NOT NULL,
      net_cents           INT NOT NULL DEFAULT 0,
      vat_cents           INT NOT NULL DEFAULT 0,
      total_cents         INT NOT NULL DEFAULT 0,
      state               TEXT NOT NULL DEFAULT 'PROCESSING',
      aade_transaction_id TEXT,
      delivered           BOOLEAN NOT NULL DEFAULT false,
      created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at          TIMESTAMPTZ NOT NULL DEFAULT now()
    );
  `);
  await pool.query(
    `CREATE INDEX IF NOT EXISTS pos_sessions_pending_idx
       ON pos_sessions (terminal_id) WHERE state = 'PROCESSING' AND delivered = false;`,
  );

  console.log("[db] payment_links + tills + merchant + gift-card + POS schema ready");
}
