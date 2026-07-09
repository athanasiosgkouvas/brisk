import dotenv from "dotenv";
import { SuiJsonRpcClient, getJsonRpcFullnodeUrl } from "@mysten/sui/jsonRpc";
import { Ed25519Keypair } from "@mysten/sui/keypairs/ed25519";
import { Transaction, Inputs } from "@mysten/sui/transactions";
import { normalizeSuiObjectId } from "@mysten/sui/utils";

import * as tillStore from "./services/tillStore.js";
import { isDbConfigured } from "./db.js";

// Daily sweep cron (Render `type: cron` — see render.yaml). Lists every active
// till and sweeps its accumulated USDC to the recorded treasury. `till::sweep`
// is PERMISSIONLESS and the destination is read on-chain (never an argument), so
// this runs with the backend's OWN keypair paying its OWN gas — no merchant
// signature, no Enoki sponsorship quota. Runs once per invocation and exits.

dotenv.config();

const network = (process.env.SUI_NETWORK ?? "testnet") as "mainnet" | "testnet" | "devnet";
const tillPkg = process.env.BRISK_TILL_PKG ?? process.env.BRISK_PACKAGE_ID ?? "";
const usdcType =
  process.env.USDC_TYPE ??
  "0xa1ec7fc00a6f40db9693ad1415d0c193ad3906494428cf252621037bd7117e29::usdc::USDC";
// The on-chain funds accumulator root (well-known system shared object @0xacc).
const ACCUMULATOR_ROOT_ID = normalizeSuiObjectId("0xacc");

async function accumulatorRootArg(client: SuiJsonRpcClient) {
  const obj = await client.getObject({ id: ACCUMULATOR_ROOT_ID, options: { showOwner: true } });
  const owner = obj.data?.owner;
  const initialSharedVersion =
    owner && typeof owner === "object" && "Shared" in owner
      ? owner.Shared.initial_shared_version
      : undefined;
  if (initialSharedVersion === undefined) {
    throw new Error("AccumulatorRoot @0xacc is not a shared object on this network");
  }
  // Immutable shared reference — sweep only reads it (settled_funds_value), so
  // marking it immutable keeps sweeps from serializing on the global root.
  return Inputs.SharedObjectRef({
    objectId: ACCUMULATOR_ROOT_ID,
    initialSharedVersion,
    mutable: false,
  });
}

function loadSigner(): Ed25519Keypair {
  const key = process.env.SWEEP_SIGNER_KEY;
  if (!key) throw new Error("SWEEP_SIGNER_KEY is unset");
  // Accepts a bech32 `suiprivkey1…` secret key (the `sui keytool` export format).
  return Ed25519Keypair.fromSecretKey(key.trim());
}

async function sweepOne(
  client: SuiJsonRpcClient,
  signer: Ed25519Keypair,
  rootArg: ReturnType<typeof Inputs.SharedObjectRef>,
  tillId: string,
): Promise<string> {
  const tx = new Transaction();
  tx.moveCall({
    target: `${tillPkg}::till::sweep`,
    typeArguments: [usdcType],
    arguments: [tx.object(tillId), tx.object(rootArg)],
  });
  const result = await client.signAndExecuteTransaction({
    transaction: tx,
    signer,
    options: { showEffects: true },
  });
  const status = result.effects?.status?.status;
  if (status !== "success") {
    throw new Error(`sweep tx ${result.digest} failed: ${result.effects?.status?.error ?? status}`);
  }
  return result.digest;
}

async function main(): Promise<void> {
  if (!isDbConfigured()) {
    console.warn("[sweep] DATABASE_URL unset — nothing to sweep. Exiting.");
    return;
  }
  if (!tillPkg) {
    console.error("[sweep] BRISK_TILL_PKG unset — cannot resolve till::sweep target. Exiting.");
    process.exitCode = 1;
    return;
  }

  // Mysten disabled JSON-RPC on the public testnet fullnode (getJsonRpcFullnodeUrl's
  // default now 404s), so allow an explicit endpoint override. Point SUI_RPC_URL at a
  // provider that still serves JSON-RPC (ideally a keyed one).
  const rpcUrl = process.env.SUI_RPC_URL ?? getJsonRpcFullnodeUrl(network);
  const client = new SuiJsonRpcClient({ network, url: rpcUrl });
  const signer = loadSigner();
  const signerAddr = signer.toSuiAddress();
  const rootArg = await accumulatorRootArg(client);

  const tills = await tillStore.listActiveTills();
  console.log(`[sweep] ${tills.length} active till(s); signer ${signerAddr} (network ${network})`);

  let swept = 0;
  let failed = 0;
  for (const till of tills) {
    try {
      // sweep is a no-op on-chain when the till is empty, so an empty till just
      // costs a tiny gas + returns success — fine for a daily batch.
      const digest = await sweepOne(client, signer, rootArg, till.tillId);
      await tillStore.markSwept(till.tillId);
      swept += 1;
      console.log(`[sweep] ${till.tillId} → ${till.treasuryAddr} (${digest})`);
    } catch (error: unknown) {
      failed += 1;
      console.error(
        `[sweep] ${till.tillId} failed:`,
        error instanceof Error ? error.message : error,
      );
    }
  }
  console.log(`[sweep] done — ${swept} swept, ${failed} failed`);
}

main()
  .catch((e) => {
    console.error("[sweep] fatal", e);
    process.exitCode = 1;
  })
  .finally(() => {
    // Cron job: exit promptly so the runner doesn't linger on the pg pool.
    setTimeout(() => process.exit(process.exitCode ?? 0), 500);
  });
