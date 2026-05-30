/**
 * Integration probe for Fathom's on-chain router (move/fathom_router).
 *
 *   npx tsx scripts/probe-router.ts
 *
 * Exercises the DEPLOYED `router::assert_and_record` over a live SUI→DBUSDC
 * swap, signing with the local Sui CLI keypair (NOT sponsored — this is a
 * direct probe, not the app flow). It does NOT touch Predict (the router has
 * no Predict dependency); manager/oracle ids are zero dummies that only
 * populate the emitted event.
 *
 * The PTB mirrors the real Smart Bet spot leg:
 *   pool::swap_exact_base_for_quote<SUI,DBUSDC>(pool, sui, zeroDeep, 0, clock)
 *   router::assert_and_record<DBUSDC>(&quoteOut, minOut, ...)
 *   transferObjects([baseLeftover, quoteOut, deepLeftover], sender)
 *
 * Two cases:
 *   A. min_out = absurdly high  → expect MoveAbort EHedgeBelowFloor (code 1)
 *                                  IN THE ROUTER (not the pool).
 *   B. min_out = 0              → expect success + a HedgedSwapExecuted event,
 *                                  and report `hedge_quote_out` (whether the
 *                                  book actually filled with a coin::zero<DEEP>
 *                                  fee — the open testnet question).
 */
import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

import { SuiJsonRpcClient, getJsonRpcFullnodeUrl } from "@mysten/sui/jsonRpc";
import { Ed25519Keypair } from "@mysten/sui/keypairs/ed25519";
import { Transaction } from "@mysten/sui/transactions";

const ROUTER = "0x92555862cc0dbcedfd6f7ff15bc5ebf42e5bc33e81bf87dac0e611bf45e1c89c";
const DEEPBOOK_PKG = "0x22be4cade64bf2d02412c7e8d0e8beea2f78828b948118d46735315409371a3c";
const POOL = "0x1c19362ca52b8ffd7a33cee805a67d40f31e6ba303753fd3a4cfdfacea7163a5";
const SUI_TYPE = "0x2::sui::SUI";
const DBUSDC_TYPE = "0xf7152c05930480cd740d7311b5b8b45c6f488e3a53a11c3f74a6fac36a52e0d7::DBUSDC::DBUSDC";
const DEEP_TYPE = "0x36dbef866a1d62bf7328989a10fb2f07d769f4ee587c0de4a0a256e57e0a58a8::deep::DEEP";
const ZERO_ID = "0x0000000000000000000000000000000000000000000000000000000000000000";

const HEDGE_SUI_MICRO = 50_000_000n; // 0.05 SUI

function loadKeypair(): Ed25519Keypair {
  const path = join(homedir(), ".sui", "sui_config", "sui.keystore");
  const keys = JSON.parse(readFileSync(path, "utf8")) as string[];
  // First key in the keystore; flag byte (0x00 = ed25519) prefixes the 32-byte secret.
  const decoded = Buffer.from(keys[0], "base64");
  if (decoded[0] !== 0x00) {
    throw new Error(
      `Expected ed25519 (flag 0x00) as first keystore entry, got 0x${decoded[0].toString(16)}`,
    );
  }
  return Ed25519Keypair.fromSecretKey(decoded.subarray(1));
}

function buildHedgedSwapTx(sender: string, minOut: bigint): Transaction {
  const tx = new Transaction();
  tx.setSender(sender);
  const [suiCoin] = tx.splitCoins(tx.gas, [tx.pure.u64(HEDGE_SUI_MICRO)]);
  const [deepZero] = tx.moveCall({
    target: "0x2::coin::zero",
    typeArguments: [DEEP_TYPE],
    arguments: [],
  });
  // The DeepBook swap runs against the SDK-current package; min_out=0 because
  // the floor is enforced by the router below.
  const [baseLeftover, quoteOut, deepLeftover] = tx.moveCall({
    target: `${DEEPBOOK_PKG}::pool::swap_exact_base_for_quote`,
    typeArguments: [SUI_TYPE, DBUSDC_TYPE],
    arguments: [tx.object(POOL), suiCoin, deepZero, tx.pure.u64(0), tx.object("0x6")],
  });
  tx.moveCall({
    target: `${ROUTER}::router::assert_and_record`,
    typeArguments: [DBUSDC_TYPE],
    arguments: [
      quoteOut, // &Coin<DBUSDC> — borrowed, not consumed
      tx.pure.u64(minOut),
      tx.pure.u64(HEDGE_SUI_MICRO), // hedge_base_in
      tx.pure.id(ZERO_ID), // manager_id (dummy)
      tx.pure.id(ZERO_ID), // oracle_id (dummy)
      tx.pure.u64(0), // expiry
      tx.pure.u64(0), // strike
      tx.pure.bool(false), // is_yes
      tx.pure.bool(false), // is_range
      tx.pure.u64(0), // lower_strike
      tx.pure.u64(0), // upper_strike
      tx.pure.u64(0), // stake_amount
    ],
  });
  tx.transferObjects([baseLeftover, quoteOut, deepLeftover], tx.pure.address(sender));
  return tx;
}

async function main() {
  const client = new SuiJsonRpcClient({
    network: "testnet",
    url: getJsonRpcFullnodeUrl("testnet"),
  });
  const kp = loadKeypair();
  const sender = kp.toSuiAddress();
  console.log(`probe sender: ${sender}`);

  // Case A — enforced floor should abort in the router.
  console.log("\n=== Case A: min_out = 1e12 (expect router EHedgeBelowFloor abort) ===");
  try {
    const txA = buildHedgedSwapTx(sender, 1_000_000_000_000n);
    const rA = await client.signAndExecuteTransaction({
      signer: kp,
      transaction: txA,
      options: { showEffects: true },
    });
    console.log(
      `status: ${rA.effects?.status?.status}  error: ${rA.effects?.status?.error ?? "none"}`,
    );
    console.log(
      rA.effects?.status?.status === "failure"
        ? "✅ aborted as expected"
        : "❌ unexpectedly succeeded",
    );
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    const ours = msg.includes(`${ROUTER}::router`) || msg.includes("abort code: 1,");
    console.log(`threw: ${msg}`);
    console.log(ours ? "✅ abort came from the router floor" : "⚠️  abort came from elsewhere");
  }

  // Case B — no floor should succeed and emit the event.
  console.log("\n=== Case B: min_out = 0 (expect success + HedgedSwapExecuted) ===");
  const txB = buildHedgedSwapTx(sender, 0n);
  const rB = await client.signAndExecuteTransaction({
    signer: kp,
    transaction: txB,
    options: { showEffects: true, showEvents: true },
  });
  console.log(`status: ${rB.effects?.status?.status}  digest: ${rB.digest}`);
  const ev = (rB.events ?? []).find((e) => e.type.includes("::router::HedgedSwapExecuted"));
  if (ev) {
    console.log("✅ HedgedSwapExecuted emitted:");
    console.log(JSON.stringify(ev.parsedJson, null, 2));
    const filled = Number((ev.parsedJson as { hedge_quote_out?: string }).hedge_quote_out ?? 0);
    console.log(
      filled > 0
        ? `✅ orderbook FILLED ${filled} DBUSDC micros with a zero-DEEP fee — the leg is real on testnet.`
        : `⚠️  hedge_quote_out = 0: the pool did NOT fill with a zero-DEEP fee. The honest-Smart-Bet gate must require a non-empty fill (or real DEEP) before taking this path.`,
    );
  } else {
    console.log("❌ no HedgedSwapExecuted event found");
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
