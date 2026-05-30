import type { Database as DB } from "better-sqlite3";
import type { SuiEvent } from "@mysten/sui/jsonRpc";

/**
 * Idempotent event handlers. Field names verified against the published
 * Predict module at 0xf5ea...5138 — see docs/range-markets.md for the
 * full struct shapes. The `pickInt`/`pickStr` helpers tolerate multiple
 * field-name spellings so the same handlers can survive minor schema
 * tweaks upstream without crashing the poller.
 */

type Json = Record<string, unknown>;

function pickStr(obj: Json | undefined, ...keys: string[]): string | null {
  if (!obj) return null;
  for (const k of keys) {
    const v = obj[k];
    if (typeof v === "string" && v.length > 0) return v;
  }
  return null;
}

function pickInt(obj: Json | undefined, ...keys: string[]): number | null {
  if (!obj) return null;
  for (const k of keys) {
    const v = obj[k];
    if (typeof v === "number" && Number.isFinite(v)) return v;
    if (typeof v === "string" && /^-?\d+$/.test(v)) {
      const n = Number(v);
      if (Number.isFinite(n)) return n;
    }
    if (typeof v === "bigint") return Number(v);
  }
  return null;
}

function pickBool(obj: Json | undefined, ...keys: string[]): number | null {
  if (!obj) return null;
  for (const k of keys) {
    const v = obj[k];
    if (typeof v === "boolean") return v ? 1 : 0;
    if (typeof v === "number") return v === 0 ? 0 : 1;
    if (typeof v === "string") {
      if (v === "true") return 1;
      if (v === "false") return 0;
    }
  }
  return null;
}

function eventTimestampMs(ev: SuiEvent): number {
  const raw = ev.timestampMs;
  if (typeof raw === "string" && /^\d+$/.test(raw)) return Number(raw);
  if (typeof raw === "number") return raw;
  return Date.now();
}

/* ─── Binary Predict events ────────────────────────────────────────────── */

/**
 * predict::PositionMinted
 *   fields: predict_id, manager_id, trader, quote_asset, oracle_id, expiry,
 *           strike, is_up, quantity, cost, ask_price
 */
export function handleMintEvent(db: DB, ev: SuiEvent): void {
  const p = (ev.parsedJson ?? {}) as Json;
  const sender = pickStr(p, "trader", "owner", "sender") ?? ev.sender ?? "";
  const oracleId = pickStr(p, "oracle_id", "oracleId");
  if (!sender || !oracleId) return;

  const isUp = pickBool(p, "is_up", "isUp");
  const strike = pickInt(p, "strike", "strike_price", "strikePrice");
  const quantity = pickInt(p, "quantity") ?? 0;
  const cost = pickInt(p, "cost", "bet_size", "betSize", "amount") ?? 0;

  db.prepare(
    `INSERT INTO positions (
      digest, sender, manager_id, oracle_id, expiry, strike, is_up,
      kind, lower_strike, upper_strike, direction,
      quantity, bet_size, max_payout, asset, timestamp_ms
    ) VALUES (?, ?, ?, ?, ?, ?, ?, 'binary', NULL, NULL, ?, ?, ?, NULL, ?, ?)
    ON CONFLICT(digest) DO UPDATE SET
      sender = excluded.sender,
      manager_id = excluded.manager_id,
      oracle_id = excluded.oracle_id,
      expiry = excluded.expiry,
      strike = excluded.strike,
      is_up = excluded.is_up,
      quantity = excluded.quantity,
      bet_size = excluded.bet_size,
      asset = excluded.asset,
      timestamp_ms = excluded.timestamp_ms`,
  ).run(
    ev.id.txDigest,
    sender,
    pickStr(p, "manager_id", "managerId"),
    oracleId,
    pickInt(p, "expiry", "expiry_timestamp", "expiryTimestamp") ?? 0,
    strike,
    isUp,
    isUp === 1 ? "YES" : isUp === 0 ? "NO" : null,
    quantity,
    cost,
    pickStr(p, "asset", "asset_symbol", "underlying"),
    eventTimestampMs(ev),
  );
}

/**
 * predict::PositionRedeemed
 *   fields: predict_id, manager_id, owner, executor, quote_asset, oracle_id,
 *           expiry, strike, is_up, quantity, payout, bid_price, is_settled
 *
 * Marks the matching position (by sender, oracle_id, expiry, strike, is_up)
 * as redeemed. Pre-Phase A predict::redeem_permissionless also emits this,
 * so we match on the owner field rather than the executor.
 */
export function handleRedeemEvent(db: DB, ev: SuiEvent): void {
  const p = (ev.parsedJson ?? {}) as Json;
  const owner = pickStr(p, "owner", "trader", "sender") ?? "";
  const oracleId = pickStr(p, "oracle_id", "oracleId");
  const expiry = pickInt(p, "expiry", "expiry_timestamp");
  const strike = pickInt(p, "strike", "strike_price");
  const isUp = pickBool(p, "is_up", "isUp");
  if (!owner || !oracleId || expiry === null) return;

  db.prepare(
    `UPDATE positions
        SET redeemed_digest = ?,
            redeemed_amount = ?,
            redeemed_at_ms = ?
      WHERE sender = ?
        AND oracle_id = ?
        AND expiry = ?
        AND kind = 'binary'
        AND (strike IS NULL OR strike = ?)
        AND (is_up IS NULL OR is_up = ?)
        AND redeemed_digest IS NULL`,
  ).run(
    ev.id.txDigest,
    pickInt(p, "payout", "redeem_amount", "amount") ?? 0,
    eventTimestampMs(ev),
    owner,
    oracleId,
    expiry,
    strike,
    isUp,
  );
}

/* ─── Range Predict events ─────────────────────────────────────────────── */

/**
 * predict::RangeMinted
 *   fields: predict_id, manager_id, trader, quote_asset, oracle_id, expiry,
 *           lower_strike, higher_strike, quantity, cost, ask_price
 *
 * Range markets are one-sided in the protocol — mint_range only sells BOUNDED.
 * Direction is always BOUNDED on mint; the vault is the implicit OUTSIDE LP.
 */
export function handleRangeMintEvent(db: DB, ev: SuiEvent): void {
  const p = (ev.parsedJson ?? {}) as Json;
  const sender = pickStr(p, "trader", "owner", "sender") ?? ev.sender ?? "";
  const oracleId = pickStr(p, "oracle_id", "oracleId");
  if (!sender || !oracleId) return;

  const lower = pickInt(p, "lower_strike", "lowerStrike", "lower");
  const higher = pickInt(
    p,
    "higher_strike",
    "higherStrike",
    "upper_strike",
    "upperStrike",
    "upper",
  );
  const quantity = pickInt(p, "quantity") ?? 0;
  const cost = pickInt(p, "cost", "bet_size", "betSize", "amount") ?? 0;

  db.prepare(
    `INSERT INTO positions (
      digest, sender, manager_id, oracle_id, expiry, strike, is_up,
      kind, lower_strike, upper_strike, direction,
      quantity, bet_size, max_payout, asset, timestamp_ms
    ) VALUES (?, ?, ?, ?, ?, NULL, NULL, 'range', ?, ?, 'BOUNDED', ?, ?, ?, ?, ?)
    ON CONFLICT(digest) DO UPDATE SET
      sender = excluded.sender,
      manager_id = excluded.manager_id,
      oracle_id = excluded.oracle_id,
      expiry = excluded.expiry,
      lower_strike = excluded.lower_strike,
      upper_strike = excluded.upper_strike,
      direction = excluded.direction,
      quantity = excluded.quantity,
      bet_size = excluded.bet_size,
      max_payout = excluded.max_payout,
      asset = excluded.asset,
      timestamp_ms = excluded.timestamp_ms`,
  ).run(
    ev.id.txDigest,
    sender,
    pickStr(p, "manager_id", "managerId"),
    oracleId,
    pickInt(p, "expiry", "expiry_timestamp", "expiryTimestamp") ?? 0,
    lower,
    higher,
    quantity,
    cost,
    // max payout for a BOUNDED position is the face value (quantity).
    quantity,
    pickStr(p, "asset", "asset_symbol", "underlying"),
    eventTimestampMs(ev),
  );
}

/**
 * predict::RangeRedeemed
 *   fields: predict_id, manager_id, trader, quote_asset, oracle_id, expiry,
 *           lower_strike, higher_strike, quantity, payout, bid_price, is_settled
 */
export function handleRangeRedeemEvent(db: DB, ev: SuiEvent): void {
  const p = (ev.parsedJson ?? {}) as Json;
  const sender = pickStr(p, "trader", "owner", "sender") ?? "";
  const oracleId = pickStr(p, "oracle_id", "oracleId");
  const expiry = pickInt(p, "expiry", "expiry_timestamp");
  const lower = pickInt(p, "lower_strike", "lowerStrike");
  const higher = pickInt(p, "higher_strike", "higherStrike", "upper_strike", "upperStrike");
  if (!sender || !oracleId || expiry === null) return;

  db.prepare(
    `UPDATE positions
        SET redeemed_digest = ?,
            redeemed_amount = ?,
            redeemed_at_ms = ?
      WHERE sender = ?
        AND oracle_id = ?
        AND expiry = ?
        AND kind = 'range'
        AND (lower_strike IS NULL OR lower_strike = ?)
        AND (upper_strike IS NULL OR upper_strike = ?)
        AND redeemed_digest IS NULL`,
  ).run(
    ev.id.txDigest,
    pickInt(p, "payout", "redeem_amount", "amount") ?? 0,
    eventTimestampMs(ev),
    sender,
    oracleId,
    expiry,
    lower,
    higher,
  );
}

/* ─── Manager creation ─────────────────────────────────────────────────── */

/**
 * predict_manager::PredictManagerCreated
 *   fields: manager_id, owner
 */
export function handlePredictManagerCreated(db: DB, ev: SuiEvent): void {
  const p = (ev.parsedJson ?? {}) as Json;
  const managerId = pickStr(p, "manager_id", "managerId");
  const owner = pickStr(p, "owner") ?? ev.sender ?? "";
  if (!managerId || !owner) return;
  db.prepare(
    `INSERT INTO managers (manager_id, owner, source_digest, created_ms)
     VALUES (?, ?, ?, ?)
     ON CONFLICT(manager_id) DO UPDATE SET
       owner = excluded.owner,
       source_digest = excluded.source_digest,
       created_ms = excluded.created_ms`,
  ).run(managerId, owner, ev.id.txDigest, eventTimestampMs(ev));
}

/* ─── Oracle settle ────────────────────────────────────────────────────── */

/**
 * oracle::OracleSettled
 *   fields: oracle_id, expiry, settlement_price, timestamp
 *
 * Resolves every unsettled position on the (oracle_id, expiry) market:
 *   binary: WIN if (is_up == 1) === (settlement_price > strike).
 *   range:  WIN if BOUNDED and lower <= price <= higher.
 *           (OUTSIDE never gets minted as a position in Phase B; the vault
 *            holds the implicit short.)
 */
export function handleSettleEvent(db: DB, ev: SuiEvent): void {
  const p = (ev.parsedJson ?? {}) as Json;
  const oracleId = pickStr(p, "oracle_id", "oracleId");
  const expiry = pickInt(p, "expiry", "expiry_timestamp", "expiryTimestamp");
  const settlementPrice = pickInt(p, "settlement_price", "settlementPrice", "price");
  if (!oracleId || expiry === null || settlementPrice === null) return;

  const settledAtMs = eventTimestampMs(ev);
  db.prepare(
    `INSERT INTO oracle_snapshots (oracle_id, expiry, status, settlement_price, last_seen_ms)
     VALUES (?, ?, 'SETTLED', ?, ?)
     ON CONFLICT(oracle_id, expiry) DO UPDATE SET
       status = 'SETTLED',
       settlement_price = excluded.settlement_price,
       last_seen_ms = excluded.last_seen_ms`,
  ).run(oracleId, expiry, settlementPrice, settledAtMs);

  type Row = {
    digest: string;
    kind: string;
    strike: number | null;
    is_up: number | null;
    lower_strike: number | null;
    upper_strike: number | null;
    direction: string | null;
  };
  const rows = db
    .prepare(
      `SELECT digest, kind, strike, is_up, lower_strike, upper_strike, direction
         FROM positions
        WHERE oracle_id = ? AND expiry = ? AND settled_outcome IS NULL`,
    )
    .all(oracleId, expiry) as Row[];

  const updateOutcome = db.prepare(
    `UPDATE positions
        SET settled_outcome = ?, settlement_price = ?, settled_at_ms = COALESCE(settled_at_ms, ?)
      WHERE digest = ?`,
  );

  for (const r of rows) {
    let won: boolean | null = null;
    if (r.kind === "binary" && r.strike !== null && r.is_up !== null) {
      const upWon = settlementPrice > r.strike;
      won = r.is_up === 1 ? upWon : !upWon;
    } else if (r.kind === "range" && r.lower_strike !== null && r.upper_strike !== null) {
      const inRange = settlementPrice >= r.lower_strike && settlementPrice <= r.upper_strike;
      won = r.direction === "BOUNDED" ? inRange : !inRange;
    }
    if (won === null) continue;
    updateOutcome.run(won ? "WIN" : "LOSS", settlementPrice, settledAtMs, r.digest);
  }
}

/* ─── Fathom router event ──────────────────────────────────────────────── */

/**
 * fathom_router::HedgedSwapExecuted
 *   fields: trader, manager_id, oracle_id, expiry, strike, is_yes, is_range,
 *           lower_strike, upper_strike, stake_amount, hedge_base_in,
 *           hedge_quote_out, min_out
 *
 * Emitted by Fathom's own Move package when a Smart Bet's DeepBook spot leg
 * fills at or above the enforced floor. Links the (same-PTB) Predict mint to
 * the verified on-chain orderbook fill.
 */
export function handleHedgedSwap(db: DB, ev: SuiEvent): void {
  const p = (ev.parsedJson ?? {}) as Json;
  const trader = pickStr(p, "trader", "sender") ?? ev.sender ?? "";
  if (!trader) return;

  db.prepare(
    `INSERT OR IGNORE INTO hedged_swaps (
      digest, event_seq, trader, manager_id, oracle_id, expiry, strike,
      is_yes, is_range, lower_strike, upper_strike, stake_amount,
      hedge_base_in, hedge_quote_out, min_out, timestamp_ms
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    ev.id.txDigest,
    Number(ev.id.eventSeq),
    trader,
    pickStr(p, "manager_id", "managerId"),
    pickStr(p, "oracle_id", "oracleId"),
    pickInt(p, "expiry"),
    pickInt(p, "strike"),
    pickBool(p, "is_yes", "isYes"),
    pickBool(p, "is_range", "isRange"),
    pickInt(p, "lower_strike", "lowerStrike"),
    pickInt(p, "upper_strike", "upperStrike"),
    pickInt(p, "stake_amount", "stakeAmount"),
    pickInt(p, "hedge_base_in", "hedgeBaseIn"),
    pickInt(p, "hedge_quote_out", "hedgeQuoteOut"),
    pickInt(p, "min_out", "minOut"),
    eventTimestampMs(ev),
  );
}
