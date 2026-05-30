/**
 * Integration probe for genuine DeepBook maker orders (Phase 4).
 *
 *   npx tsx scripts/probe-limit-order.ts
 *
 * Proves the full BalanceManager limit-order flow on testnet, signing with the
 * local Sui CLI keypair (direct, not sponsored):
 *   1. create + share a BalanceManager
 *   2. deposit 1 SUI, place a resting ASK well above mid (won't fill)
 *   3. cancel that order
 *
 * A resting ask at $1.50 (mid ≈ $0.91) parks on the book without filling, so
 * this exercises real maker placement + cancellation end to end.
 */
import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

import { SuiJsonRpcClient, getJsonRpcFullnodeUrl } from "@mysten/sui/jsonRpc";
import { Ed25519Keypair } from "@mysten/sui/keypairs/ed25519";
import { Transaction } from "@mysten/sui/transactions";

const PKG = "0x22be4cade64bf2d02412c7e8d0e8beea2f78828b948118d46735315409371a3c";
const POOL = "0x1c19362ca52b8ffd7a33cee805a67d40f31e6ba303753fd3a4cfdfacea7163a5";
const SUI = "0x2::sui::SUI";
const DBUSDC = "0xf7152c05930480cd740d7311b5b8b45c6f488e3a53a11c3f74a6fac36a52e0d7::DBUSDC::DBUSDC";
const BM_TYPE = `${PKG}::balance_manager::BalanceManager`;

function loadKeypair(): Ed25519Keypair {
  const keys = JSON.parse(
    readFileSync(join(homedir(), ".sui", "sui_config", "sui.keystore"), "utf8"),
  ) as string[];
  const decoded = Buffer.from(keys[0], "base64");
  return Ed25519Keypair.fromSecretKey(decoded.subarray(1));
}

async function main() {
  const client = new SuiJsonRpcClient({
    network: "testnet",
    url: getJsonRpcFullnodeUrl("testnet"),
  });
  const kp = loadKeypair();
  const sender = kp.toSuiAddress();
  console.log(`probe sender: ${sender}`);

  // 1. Create + share BalanceManager.
  console.log("\n=== 1. Create + share BalanceManager ===");
  const tx1 = new Transaction();
  const [bm] = tx1.moveCall({ target: `${PKG}::balance_manager::new`, arguments: [] });
  tx1.moveCall({
    target: "0x2::transfer::public_share_object",
    typeArguments: [BM_TYPE],
    arguments: [bm],
  });
  const r1 = await client.signAndExecuteTransaction({
    signer: kp,
    transaction: tx1,
    options: { showObjectChanges: true, showEffects: true },
  });
  const created = (r1.objectChanges ?? []).find(
    (c) => c.type === "created" && "objectType" in c && c.objectType.includes("::BalanceManager"),
  ) as { objectId: string } | undefined;
  const managerId = created?.objectId;
  console.log(`status: ${r1.effects?.status?.status}  managerId: ${managerId}`);
  if (!managerId) throw new Error("could not find created BalanceManager id");
  await client.waitForTransaction({ digest: r1.digest });

  // 2. Deposit 1 SUI + place a resting ASK at $1.50 (above mid → rests).
  console.log("\n=== 2. Deposit 1 SUI + place resting ASK @ $1.50 ===");
  const tx2 = new Transaction();
  tx2.setSender(sender);
  const [depositCoin] = tx2.splitCoins(tx2.gas, [tx2.pure.u64(2_000_000_000n)]); // 2 SUI (covers 1 SUI ask + fee/lock)
  tx2.moveCall({
    target: `${PKG}::balance_manager::deposit`,
    typeArguments: [SUI],
    arguments: [tx2.object(managerId), depositCoin],
  });
  const [proof2] = tx2.moveCall({
    target: `${PKG}::balance_manager::generate_proof_as_owner`,
    arguments: [tx2.object(managerId)],
  });
  tx2.moveCall({
    target: `${PKG}::pool::place_limit_order`,
    typeArguments: [SUI, DBUSDC],
    arguments: [
      tx2.object(POOL),
      tx2.object(managerId),
      proof2,
      tx2.pure.u64(1), // client_order_id
      tx2.pure.u8(0), // order_type: no restriction
      tx2.pure.u8(0), // self_matching: allowed
      tx2.pure.u64(1_500_000n), // price: $1.50 (quote micros per SUI)
      tx2.pure.u64(1_000_000_000n), // quantity: 1 SUI
      tx2.pure.bool(false), // is_bid=false → ASK
      tx2.pure.bool(false), // pay_with_deep=false
      tx2.pure.u64(4_102_444_800_000n), // expire ~year 2100
      tx2.object("0x6"),
    ],
  });
  const r2 = await client.signAndExecuteTransaction({
    signer: kp,
    transaction: tx2,
    options: { showEffects: true, showEvents: true },
  });
  console.log(`status: ${r2.effects?.status?.status}  error: ${r2.effects?.status?.error ?? "none"}`);
  const placed = (r2.events ?? []).find((e) => e.type.includes("OrderPlaced"));
  const orderId = placed
    ? ((placed.parsedJson as { order_id?: string }).order_id ?? null)
    : null;
  console.log(`OrderPlaced event: ${placed ? "✅" : "❌"}  order_id: ${orderId}`);
  if (placed) console.log(JSON.stringify(placed.parsedJson, null, 2));
  if (!orderId) throw new Error("no order_id from OrderPlaced event");
  await client.waitForTransaction({ digest: r2.digest });

  // 3. Cancel the resting order.
  console.log("\n=== 3. Cancel the resting order ===");
  const tx3 = new Transaction();
  const [proof3] = tx3.moveCall({
    target: `${PKG}::balance_manager::generate_proof_as_owner`,
    arguments: [tx3.object(managerId)],
  });
  tx3.moveCall({
    target: `${PKG}::pool::cancel_order`,
    typeArguments: [SUI, DBUSDC],
    arguments: [tx3.object(POOL), tx3.object(managerId), proof3, tx3.pure.u128(orderId), tx3.object("0x6")],
  });
  const r3 = await client.signAndExecuteTransaction({
    signer: kp,
    transaction: tx3,
    options: { showEffects: true, showEvents: true },
  });
  console.log(`status: ${r3.effects?.status?.status}  error: ${r3.effects?.status?.error ?? "none"}`);
  const canceled = (r3.events ?? []).find((e) => e.type.includes("OrderCanceled"));
  console.log(`OrderCanceled event: ${canceled ? "✅" : "❌"}`);
  console.log(
    r3.effects?.status?.status === "success"
      ? "\n✅ Full maker flow works: create+share → deposit → place → cancel."
      : "\n❌ cancel failed",
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
