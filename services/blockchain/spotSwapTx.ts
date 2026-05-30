import type { Transaction, TransactionObjectArgument } from "@mysten/sui/transactions";

import { CLOCK_OBJECT_ID, DEEPBOOK } from "@/utils/constants";

/**
 * Append a `deepbook::pool::swap_exact_base_for_quote<SUI, DBUSDC>` leg to an
 * in-flight PTB and return PTB handles for (baseLeftover, quoteOut, deepLeftover).
 *
 * The caller owns:
 *   - merging / splitting the user's SUI inputs to produce `suiCoinHandle`;
 *   - figuring out where `quoteOut` (DBUSDC) goes (transfer to user, hand to
 *     another module, etc.). We don't transfer here so the helper composes
 *     with the Smart Bet and standalone-swap callers identically.
 *
 * DEEP fee:
 *   testnet pools accept paying the maker fee in the input asset when the
 *   `deep_coin` is empty — we mint a `0x2::coin::zero<DEEP>` PTB handle to
 *   satisfy the Move signature without requiring the user to hold DEEP.
 */
export function addSuiToDbusdcSwapLeg(
  tx: Transaction,
  input: {
    suiCoinHandle: TransactionObjectArgument;
    /**
     * DEEP coin handle to pay the fill fee with. Pass a real Coin<DEEP> from
     * the user's wallet for actual fills; omit to get a `coin::zero<DEEP>`
     * fallback (swap becomes a no-op when the pool requires DEEP fees, but
     * the surrounding PTB still succeeds).
     */
    deepCoinHandle?: TransactionObjectArgument;
    minQuoteOutMicro: bigint;
  },
): {
  baseLeftover: TransactionObjectArgument;
  quoteOut: TransactionObjectArgument;
  deepLeftover: TransactionObjectArgument;
} {
  let deepArg = input.deepCoinHandle;
  if (!deepArg) {
    const [empty] = tx.moveCall({
      target: `0x0000000000000000000000000000000000000000000000000000000000000002::coin::zero`,
      typeArguments: [DEEPBOOK.deepType],
      arguments: [],
    });
    deepArg = empty;
  }

  const [baseLeftover, quoteOut, deepLeftover] = tx.moveCall({
    target: `${DEEPBOOK.packageId}::pool::swap_exact_base_for_quote`,
    typeArguments: [DEEPBOOK.suiType, DEEPBOOK.quoteType],
    arguments: [
      tx.object(DEEPBOOK.suiQuotePoolId),
      input.suiCoinHandle,
      deepArg,
      tx.pure.u64(input.minQuoteOutMicro),
      tx.object(CLOCK_OBJECT_ID),
    ],
  });

  return { baseLeftover, quoteOut, deepLeftover };
}

/**
 * Append a `deepbook::pool::swap_exact_quote_for_base<SUI, DBUSDC>` leg —
 * inverse of the above, used by the standalone DeepBook swap utility when
 * the user wants DBUSDC → SUI.
 */
export function addDbusdcToSuiSwapLeg(
  tx: Transaction,
  input: {
    dbusdcCoinHandle: TransactionObjectArgument;
    deepCoinHandle?: TransactionObjectArgument;
    minBaseOutMicro: bigint;
  },
): {
  baseOut: TransactionObjectArgument;
  quoteLeftover: TransactionObjectArgument;
  deepLeftover: TransactionObjectArgument;
} {
  let deepArg = input.deepCoinHandle;
  if (!deepArg) {
    const [empty] = tx.moveCall({
      target: `0x0000000000000000000000000000000000000000000000000000000000000002::coin::zero`,
      typeArguments: [DEEPBOOK.deepType],
      arguments: [],
    });
    deepArg = empty;
  }

  const [baseOut, quoteLeftover, deepLeftover] = tx.moveCall({
    target: `${DEEPBOOK.packageId}::pool::swap_exact_quote_for_base`,
    typeArguments: [DEEPBOOK.suiType, DEEPBOOK.quoteType],
    arguments: [
      tx.object(DEEPBOOK.suiQuotePoolId),
      input.dbusdcCoinHandle,
      deepArg,
      tx.pure.u64(input.minBaseOutMicro),
      tx.object(CLOCK_OBJECT_ID),
    ],
  });

  return { baseOut, quoteLeftover, deepLeftover };
}
