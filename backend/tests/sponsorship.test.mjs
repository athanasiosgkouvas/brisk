import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

process.env.INDEXER_ENABLED = "false";

const db = await import("../dist/indexer/db.js");
const guard = await import("../dist/services/sponsorshipGuard.js");
const stats = await import("../dist/indexer/derivedStats.js");

function freshTmpDb() {
  db.closeDb();
  const dir = mkdtempSync(join(tmpdir(), "fathom-sponsor-"));
  process.env.FATHOM_DB_PATH = join(dir, "fathom.sqlite");
  return () => {
    db.closeDb();
    rmSync(dir, { recursive: true, force: true });
  };
}

test("assertWithinDailyLimit passes under cap, throws over cap", async () => {
  const cleanup = freshTmpDb();
  process.env.SPONSORSHIP_DAILY_LIMIT_TX_COUNT = "3";
  try {
    assert.doesNotThrow(() => guard.assertWithinDailyLimit("0xUser"));
    stats.recordSponsorship("0xtx1", "0xUser");
    stats.recordSponsorship("0xtx2", "0xUser");
    assert.doesNotThrow(() => guard.assertWithinDailyLimit("0xUser"));

    stats.recordSponsorship("0xtx3", "0xUser");
    assert.throws(() => guard.assertWithinDailyLimit("0xUser"), /Daily sponsorship limit/);

    assert.doesNotThrow(() => guard.assertWithinDailyLimit("0xOther"));
  } finally {
    delete process.env.SPONSORSHIP_DAILY_LIMIT_TX_COUNT;
    cleanup();
  }
});

test("getSponsorshipUsage reports correct remaining count", async () => {
  const cleanup = freshTmpDb();
  try {
    const before = stats.getSponsorshipUsage("0xUser", 10);
    assert.equal(before.usedCount, 0);
    assert.equal(before.remaining, 10);

    stats.recordSponsorship("0xt1", "0xUser");
    stats.recordSponsorship("0xt2", "0xUser");
    const after = stats.getSponsorshipUsage("0xUser", 10);
    assert.equal(after.usedCount, 2);
    assert.equal(after.remaining, 8);
  } finally {
    cleanup();
  }
});

test("recordSponsorAttempt rolls up success/failure in summary window", async () => {
  const cleanup = freshTmpDb();
  try {
    stats.recordSponsorAttempt({
      endpoint: "sponsor",
      sender: "0xUser",
      digest: "0xd1",
      success: true,
      latencyMs: 80,
    });
    stats.recordSponsorAttempt({
      endpoint: "execute",
      digest: "0xd1",
      success: false,
      latencyMs: 120,
      errorMessage: "boom",
    });
    const summary = stats.getSponsorAttemptSummary(60 * 60 * 1000);
    assert.equal(summary.attempts, 2);
    assert.equal(summary.successCount, 1);
    assert.equal(summary.failureCount, 1);
    assert.equal(summary.successRate, 0.5);
  } finally {
    cleanup();
  }
});
