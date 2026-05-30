/**
 * Operational CLI for the indexer cache.
 *
 *   npm run indexer:reset    -> drop all tables and rerun migrations
 *   npm run indexer:replay   -> keep schema, truncate derived rows and cursors
 *                                (next boot replays from chain genesis)
 *
 * Both commands are destructive but safe: the chain is the source of truth.
 */
import { closeDb, getDb, truncateAll } from "./db.js";

function reset(): void {
  const db = getDb();
  db.exec(`
    DROP TABLE IF EXISTS exposure_reconciliation_samples;
    DROP TABLE IF EXISTS keeper_divergence_samples;
    DROP TABLE IF EXISTS sponsor_tx_attempts;
    DROP TABLE IF EXISTS managers;
    DROP TABLE IF EXISTS positions;
    DROP TABLE IF EXISTS vault_exposure_snapshots;
    DROP TABLE IF EXISTS event_ingestion_log;
    DROP TABLE IF EXISTS event_ingestion_state;
    DROP TABLE IF EXISTS sponsorship_log;
    DROP TABLE IF EXISTS oracle_snapshots;
    DROP TABLE IF EXISTS cursor_state;
    DROP TABLE IF EXISTS schema_migrations;
  `);
  closeDb();
  // Calling getDb again triggers migrations.
  getDb();
  console.log("[indexer:cli] reset complete (tables dropped, schema re-created)");
}

function replay(): void {
  truncateAll();
  console.log("[indexer:cli] replay queue ready (cursors cleared, derived rows truncated)");
}

const cmd = process.argv[2];
switch (cmd) {
  case "reset":
    reset();
    break;
  case "replay":
    replay();
    break;
  default:
    console.error(`Usage: tsx src/indexer/cli.ts <reset|replay>`);
    process.exit(1);
}

closeDb();
