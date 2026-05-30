import { mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import Database, { type Database as DB } from "better-sqlite3";
import { MIGRATIONS } from "./migrations.js";

let dbInstance: DB | null = null;

export function getDb(): DB {
  if (dbInstance) return dbInstance;

  const dbPath = process.env.FATHOM_DB_PATH ?? join(process.cwd(), "data", "fathom.sqlite");
  mkdirSync(dirname(dbPath), { recursive: true });

  const db = new Database(dbPath);
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");
  db.pragma("synchronous = NORMAL");

  runMigrations(db);
  dbInstance = db;
  return db;
}

function runMigrations(db: DB): void {
  db.exec(`CREATE TABLE IF NOT EXISTS schema_migrations (
    version    TEXT PRIMARY KEY,
    applied_at INTEGER NOT NULL
  )`);

  const applied = new Set<string>(
    (db.prepare("SELECT version FROM schema_migrations").all() as { version: string }[]).map(
      (r) => r.version,
    ),
  );

  const insertVersion = db.prepare(
    "INSERT INTO schema_migrations (version, applied_at) VALUES (?, ?)",
  );

  const ordered = [...MIGRATIONS].sort((a, b) => a.version.localeCompare(b.version));
  for (const migration of ordered) {
    if (applied.has(migration.version)) continue;
    const tx = db.transaction(() => {
      db.exec(migration.sql);
      insertVersion.run(migration.version, Date.now());
    });
    tx();
    console.log(`[indexer] applied migration ${migration.version}`);
  }
}

export function withTx<T>(fn: (db: DB) => T): T {
  const db = getDb();
  const tx = db.transaction(fn);
  return tx(db);
}

/**
 * Reset all indexer state (cursors + derived rows). Schema is preserved.
 * Used by the CLI replay command.
 */
export function truncateAll(): void {
  const db = getDb();
  db.exec(`
    DELETE FROM positions;
    DELETE FROM predict_vault_snapshots;
    DELETE FROM oracle_snapshots;
    DELETE FROM event_ingestion_log;
    DELETE FROM event_ingestion_state;
    DELETE FROM cursor_state;
  `);
}

/**
 * Close the singleton DB handle. Tests call this between cases.
 */
export function closeDb(): void {
  if (dbInstance) {
    dbInstance.close();
    dbInstance = null;
  }
}
