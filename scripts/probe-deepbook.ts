/**
 * Day 0 probe — discovers what's actually live on Sui testnet for the
 * Fathom × DeepBook composability story. Run once before writing Plan A.
 *
 *   npx tsx scripts/probe-deepbook.ts
 *
 * Outputs:
 *   - which DeepBook Spot pools exist
 *   - which Margin pools exist
 *   - Predict's `accepted_quotes` (DUSDC, DBUSDC, ...?) — drives whether
 *     SUI→DBUSDC→predict::mint composes natively or needs a wrapper
 *   - a synthetic 1 SUI → DBUSDC swap quote
 */
import { SuiJsonRpcClient, getJsonRpcFullnodeUrl } from "@mysten/sui/jsonRpc";
import { Transaction } from "@mysten/sui/transactions";
import {
  testnetCoins,
  testnetMarginPools,
  testnetPackageIds,
  testnetPools,
} from "@mysten/deepbook-v3";

const PREDICT_PKG = "0xf5ea2b3749c65d6e56507cc35388719aadb28f9cab873696a2f8687f5c785138";
const PREDICT_OBJ = "0xc8736204d12f0a7277c86388a68bf8a194b0a14c5538ad13f22cbd8e2a38028a";
const PREDICT_DUSDC =
  "0xe95040085976bfd54a1a07225cd46c8a2b4e8e2b6732f140a0fc49850ba73e1a::dusdc::DUSDC";

const log = (label: string, value: unknown) => {
  console.log(`\n=== ${label} ===`);
  console.log(typeof value === "string" ? value : JSON.stringify(value, null, 2));
};

async function main() {
  const client = new SuiJsonRpcClient({
    network: "testnet",
    url: getJsonRpcFullnodeUrl("testnet"),
  });

  log("DeepBook packages (testnet)", testnetPackageIds);
  log("DeepBook Spot pools (testnet)", testnetPools);
  log("DeepBook coins (testnet)", testnetCoins);
  log("DeepBook Margin pools (testnet)", testnetMarginPools);

  log("Predict's canonical dUSDC vs DeepBook's DBUSDC", {
    predict_dusdc: PREDICT_DUSDC,
    deepbook_dbusdc: testnetCoins.DBUSDC?.type,
    same: PREDICT_DUSDC === testnetCoins.DBUSDC?.type,
  });

  // Inspect the Predict shared object to learn what quote types it accepts.
  const predictObj = await client.getObject({
    id: PREDICT_OBJ,
    options: { showContent: true, showType: true },
  });
  const fields =
    (predictObj.data?.content as { fields?: Record<string, unknown> } | undefined)?.fields ?? {};
  log("Predict object top-level fields", Object.keys(fields));
  const acceptedQuotes = (fields as { accepted_quotes?: unknown }).accepted_quotes;
  log("Predict.accepted_quotes (raw)", acceptedQuotes);

  // Devinspect a one-SUI swap on the SUI/DBUSDC pool: gives us realistic
  // quote and confirms the pool is liquid enough to demo.
  const sui = testnetCoins.SUI;
  const dbusdc = testnetCoins.DBUSDC;
  const pool = testnetPools.SUI_DBUSDC;
  if (!sui || !dbusdc || !pool) {
    log("Missing SUI/DBUSDC pool — aborting quote probe", { sui, dbusdc, pool });
    return;
  }

  const tx = new Transaction();
  tx.moveCall({
    target: `${testnetPackageIds.DEEPBOOK_PACKAGE_ID}::pool::get_quote_quantity_out`,
    typeArguments: [sui.type, dbusdc.type],
    arguments: [tx.object(pool.address), tx.pure.u64(1_000_000_000), tx.object("0x6")],
  });
  try {
    const inspect = await client.devInspectTransactionBlock({
      transactionBlock: tx,
      sender: "0x0000000000000000000000000000000000000000000000000000000000000000",
    });
    const ret = inspect.results?.[0]?.returnValues;
    log("SUI/DBUSDC pool get_quote_quantity_out(1 SUI)", {
      effects: inspect.effects?.status,
      returnValues: ret,
    });
  } catch (err) {
    log("Quote probe failed", String(err));
  }

  // Also check predict::available_withdrawal — used by Plan G1 (withdrawal pre-check).
  const tx2 = new Transaction();
  tx2.moveCall({
    target: `${PREDICT_PKG}::predict::available_withdrawal`,
    arguments: [tx2.object(PREDICT_OBJ), tx2.object("0x6")],
  });
  try {
    const inspect2 = await client.devInspectTransactionBlock({
      transactionBlock: tx2,
      sender: "0x0000000000000000000000000000000000000000000000000000000000000000",
    });
    const ret = inspect2.results?.[0]?.returnValues;
    log("predict::available_withdrawal()", {
      effects: inspect2.effects?.status,
      returnValues: ret,
    });
  } catch (err) {
    log("available_withdrawal probe failed", String(err));
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
