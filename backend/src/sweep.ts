import dotenv from "dotenv";
import { SuiGrpcClient } from "@mysten/sui/grpc";
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

async function accumulatorRootArg(client: SuiGrpcClient) {
  const { object } = await client.getObject({ objectId: ACCUMULATOR_ROOT_ID });
  const owner = object.owner;
  const initialSharedVersion =
    owner?.$kind === "Shared" ? owner.Shared.initialSharedVersion : undefined;
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

type GasRef = { objectId: string; version: string; digest: string };
type SweepResult =
  | { ok: true; digest: string; gas: GasRef }
  | { ok: false; digest: string; gas: GasRef; error: string };

async function sweepOne(
  client: SuiGrpcClient,
  signer: Ed25519Keypair,
  rootArg: ReturnType<typeof Inputs.SharedObjectRef>,
  tillId: string,
  gas: GasRef[],
): Promise<SweepResult> {
  const tx = new Transaction();
  // Pin the gas coin explicitly. The signer has a single gas coin shared by every
  // sweep in the batch; if we let the SDK re-resolve it per tx, a load-balanced RPC
  // that lags one version behind the just-executed tx hands back a stale ref and the
  // tx aborts ("object … unavailable for consumption, current version …+1"). We chain
  // the fresh ref out of each tx's effects instead of re-reading it.
  tx.setGasPayment(gas);
  tx.moveCall({
    target: `${tillPkg}::till::sweep`,
    typeArguments: [usdcType],
    arguments: [tx.object(tillId), tx.object(rootArg)],
  });
  const result = await client.signAndExecuteTransaction({
    transaction: tx,
    signer,
    include: { effects: true },
  });
  // The unified API returns a tagged union; both arms carry the same executed-tx
  // shape (digest + effects). A Move-abort still charges gas and advances the coin,
  // so read the new gas ref and hand it back so the caller advances the chain either
  // way. A genuine pre-execution failure has no gasObject output → we throw below,
  // which the caller treats as "no gas consumed" (keeps the current ref).
  const txn = result.Transaction ?? result.FailedTransaction;
  const g = txn?.effects?.gasObject;
  if (!g?.outputVersion || !g?.outputDigest) {
    throw new Error(`sweep tx ${txn?.digest}: effects missing gasObject output ref`);
  }
  const newGas: GasRef = {
    objectId: g.objectId,
    version: g.outputVersion,
    digest: g.outputDigest,
  };
  const status = txn.effects.status;
  if (status.success !== true) {
    return {
      ok: false,
      digest: txn.digest,
      gas: newGas,
      error: status.error?.message ?? "move abort",
    };
  }
  return { ok: true, digest: txn.digest, gas: newGas };
}

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

// A stale-gas / version-mismatch rejection at the node's pre-execution input check.
// On the load-balanced public fullnode our chained gas ref (V+1) can outrun a replica
// that hasn't yet applied the previous tx, so it sees V and rejects our V+1.
function isStaleGasError(err: unknown): boolean {
  const m = err instanceof Error ? err.message : String(err);
  return /provided version doesn't match|unavailable for consumption|not available for consumption|version mismatch/i.test(
    m,
  );
}

// Re-resolve each pinned gas coin's live ref from the node — after a short backoff a
// lagging replica has usually caught up, so this recovers the correct current version.
// Preserves the same coin set we seeded with.
async function currentGasRefs(client: SuiGrpcClient, refs: GasRef[]): Promise<GasRef[]> {
  return Promise.all(
    refs.map(async (r) => {
      const { object } = await client.getObject({ objectId: r.objectId });
      return { objectId: object.objectId, version: object.version, digest: object.digest };
    }),
  );
}

const MAX_GAS_RETRIES = 3;

// Chain-forward is correct as long as the next submit lands on a node that has applied
// the previous tx. When it doesn't (LB replica lag → stale-gas throw), re-read the live
// gas ref and retry with backoff so the batch self-heals instead of cascading failures.
async function sweepOneWithRetry(
  client: SuiGrpcClient,
  signer: Ed25519Keypair,
  rootArg: ReturnType<typeof Inputs.SharedObjectRef>,
  tillId: string,
  gas: GasRef[],
): Promise<SweepResult> {
  let current = gas;
  for (let attempt = 0; ; attempt += 1) {
    try {
      return await sweepOne(client, signer, rootArg, tillId, current);
    } catch (error) {
      if (attempt >= MAX_GAS_RETRIES || !isStaleGasError(error)) throw error;
      await sleep(300 * (attempt + 1));
      current = await currentGasRefs(client, current);
    }
  }
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

  // Standard, supported transport (JSON-RPC is deprecated / being deactivated). The
  // gRPC(-web) endpoint has no per-network default, so SUI_RPC_URL is the baseUrl with
  // a public-fullnode fallback; point it at a keyed provider for the daily batch.
  const baseUrl = process.env.SUI_RPC_URL ?? "https://fullnode.testnet.sui.io:443";
  const client = new SuiGrpcClient({ network, baseUrl });
  const signer = loadSigner();
  const signerAddr = signer.toSuiAddress();
  const rootArg = await accumulatorRootArg(client);

  const tills = await tillStore.listActiveTills();
  console.log(`[sweep] ${tills.length} active till(s); signer ${signerAddr} (network ${network})`);

  // Seed the gas coin(s) once; sweepOne chains the updated ref forward per success so
  // we never re-read the (possibly lagging) coin version from the RPC mid-batch.
  const { objects: coins } = await client.listCoins({
    owner: signerAddr,
    coinType: "0x2::sui::SUI",
  });
  if (coins.length === 0) {
    throw new Error(`signer ${signerAddr} has no SUI gas coin — fund it before sweeping`);
  }
  let gas: GasRef[] = coins.map((c) => ({
    objectId: c.objectId,
    version: c.version,
    digest: c.digest,
  }));

  let swept = 0;
  let failed = 0;
  for (const till of tills) {
    try {
      // sweep is a no-op on-chain when the till is empty, so an empty till just
      // costs a tiny gas + returns success — fine for a daily batch.
      const res = await sweepOneWithRetry(client, signer, rootArg, till.tillId, gas);
      // The tx executed, so the coin advanced — chain the new ref forward whether the
      // sweep succeeded or Move-aborted, else the next till trips the stale-gas error.
      gas = [res.gas];
      if (res.ok) {
        await tillStore.markSwept(till.tillId);
        swept += 1;
        console.log(`[sweep] ${till.tillId} → ${till.treasuryAddr} (${res.digest})`);
      } else {
        failed += 1;
        console.error(`[sweep] ${till.tillId} failed (${res.digest}): ${res.error}`);
      }
      // Wait for the just-executed tx to be applied before the next submit, so the
      // chained gas ref (V+1) isn't ahead of a lagging replica. Best-effort: a slow
      // poll shouldn't fail the till we already executed.
      await client.waitForTransaction({ digest: res.digest }).catch(() => {});
    } catch (error: unknown) {
      // Thrown = pre-execution error (network / input-object check); no gas consumed,
      // so keep the current ref for the next till.
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
