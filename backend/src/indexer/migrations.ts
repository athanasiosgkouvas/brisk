/**
 * Inline migrations. New migrations append to MIGRATIONS in lexical order;
 * versions are recorded in `schema_migrations` so each runs at most once.
 *
 * Embedding the SQL avoids needing a copy-files step in `tsc -p tsconfig.json`.
 */
export interface Migration {
  version: string;
  sql: string;
}

export const MIGRATIONS: Migration[] = [
  {
    version: "010_deepbook_price_snapshots",
    sql: `
CREATE TABLE IF NOT EXISTS deepbook_price_snapshots (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  asset           TEXT NOT NULL,
  mid_micro       INTEGER NOT NULL,
  bid_micro       INTEGER,
  ask_micro       INTEGER,
  spread_bps      INTEGER,
  observed_at_ms  INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_deepbook_price_snapshots_asset_observed
  ON deepbook_price_snapshots(asset, observed_at_ms DESC);
    `,
  },
  {
    version: "009_hedged_swaps",
    sql: `
CREATE TABLE IF NOT EXISTS hedged_swaps (
  digest           TEXT NOT NULL,
  event_seq        INTEGER NOT NULL,
  trader           TEXT NOT NULL,
  manager_id       TEXT,
  oracle_id        TEXT,
  expiry           INTEGER,
  strike           INTEGER,
  is_yes           INTEGER,
  is_range         INTEGER,
  lower_strike     INTEGER,
  upper_strike     INTEGER,
  stake_amount     INTEGER,
  hedge_base_in    INTEGER,
  hedge_quote_out  INTEGER,
  min_out          INTEGER,
  timestamp_ms     INTEGER NOT NULL,
  PRIMARY KEY(digest, event_seq)
);

CREATE INDEX IF NOT EXISTS idx_hedged_swaps_trader ON hedged_swaps(trader, timestamp_ms DESC);
    `,
  },
  {
    version: "008_predict_vault_snapshots",
    sql: `
CREATE TABLE IF NOT EXISTS predict_vault_snapshots (
  id                INTEGER PRIMARY KEY AUTOINCREMENT,
  observed_at_ms    INTEGER NOT NULL,
  vault_value       INTEGER NOT NULL,
  total_plp         INTEGER NOT NULL,
  share_price_micro INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_predict_vault_snapshots_observed
  ON predict_vault_snapshots(observed_at_ms DESC);
    `,
  },
  {
    version: "007_drop_legacy_vault_tables",
    sql: `
DROP TABLE IF EXISTS vault_strategy_state;
DROP TABLE IF EXISTS vault_strategy_actions;
DROP TABLE IF EXISTS vault_exposure_snapshots;
DROP TABLE IF EXISTS exposure_reconciliation_samples;
DROP TABLE IF EXISTS keeper_divergence_samples;
    `,
  },
  {
    version: "005_keeper_event_ingestion",
    sql: `
CREATE TABLE IF NOT EXISTS event_ingestion_state (
  filter_name               TEXT PRIMARY KEY,
  last_processed_tx_digest  TEXT,
  last_processed_event_seq  INTEGER,
  last_processed_chain_ts   INTEGER,
  last_processed_at_ms      INTEGER,
  processed_count           INTEGER NOT NULL DEFAULT 0,
  failure_count             INTEGER NOT NULL DEFAULT 0,
  last_error                TEXT,
  last_error_tx_digest      TEXT,
  last_error_event_seq      INTEGER,
  last_error_at_ms          INTEGER
);

CREATE TABLE IF NOT EXISTS event_ingestion_log (
  filter_name     TEXT NOT NULL,
  tx_digest       TEXT NOT NULL,
  event_seq       INTEGER NOT NULL,
  chain_ts_ms     INTEGER,
  processed_at_ms INTEGER NOT NULL,
  status          TEXT NOT NULL,
  error_message   TEXT,
  PRIMARY KEY(filter_name, tx_digest, event_seq)
);

CREATE INDEX IF NOT EXISTS idx_event_ingestion_log_filter_processed
  ON event_ingestion_log(filter_name, processed_at_ms DESC);
CREATE INDEX IF NOT EXISTS idx_event_ingestion_log_status_processed
  ON event_ingestion_log(status, processed_at_ms DESC);
    `,
  },
  {
    version: "003_baseline_observability",
    sql: `
ALTER TABLE positions ADD COLUMN settled_at_ms INTEGER;
ALTER TABLE positions ADD COLUMN redeemed_at_ms INTEGER;

CREATE TABLE IF NOT EXISTS sponsor_tx_attempts (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  endpoint       TEXT NOT NULL,
  sender         TEXT,
  digest         TEXT,
  success        INTEGER NOT NULL,
  latency_ms     INTEGER NOT NULL,
  error_message  TEXT,
  created_at_ms  INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_sponsor_tx_attempts_window
  ON sponsor_tx_attempts(created_at_ms DESC);
CREATE INDEX IF NOT EXISTS idx_sponsor_tx_attempts_endpoint_window
  ON sponsor_tx_attempts(endpoint, created_at_ms DESC);
    `,
  },
  {
    version: "002_managers",
    sql: `
CREATE TABLE IF NOT EXISTS managers (
  manager_id     TEXT PRIMARY KEY,
  owner          TEXT NOT NULL,
  source_digest  TEXT,
  created_ms     INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_managers_owner ON managers(owner);
    `,
  },
  {
    version: "001_init",
    sql: `
CREATE TABLE IF NOT EXISTS cursor_state (
  name       TEXT PRIMARY KEY,
  tx_digest  TEXT,
  event_seq  INTEGER,
  updated_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS positions (
  digest             TEXT PRIMARY KEY,
  sender             TEXT NOT NULL,
  manager_id         TEXT,
  oracle_id          TEXT NOT NULL,
  expiry             INTEGER NOT NULL,
  strike             INTEGER,
  is_up              INTEGER,
  kind               TEXT NOT NULL DEFAULT 'binary',
  lower_strike       INTEGER,
  upper_strike       INTEGER,
  direction          TEXT,
  quantity           INTEGER NOT NULL,
  bet_size           INTEGER NOT NULL,
  max_payout         INTEGER,
  asset              TEXT,
  timestamp_ms       INTEGER NOT NULL,
  redeemed_digest    TEXT,
  redeemed_amount    INTEGER,
  settled_outcome    TEXT,
  settlement_price   INTEGER
);

CREATE INDEX IF NOT EXISTS idx_positions_sender         ON positions(sender);
CREATE INDEX IF NOT EXISTS idx_positions_oracle_expiry  ON positions(oracle_id, expiry);
CREATE INDEX IF NOT EXISTS idx_positions_timestamp      ON positions(timestamp_ms);
CREATE INDEX IF NOT EXISTS idx_positions_kind_sender    ON positions(kind, sender);

CREATE TABLE IF NOT EXISTS sponsorship_log (
  digest          TEXT PRIMARY KEY,
  sender          TEXT NOT NULL,
  timestamp_ms    INTEGER NOT NULL,
  gas_cost_micro  INTEGER
);

CREATE INDEX IF NOT EXISTS idx_sponsorship_sender_ts
  ON sponsorship_log(sender, timestamp_ms);

CREATE TABLE IF NOT EXISTS oracle_snapshots (
  oracle_id         TEXT NOT NULL,
  expiry            INTEGER NOT NULL,
  asset             TEXT,
  status            TEXT,
  settlement_price  INTEGER,
  spot              INTEGER,
  forward           INTEGER,
  min_strike        INTEGER,
  tick_size         INTEGER,
  last_seen_ms      INTEGER NOT NULL,
  PRIMARY KEY(oracle_id, expiry)
);
    `,
  },
];
