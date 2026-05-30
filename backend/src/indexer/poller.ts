import type { SuiJsonRpcClient } from "@mysten/sui/jsonRpc";
import type { SuiEvent, SuiEventFilter, EventId } from "@mysten/sui/jsonRpc";
import { getDb, withTx } from "./db.js";
import {
  handleHedgedSwap,
  handleMintEvent,
  handlePredictManagerCreated,
  handleRangeMintEvent,
  handleRedeemEvent,
  handleRangeRedeemEvent,
  handleSettleEvent,
} from "./eventHandlers.js";
import * as errorService from "../services/errorService.js";

const BATCH_LIMIT = 50;
const TICK_INTERVAL_MS = 2_500;
const MAX_BACKOFF_MS = 30_000;
const MIN_BACKOFF_MS = 1_000;

export interface PollerConfig {
  suiClient: SuiJsonRpcClient;
  predictPackageId: string;
  /** Fathom's own router package — indexes HedgedSwapExecuted. Optional: omit to skip. */
  routerPackageId?: string;
}

interface Filter {
  name: string;
  filter: SuiEventFilter;
  handle: (ev: SuiEvent) => void;
}

const KEEPER_EVENT_FILTER_NAMES = new Set([
  "predict_position_minted",
  "predict_position_redeemed",
  "predict_range_minted",
  "predict_range_redeemed",
  "oracle_settled",
]);

export const keeperIngestionFilters = [...KEEPER_EVENT_FILTER_NAMES];

let stopped = false;
let activeTimer: NodeJS.Timeout | null = null;
let lastTickMs = 0;
let backoffMs = MIN_BACKOFF_MS;

export function getLastTickMs(): number {
  return lastTickMs;
}

export function startPoller(config: PollerConfig): void {
  if (activeTimer) {
    console.warn("[indexer] poller already running");
    return;
  }
  stopped = false;

  // Event type names confirmed via sui_getNormalizedMoveModulesByPackage against
  // the Predict package; see docs/range-markets.md.
  const filters: Filter[] = [
    {
      name: "predict_position_minted",
      filter: { MoveEventType: `${config.predictPackageId}::predict::PositionMinted` },
      handle: (ev) => handleMintEvent(getDb(), ev),
    },
    {
      name: "predict_position_redeemed",
      filter: { MoveEventType: `${config.predictPackageId}::predict::PositionRedeemed` },
      handle: (ev) => handleRedeemEvent(getDb(), ev),
    },
    {
      name: "predict_range_minted",
      filter: { MoveEventType: `${config.predictPackageId}::predict::RangeMinted` },
      handle: (ev) => handleRangeMintEvent(getDb(), ev),
    },
    {
      name: "predict_range_redeemed",
      filter: { MoveEventType: `${config.predictPackageId}::predict::RangeRedeemed` },
      handle: (ev) => handleRangeRedeemEvent(getDb(), ev),
    },
    {
      name: "oracle_settled",
      filter: { MoveEventType: `${config.predictPackageId}::oracle::OracleSettled` },
      handle: (ev) => handleSettleEvent(getDb(), ev),
    },
    {
      name: "predict_manager_created",
      filter: {
        MoveEventType: `${config.predictPackageId}::predict_manager::PredictManagerCreated`,
      },
      handle: (ev) => handlePredictManagerCreated(getDb(), ev),
    },
  ];

  if (config.routerPackageId) {
    filters.push({
      name: "fathom_hedged_swap",
      filter: { MoveEventType: `${config.routerPackageId}::router::HedgedSwapExecuted` },
      handle: (ev) => handleHedgedSwap(getDb(), ev),
    });
  }

  console.log(
    `[indexer] poller starting (${filters.length} filters, interval=${TICK_INTERVAL_MS}ms)`,
  );

  const tick = async (): Promise<void> => {
    if (stopped) return;
    try {
      for (const f of filters) {
        await drainFilter(config.suiClient, f);
      }
      lastTickMs = Date.now();
      backoffMs = MIN_BACKOFF_MS;
      activeTimer = setTimeout(tick, TICK_INTERVAL_MS);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      errorService.captureError({
        message,
        source: "indexer.poller",
        stack: err instanceof Error ? err.stack : undefined,
      });
      console.error(`[indexer] tick failed, backing off ${backoffMs}ms: ${message}`);
      activeTimer = setTimeout(tick, backoffMs);
      backoffMs = Math.min(backoffMs * 2, MAX_BACKOFF_MS);
    }
  };

  activeTimer = setTimeout(tick, 0);
}

export function stopPoller(): void {
  stopped = true;
  if (activeTimer) {
    clearTimeout(activeTimer);
    activeTimer = null;
  }
}

/**
 * Drain one filter as far as we can in a single tick. We page through
 * `suix_queryEvents` until either nextCursor is null/equal to current cursor
 * or we hit a small per-tick cap to avoid hogging the loop.
 */
async function drainFilter(client: SuiJsonRpcClient, f: Filter): Promise<void> {
  const db = getDb();
  const cursorRow = db
    .prepare("SELECT tx_digest, event_seq FROM cursor_state WHERE name = ?")
    .get(f.name) as { tx_digest: string | null; event_seq: number | null } | undefined;

  let cursor: EventId | null =
    cursorRow && cursorRow.tx_digest
      ? { txDigest: cursorRow.tx_digest, eventSeq: String(cursorRow.event_seq ?? 0) }
      : null;

  // Cap pages per tick so a long backfill doesn't starve other filters.
  const MAX_PAGES_PER_TICK = 4;
  for (let i = 0; i < MAX_PAGES_PER_TICK; i++) {
    const page = await client.queryEvents({
      query: f.filter,
      cursor,
      limit: BATCH_LIMIT,
      order: "ascending",
    });

    if (page.data.length === 0) {
      if (page.nextCursor && (!cursor || page.nextCursor.txDigest !== cursor.txDigest)) {
        cursor = page.nextCursor;
        upsertCursor(f.name, cursor);
      }
      return;
    }

    withTx((db) => {
      const upsert = db.prepare(
        `INSERT INTO cursor_state (name, tx_digest, event_seq, updated_at)
         VALUES (?, ?, ?, ?)
         ON CONFLICT(name) DO UPDATE SET
           tx_digest = excluded.tx_digest,
           event_seq = excluded.event_seq,
           updated_at = excluded.updated_at`,
      );
      for (const ev of page.data) {
        if (!shouldProcessEvent(db, f.name, ev)) {
          continue;
        }
        try {
          f.handle(ev);
          recordIngestionSuccess(db, f.name, ev);
        } catch (handlerErr) {
          recordIngestionFailure(db, f.name, ev, handlerErr);
          // A single malformed event must not poison the batch — log and skip.
          const message = handlerErr instanceof Error ? handlerErr.message : String(handlerErr);
          errorService.captureError({
            message,
            source: `indexer.${f.name}`,
            metadata: { digest: ev.id.txDigest, eventSeq: ev.id.eventSeq },
          });
        }
      }
      const last = page.data[page.data.length - 1];
      cursor = { txDigest: last.id.txDigest, eventSeq: String(last.id.eventSeq) };
      upsert.run(f.name, cursor.txDigest, Number(cursor.eventSeq), Date.now());
    });

    if (!page.hasNextPage) return;
  }
}

function upsertCursor(name: string, cursor: EventId): void {
  getDb()
    .prepare(
      `INSERT INTO cursor_state (name, tx_digest, event_seq, updated_at)
       VALUES (?, ?, ?, ?)
       ON CONFLICT(name) DO UPDATE SET
         tx_digest = excluded.tx_digest,
         event_seq = excluded.event_seq,
         updated_at = excluded.updated_at`,
    )
    .run(name, cursor.txDigest, Number(cursor.eventSeq), Date.now());
}

function eventTimestampMs(ev: SuiEvent): number {
  const raw = ev.timestampMs;
  if (typeof raw === "string" && /^\d+$/.test(raw)) return Number(raw);
  if (typeof raw === "number" && Number.isFinite(raw)) return raw;
  return Date.now();
}

function shouldProcessEvent(
  db: ReturnType<typeof getDb>,
  filterName: string,
  ev: SuiEvent,
): boolean {
  const row = db
    .prepare(
      `SELECT status
         FROM event_ingestion_log
        WHERE filter_name = ? AND tx_digest = ? AND event_seq = ?`,
    )
    .get(filterName, ev.id.txDigest, Number(ev.id.eventSeq)) as { status: string } | undefined;

  return row?.status !== "processed";
}

function recordIngestionSuccess(
  db: ReturnType<typeof getDb>,
  filterName: string,
  ev: SuiEvent,
): void {
  const now = Date.now();
  const chainTs = eventTimestampMs(ev);
  db.prepare(
    `INSERT INTO event_ingestion_log
       (filter_name, tx_digest, event_seq, chain_ts_ms, processed_at_ms, status, error_message)
     VALUES (?, ?, ?, ?, ?, 'processed', NULL)
     ON CONFLICT(filter_name, tx_digest, event_seq) DO UPDATE SET
       chain_ts_ms = excluded.chain_ts_ms,
       processed_at_ms = excluded.processed_at_ms,
       status = 'processed',
       error_message = NULL`,
  ).run(filterName, ev.id.txDigest, Number(ev.id.eventSeq), chainTs, now);

  if (!KEEPER_EVENT_FILTER_NAMES.has(filterName)) return;

  db.prepare(
    `INSERT INTO event_ingestion_state
       (filter_name, last_processed_tx_digest, last_processed_event_seq, last_processed_chain_ts, last_processed_at_ms, processed_count)
     VALUES (?, ?, ?, ?, ?, 1)
     ON CONFLICT(filter_name) DO UPDATE SET
       last_processed_tx_digest = excluded.last_processed_tx_digest,
       last_processed_event_seq = excluded.last_processed_event_seq,
       last_processed_chain_ts = excluded.last_processed_chain_ts,
       last_processed_at_ms = excluded.last_processed_at_ms,
       processed_count = event_ingestion_state.processed_count + 1,
       last_error = NULL,
       last_error_tx_digest = NULL,
       last_error_event_seq = NULL,
       last_error_at_ms = NULL`,
  ).run(filterName, ev.id.txDigest, Number(ev.id.eventSeq), chainTs, now);
}

function recordIngestionFailure(
  db: ReturnType<typeof getDb>,
  filterName: string,
  ev: SuiEvent,
  error: unknown,
): void {
  const now = Date.now();
  const chainTs = eventTimestampMs(ev);
  const message = error instanceof Error ? error.message : String(error);

  db.prepare(
    `INSERT INTO event_ingestion_log
       (filter_name, tx_digest, event_seq, chain_ts_ms, processed_at_ms, status, error_message)
     VALUES (?, ?, ?, ?, ?, 'failed', ?)
     ON CONFLICT(filter_name, tx_digest, event_seq) DO UPDATE SET
       chain_ts_ms = excluded.chain_ts_ms,
       processed_at_ms = excluded.processed_at_ms,
       status = 'failed',
       error_message = excluded.error_message`,
  ).run(filterName, ev.id.txDigest, Number(ev.id.eventSeq), chainTs, now, message);

  if (!KEEPER_EVENT_FILTER_NAMES.has(filterName)) return;

  db.prepare(
    `INSERT INTO event_ingestion_state
       (filter_name, failure_count, last_error, last_error_tx_digest, last_error_event_seq, last_error_at_ms)
     VALUES (?, 1, ?, ?, ?, ?)
     ON CONFLICT(filter_name) DO UPDATE SET
       failure_count = event_ingestion_state.failure_count + 1,
       last_error = excluded.last_error,
       last_error_tx_digest = excluded.last_error_tx_digest,
       last_error_event_seq = excluded.last_error_event_seq,
       last_error_at_ms = excluded.last_error_at_ms`,
  ).run(filterName, message, ev.id.txDigest, Number(ev.id.eventSeq), now);
}
