/**
 * Indexer event-handler + derivedStats tests.
 *
 * Synthetic events match the on-chain Predict event shapes verified via
 * sui_getNormalizedMoveModulesByPackage — see docs/range-markets.md.
 * Each test points FATHOM_DB_PATH at a fresh tmp file so the lazy getDb()
 * singleton inside db.js reopens cleanly.
 */

import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

process.env.INDEXER_ENABLED = "false";

const db = await import("../dist/indexer/db.js");
const handlers = await import("../dist/indexer/eventHandlers.js");
const stats = await import("../dist/indexer/derivedStats.js");

function freshTmpDb() {
  db.closeDb();
  const dir = mkdtempSync(join(tmpdir(), "fathom-indexer-"));
  process.env.FATHOM_DB_PATH = join(dir, "fathom.sqlite");
  return () => {
    db.closeDb();
    rmSync(dir, { recursive: true, force: true });
  };
}

function makeEvent({
  digest = "0xabc",
  seq = "0",
  sender = "0xuser1",
  ts = 1_700_000_000_000,
  type = "0xpkg::predict::PositionMinted",
  parsedJson = {},
} = {}) {
  return {
    id: { txDigest: digest, eventSeq: seq },
    packageId: "0xpkg",
    transactionModule: "predict",
    sender,
    type,
    parsedJson,
    bcs: "",
    timestampMs: String(ts),
  };
}

test("PositionMinted + OracleSettled resolves binary positions correctly", async () => {
  const cleanup = freshTmpDb();
  try {
    const handle = db.getDb();

    handlers.handleMintEvent(handle, makeEvent({
      digest: "0xpos1",
      parsedJson: { trader: "0xA", oracle_id: "0xBTC", expiry: 100, strike: 50_000, is_up: true, quantity: 10, cost: 5, asset: "BTC" },
    }));
    handlers.handleMintEvent(handle, makeEvent({
      digest: "0xpos2",
      parsedJson: { trader: "0xB", oracle_id: "0xBTC", expiry: 100, strike: 50_000, is_up: false, quantity: 10, cost: 5, asset: "BTC" },
    }));

    handlers.handleSettleEvent(handle, makeEvent({
      digest: "0xsettle1",
      parsedJson: { oracle_id: "0xBTC", expiry: 100, settlement_price: 60_000 },
    }));

    const aStats = stats.getUserStats("0xA");
    const bStats = stats.getUserStats("0xB");

    assert.equal(aStats.wins, 1, "A bet UP should win when price > strike");
    assert.equal(aStats.currentStreak, 1);
    assert.equal(bStats.losses, 1, "B bet DOWN should lose when price > strike");
    assert.equal(bStats.currentStreak, 0);
  } finally {
    cleanup();
  }
});

test("replaying the same mint event is idempotent", async () => {
  const cleanup = freshTmpDb();
  try {
    const handle = db.getDb();
    const event = makeEvent({
      digest: "0xposX",
      parsedJson: { trader: "0xA", oracle_id: "0xETH", expiry: 200, strike: 3_000, is_up: true, quantity: 1, cost: 1 },
    });
    handlers.handleMintEvent(handle, event);
    handlers.handleMintEvent(handle, event);
    handlers.handleMintEvent(handle, event);

    const { count } = handle.prepare("SELECT COUNT(*) AS count FROM positions").get();
    assert.equal(count, 1, "expected exactly one row after triple replay");
  } finally {
    cleanup();
  }
});

test("currentStreak walks most-recent settled positions", async () => {
  const cleanup = freshTmpDb();
  try {
    const handle = db.getDb();
    const mk = (digest, ts, isUp) => ({
      digest, sender: "0xS", ts,
      parsedJson: { trader: "0xS", oracle_id: "0xBTC", expiry: ts + 1, strike: 100, is_up: isUp, quantity: 1, cost: 1 },
    });
    handlers.handleMintEvent(handle, makeEvent(mk("0xa", 10, false))); // DOWN
    handlers.handleMintEvent(handle, makeEvent(mk("0xb", 20, true)));  // UP
    handlers.handleMintEvent(handle, makeEvent(mk("0xc", 30, true)));  // UP

    // Settle each at price=200 → up wins, down loses.
    handlers.handleSettleEvent(handle, makeEvent({ digest: "0xs1", parsedJson: { oracle_id: "0xBTC", expiry: 11, settlement_price: 200 } }));
    handlers.handleSettleEvent(handle, makeEvent({ digest: "0xs2", parsedJson: { oracle_id: "0xBTC", expiry: 21, settlement_price: 200 } }));
    handlers.handleSettleEvent(handle, makeEvent({ digest: "0xs3", parsedJson: { oracle_id: "0xBTC", expiry: 31, settlement_price: 200 } }));

    const s = stats.getUserStats("0xS");
    assert.equal(s.totalPredictions, 3);
    assert.equal(s.wins, 2);
    assert.equal(s.losses, 1);
    assert.equal(s.currentStreak, 2);
    assert.equal(s.longestStreak, 2);
  } finally {
    cleanup();
  }
});

test("RangeMinted always stores direction=BOUNDED and resolves on settle", async () => {
  const cleanup = freshTmpDb();
  try {
    const handle = db.getDb();
    handlers.handleRangeMintEvent(handle, makeEvent({
      digest: "0xrIn",
      parsedJson: { trader: "0xA", oracle_id: "0xBTC", expiry: 500, lower_strike: 90, higher_strike: 110, quantity: 10, cost: 3 },
    }));
    handlers.handleRangeMintEvent(handle, makeEvent({
      digest: "0xrOut",
      parsedJson: { trader: "0xB", oracle_id: "0xBTC", expiry: 600, lower_strike: 90, higher_strike: 110, quantity: 10, cost: 3 },
    }));

    // Position rows store the BOUNDED direction.
    const rows = handle.prepare("SELECT digest, kind, direction FROM positions ORDER BY digest").all();
    assert.equal(rows.length, 2);
    for (const r of rows) {
      assert.equal(r.kind, "range");
      assert.equal(r.direction, "BOUNDED");
    }

    // Settle "in-range" first market at 100 → BOUNDED wins.
    handlers.handleSettleEvent(handle, makeEvent({
      digest: "0xsIn",
      parsedJson: { oracle_id: "0xBTC", expiry: 500, settlement_price: 100 },
    }));
    // Settle "out-of-range" second market at 200 → BOUNDED loses.
    handlers.handleSettleEvent(handle, makeEvent({
      digest: "0xsOut",
      parsedJson: { oracle_id: "0xBTC", expiry: 600, settlement_price: 200 },
    }));

    const a = stats.getUserStats("0xA");
    const b = stats.getUserStats("0xB");
    assert.equal(a.wins, 1, "BOUNDED wins when settlement is in [lower, higher]");
    assert.equal(b.losses, 1, "BOUNDED loses when settlement is out of range");
  } finally {
    cleanup();
  }
});

test("PositionRedeemed marks the matching binary position as redeemed", async () => {
  const cleanup = freshTmpDb();
  try {
    const handle = db.getDb();
    handlers.handleMintEvent(handle, makeEvent({
      digest: "0xmint",
      parsedJson: { trader: "0xA", oracle_id: "0xBTC", expiry: 100, strike: 50_000, is_up: true, quantity: 10, cost: 5 },
    }));
    handlers.handleSettleEvent(handle, makeEvent({
      digest: "0xsettle",
      parsedJson: { oracle_id: "0xBTC", expiry: 100, settlement_price: 60_000 },
    }));
    handlers.handleRedeemEvent(handle, makeEvent({
      digest: "0xredeem",
      parsedJson: { owner: "0xA", oracle_id: "0xBTC", expiry: 100, strike: 50_000, is_up: true, payout: 10 },
    }));

    const row = handle.prepare(
      "SELECT settled_outcome, redeemed_digest, redeemed_amount FROM positions WHERE digest = ?",
    ).get("0xmint");
    assert.equal(row.settled_outcome, "WIN");
    assert.equal(row.redeemed_digest, "0xredeem");
    assert.equal(row.redeemed_amount, 10);
  } finally {
    cleanup();
  }
});

test("claim completion summary tracks completion rate and latency percentiles", async () => {
  const cleanup = freshTmpDb();
  try {
    const handle = db.getDb();
    const now = Date.now();
    const settle1 = now - 20_000;
    const settle2 = now - 18_000;
    handlers.handleMintEvent(handle, makeEvent({
      digest: "0xclaim1",
      ts: settle1 - 10_000,
      parsedJson: { trader: "0xA", oracle_id: "0xBTC", expiry: 100, strike: 50_000, is_up: true, quantity: 10, cost: 5 },
    }));
    handlers.handleMintEvent(handle, makeEvent({
      digest: "0xclaim2",
      ts: settle2 - 10_000,
      parsedJson: { trader: "0xB", oracle_id: "0xETH", expiry: 200, strike: 4_000, is_up: true, quantity: 10, cost: 5 },
    }));
    handlers.handleSettleEvent(handle, makeEvent({
      digest: "0xsettle-c1",
      ts: settle1,
      parsedJson: { oracle_id: "0xBTC", expiry: 100, settlement_price: 60_000 },
    }));
    handlers.handleSettleEvent(handle, makeEvent({
      digest: "0xsettle-c2",
      ts: settle2,
      parsedJson: { oracle_id: "0xETH", expiry: 200, settlement_price: 4_500 },
    }));
    handlers.handleRedeemEvent(handle, makeEvent({
      digest: "0xredeem-c1",
      ts: settle1 + 4_000,
      parsedJson: { owner: "0xA", oracle_id: "0xBTC", expiry: 100, strike: 50_000, is_up: true, payout: 10 },
    }));

    const summary = stats.getClaimCompletionSummary(24 * 60 * 60 * 1000, 5_000);
    assert.equal(summary.settledCount, 2);
    assert.equal(summary.claimedCount, 1);
    assert.equal(summary.pendingClaimCount, 1);
    assert.equal(summary.completionRate, 0.5);
    assert.equal(summary.p50LatencyMs, 4_000);
    assert.equal(summary.p95LatencyMs, 4_000);
    assert.equal(summary.withinSlaRate, 1);
  } finally {
    cleanup();
  }
});

test("social retention summary includes leaderboard rank and quest progress", async () => {
  const cleanup = freshTmpDb();
  try {
    const handle = db.getDb();
    const now = Date.now();
    handlers.handleMintEvent(handle, makeEvent({
      digest: "0xret-u1",
      sender: "0xU1",
      ts: now - 5_000,
      parsedJson: {
        trader: "0xU1",
        oracle_id: "0xBTC",
        expiry: now + 10_000,
        strike: 50_000,
        is_up: true,
        quantity: 10,
        cost: 5,
        asset: "BTC",
      },
    }));
    handlers.handleSettleEvent(handle, makeEvent({
      digest: "0xret-s1",
      ts: now - 2_000,
      parsedJson: { oracle_id: "0xBTC", expiry: now + 10_000, settlement_price: 60_000 },
    }));
    handlers.handleMintEvent(handle, makeEvent({
      digest: "0xret-u2",
      sender: "0xU2",
      ts: now - 4_000,
      parsedJson: {
        trader: "0xU2",
        oracle_id: "0xETH",
        expiry: now + 20_000,
        strike: 3_000,
        is_up: true,
        quantity: 10,
        cost: 5,
        asset: "ETH",
      },
    }));
    handlers.handleSettleEvent(handle, makeEvent({
      digest: "0xret-s2",
      ts: now - 1_000,
      parsedJson: { oracle_id: "0xETH", expiry: now + 20_000, settlement_price: 3_500 },
    }));
    handlers.handleRedeemEvent(handle, makeEvent({
      digest: "0xret-r2",
      ts: now,
      parsedJson: {
        owner: "0xU2",
        oracle_id: "0xETH",
        expiry: now + 20_000,
        strike: 3_000,
        is_up: true,
        payout: 10,
      },
    }));

    const summary = stats.getSocialRetentionSummary("0xU1", "week");
    assert.equal(summary.bucket, "week");
    assert.equal(summary.leaderboardTotal, 2);
    assert.equal(summary.leaderboardRank, 2);
    assert.equal(summary.pendingClaimCount, 1);
    assert.equal(summary.quests.length, 3);
    assert.equal(summary.quests[0].id, "streak");
  } finally {
    cleanup();
  }
});
