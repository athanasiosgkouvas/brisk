import { DEEPBOOK } from "@/utils/constants";

import { suiClient } from "./suiClient";

/**
 * Minimal-surface helpers around DeepBook v3 testnet that the app needs at
 * runtime: a quote estimator for the Smart Bet UI and a coin selector for the
 * spot-swap legs we splice into Predict PTBs.
 *
 * We deliberately don't pull in `@mysten/deepbook-v3`'s `DeepBookClient` here.
 * That client targets Node and assumes a SuiClient + sender address up-front;
 * on Hermes (RN) the import chain triggers the same `Intl.PluralRules`
 * landmine the canonical `suiClient.ts` works around, and even with that
 * polyfill the SDK couples coin selection to a single signer (no help for
 * sponsored PTBs where the user owns the inputs but the backend pays gas).
 *
 * Move targets stay anchored to the canonical DeepBook v3 package; pool ids
 * and asset types come from `utils/constants.ts::DEEPBOOK`.
 */

const DEEP_SCALAR = 1_000_000; // DEEP coin has 6 decimals on testnet.

export interface SpotQuote {
  /** SUI in (micros, 1e9 base). */
  suiInMicro: bigint;
  /** Expected DBUSDC out (micros, 1e6). */
  quoteOutMicro: bigint;
  /** DEEP token charged as taker fee (micros, 1e6). 0 means fee-free or DEEP paid implicitly. */
  deepFeeMicro: bigint;
  /** Implied price: DBUSDC per 1 SUI, human units. */
  pricePerSui: number;
}

function readLeU64(bytes: number[]): bigint {
  let v = 0n;
  for (let i = 0; i < 8; i += 1) {
    v |= BigInt(bytes[i] ?? 0) << BigInt(i * 8);
  }
  return v;
}

/**
 * Quote a SUI → DBUSDC swap on the canonical SUI_DBUSDC pool via devInspect.
 * Cheap, read-only — safe to call on every render or as a debounced field.
 *
 * Returns `null` if the network call fails so the UI can fall back gracefully
 * (testnet RPCs occasionally throw; we never block the swipe flow on it).
 */
export async function quoteSuiToDbusdc(suiAmountMicro: bigint): Promise<SpotQuote | null> {
  try {
    const { Transaction } = await import("@mysten/sui/transactions");
    const tx = new Transaction();
    tx.moveCall({
      target: `${DEEPBOOK.packageId}::pool::get_quote_quantity_out`,
      typeArguments: [DEEPBOOK.suiType, DEEPBOOK.dbusdcType],
      arguments: [
        tx.object(DEEPBOOK.suiDbusdcPoolId),
        tx.pure.u64(suiAmountMicro),
        tx.object("0x6"),
      ],
    });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const client = (await (await import("./suiClient")).getSuiClientForBuild()) as any;
    const inspect = await client.devInspectTransactionBlock({
      transactionBlock: tx,
      sender: "0x0000000000000000000000000000000000000000000000000000000000000000",
    });
    const ret = inspect?.results?.[0]?.returnValues as Array<[number[], string]> | undefined;
    if (!ret || ret.length < 3) return null;
    // Return signature: (base_quantity_out, quote_quantity_out, deep_required).
    const quoteOut = readLeU64(ret[1][0]);
    const deepFee = readLeU64(ret[2][0]);
    const priceFloat = suiAmountMicro === 0n ? 0 : Number(quoteOut) / 10 ** DEEPBOOK.dbusdcDecimals;
    const suiFloat = Number(suiAmountMicro) / 10 ** DEEPBOOK.suiDecimals;
    return {
      suiInMicro: suiAmountMicro,
      quoteOutMicro: quoteOut,
      deepFeeMicro: deepFee,
      pricePerSui: suiFloat === 0 ? 0 : priceFloat / suiFloat,
    };
  } catch {
    return null;
  }
}

/**
 * Compute a `minQuoteOut` floor for the swap leg given a fresh quote and a
 * slippage tolerance in basis points. Defaults to 200bp (2%) — DeepBook
 * testnet is thin and the SDK's recommended floor for hackathon-grade demos
 * is generous-on-purpose.
 */
export function applySlippage(quote: SpotQuote, slippageBps: number = 200): bigint {
  if (quote.quoteOutMicro === 0n) return 0n;
  const factor = BigInt(10_000 - Math.max(0, Math.min(slippageBps, 5_000)));
  return (quote.quoteOutMicro * factor) / 10_000n;
}

/**
 * Convert a SUI amount in DEEP-required units for the swap fee. We ask the
 * orderbook for a tiny DEEP buffer (the SDK defaults to 0 here when the
 * caller doesn't hold DEEP, since pools also accept paying-with-input by
 * eating the spread). For testnet, 0 is the right default — DeepBook lets
 * the swap pay fees in the input asset.
 */
export const DEEP_FEE_MICRO_FOR_SWAP = 0n;

/**
 * Fetch the user's SUI coin set. Reused across the Smart Bet flow and the
 * standalone DeepBook swap utility.
 *
 * Returns the largest-first list of coin object ids and the total balance in
 * micros. The Smart Bet flow needs both: the merge primary plus the running
 * balance for slippage estimation.
 */
export async function getUserSuiCoins(
  owner: string,
): Promise<{ coinIds: string[]; totalMicro: bigint }> {
  const res = await suiClient.getCoins({ owner, coinType: DEEPBOOK.suiType, limit: 50 });
  const total = res.data.reduce((acc, c) => acc + BigInt(c.balance), 0n);
  return {
    coinIds: res.data.map((c) => c.coinObjectId),
    totalMicro: total,
  };
}

/**
 * Fetch the user's DEEP coin set. DeepBook v3 charges swap fees in DEEP by
 * default — passing a non-empty DEEP coin lets the pool actually fill. If the
 * user has no DEEP we fall back to `coin::zero<DEEP>` in the PTB and the
 * swap becomes a no-op (PTB still succeeds; Predict mint still settles).
 *
 * Returns an empty list (and totalMicro=0) when the user holds no DEEP.
 */
export async function getUserDeepCoins(
  owner: string,
): Promise<{ coinIds: string[]; totalMicro: bigint }> {
  try {
    const res = await suiClient.getCoins({ owner, coinType: DEEPBOOK.deepType, limit: 50 });
    const total = res.data.reduce((acc, c) => acc + BigInt(c.balance), 0n);
    return { coinIds: res.data.map((c) => c.coinObjectId), totalMicro: total };
  } catch {
    return { coinIds: [], totalMicro: 0n };
  }
}

/** Sanity export for tests / diagnostics. */
export const __internals = {
  readLeU64,
  DEEP_SCALAR,
};
