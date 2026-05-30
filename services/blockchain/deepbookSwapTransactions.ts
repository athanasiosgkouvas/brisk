import { Transaction } from "@mysten/sui/transactions";

import { DEEPBOOK } from "@/utils/constants";

import { addDbusdcToSuiSwapLeg, addSuiToDbusdcSwapLeg } from "./spotSwapTx";

/**
 * Standalone DeepBook spot swap PTBs — not composed with Predict.
 * Demonstrates real orderbook usage outside of the Smart Bet flow:
 * a small "DeepBook Swap" panel in Settings/Profile lets users move
 * between SUI and DBUSDC in one sponsored tx.
 *
 * Both builders take explicit owner coin ids so the caller (a React hook)
 * can fetch via `suiClient.getCoins` first; this matches the pattern used by
 * predict + earn flows and avoids the SDK's auto-`coinWithBalance` coupling
 * to a known sender (sponsored sender == user, but build resolution doesn't
 * require sender for explicit object inputs).
 */

export function buildSwapSuiToDbusdcTx(input: {
  ownerSuiCoinIds: string[];
  suiAmountMicro: bigint;
  minDbusdcOutMicro: bigint;
  recipient: string;
}): Transaction {
  const tx = new Transaction();
  const primarySui = tx.object(input.ownerSuiCoinIds[0]);
  if (input.ownerSuiCoinIds.length > 1) {
    tx.mergeCoins(
      primarySui,
      input.ownerSuiCoinIds.slice(1).map((id) => tx.object(id)),
    );
  }
  const [suiIn] = tx.splitCoins(primarySui, [tx.pure.u64(input.suiAmountMicro)]);
  const { baseLeftover, quoteOut, deepLeftover } = addSuiToDbusdcSwapLeg(tx, {
    suiCoinHandle: suiIn,
    minQuoteOutMicro: input.minDbusdcOutMicro,
  });
  tx.transferObjects([baseLeftover, quoteOut, deepLeftover], tx.pure.address(input.recipient));
  return tx;
}

export function buildSwapDbusdcToSuiTx(input: {
  ownerDbusdcCoinIds: string[];
  dbusdcAmountMicro: bigint;
  minSuiOutMicro: bigint;
  recipient: string;
}): Transaction {
  const tx = new Transaction();
  const primary = tx.object(input.ownerDbusdcCoinIds[0]);
  if (input.ownerDbusdcCoinIds.length > 1) {
    tx.mergeCoins(
      primary,
      input.ownerDbusdcCoinIds.slice(1).map((id) => tx.object(id)),
    );
  }
  const [dbusdcIn] = tx.splitCoins(primary, [tx.pure.u64(input.dbusdcAmountMicro)]);
  const { baseOut, quoteLeftover, deepLeftover } = addDbusdcToSuiSwapLeg(tx, {
    dbusdcCoinHandle: dbusdcIn,
    minBaseOutMicro: input.minSuiOutMicro,
  });
  tx.transferObjects([baseOut, quoteLeftover, deepLeftover], tx.pure.address(input.recipient));
  // Reference the DEEPBOOK package so unused-imports doesn't pull this away.
  void DEEPBOOK.packageId;
  return tx;
}
