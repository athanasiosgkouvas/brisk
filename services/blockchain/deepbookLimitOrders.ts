import { Transaction } from "@mysten/sui/transactions";

import { CLOCK_OBJECT_ID, DEEPBOOK } from "@/utils/constants";

/**
 * Hand-rolled PTB builders for genuine DeepBook v3 maker orders via a
 * `BalanceManager` — real CLOB participation (resting limit orders), not just
 * market-taking swaps. We avoid `@mysten/deepbook-v3`'s `DeepBookClient` for
 * the same RN/Hermes + sponsored-PTB reasons documented in deepbookClient.ts.
 *
 * Flow (two sponsored txs, because a shared object can't be used later in the
 * same PTB that creates it):
 *   1. buildCreateBalanceManagerTx → `balance_manager::new` + share. Read the
 *      shared id from objectChanges and persist it (authStore.deepbookManagerId).
 *   2. buildDepositAndPlaceLimitOrderTx → deposit funds, prove ownership, rest
 *      a limit order on the SUI/DBUSDC book.
 *   buildCancelLimitOrderTx cancels by order id.
 *
 * Price scale: DeepBook's price is quote-micros per 1 whole base (e.g. SUI at
 * $0.912 → 912000). Quantity is in base micros (SUI = 1e9). Both verified
 * against the live SUI/DBUSDC pool.
 */

// DeepBook order_type / self_matching enum values (0 = standard).
const ORDER_TYPE_NO_RESTRICTION = 0;
const SELF_MATCHING_ALLOWED = 0;

/** `balance_manager::new` then share it so the owner can use it across txs. */
export function buildCreateBalanceManagerTx(): Transaction {
  const tx = new Transaction();
  const [manager] = tx.moveCall({
    target: `${DEEPBOOK.packageId}::balance_manager::new`,
    arguments: [],
  });
  tx.moveCall({
    target: `0x0000000000000000000000000000000000000000000000000000000000000002::transfer::public_share_object`,
    typeArguments: [`${DEEPBOOK.packageId}::balance_manager::BalanceManager`],
    arguments: [manager],
  });
  return tx;
}

/**
 * Deposit `amountMicro` of `coinType` into the BalanceManager, then rest a
 * limit order on the SUI/DBUSDC pool. Deposit + prove + place share one tx
 * (all reference the same shared manager mutably).
 *
 * For a resting BID (buy SUI) deposit DBUSDC; for an ASK (sell SUI) deposit
 * SUI. `priceMicro` is quote-micros per 1 SUI; `quantityBaseMicro` is SUI
 * micros (≥ ~1e9 to clear the book's min size).
 */
export function buildDepositAndPlaceLimitOrderTx(input: {
  managerId: string;
  /** Coin type being deposited (SUI for an ask, DBUSDC for a bid). */
  depositCoinType: string;
  /** Primary coin is [0]; the rest are merged into it before splitting. */
  depositCoinIds: string[];
  depositAmountMicro: bigint;
  clientOrderId: number;
  priceMicro: bigint;
  quantityBaseMicro: bigint;
  isBid: boolean;
  /** Far-future ms timestamp after which the order auto-expires. */
  expireTimestampMs: bigint;
}): Transaction {
  const tx = new Transaction();

  const primary = tx.object(input.depositCoinIds[0]);
  if (input.depositCoinIds.length > 1) {
    tx.mergeCoins(
      primary,
      input.depositCoinIds.slice(1).map((id) => tx.object(id)),
    );
  }
  const [depositCoin] = tx.splitCoins(primary, [tx.pure.u64(input.depositAmountMicro)]);
  tx.moveCall({
    target: `${DEEPBOOK.packageId}::balance_manager::deposit`,
    typeArguments: [input.depositCoinType],
    arguments: [tx.object(input.managerId), depositCoin],
  });

  const [proof] = tx.moveCall({
    target: `${DEEPBOOK.packageId}::balance_manager::generate_proof_as_owner`,
    arguments: [tx.object(input.managerId)],
  });

  tx.moveCall({
    target: `${DEEPBOOK.packageId}::pool::place_limit_order`,
    typeArguments: [DEEPBOOK.suiType, DEEPBOOK.quoteType],
    arguments: [
      tx.object(DEEPBOOK.suiQuotePoolId),
      tx.object(input.managerId),
      proof,
      tx.pure.u64(input.clientOrderId),
      tx.pure.u8(ORDER_TYPE_NO_RESTRICTION),
      tx.pure.u8(SELF_MATCHING_ALLOWED),
      tx.pure.u64(input.priceMicro),
      tx.pure.u64(input.quantityBaseMicro),
      tx.pure.bool(input.isBid),
      tx.pure.bool(false), // pay_with_deep=false → fees in settled asset, no DEEP needed to rest
      tx.pure.u64(input.expireTimestampMs),
      tx.object(CLOCK_OBJECT_ID),
    ],
  });

  return tx;
}

/** Cancel a resting order by its u128 order id. */
export function buildCancelLimitOrderTx(input: { managerId: string; orderId: string }): Transaction {
  const tx = new Transaction();
  const [proof] = tx.moveCall({
    target: `${DEEPBOOK.packageId}::balance_manager::generate_proof_as_owner`,
    arguments: [tx.object(input.managerId)],
  });
  tx.moveCall({
    target: `${DEEPBOOK.packageId}::pool::cancel_order`,
    typeArguments: [DEEPBOOK.suiType, DEEPBOOK.quoteType],
    arguments: [
      tx.object(DEEPBOOK.suiQuotePoolId),
      tx.object(input.managerId),
      proof,
      tx.pure.u128(input.orderId),
      tx.object(CLOCK_OBJECT_ID),
    ],
  });
  return tx;
}

export const DEEPBOOK_LIMIT_ORDER_TARGETS = {
  createBalanceManager: [
    `${DEEPBOOK.packageId}::balance_manager::new`,
    `0x0000000000000000000000000000000000000000000000000000000000000002::transfer::public_share_object`,
  ],
  placeLimitOrder: [
    `${DEEPBOOK.packageId}::balance_manager::deposit`,
    `${DEEPBOOK.packageId}::balance_manager::generate_proof_as_owner`,
    `${DEEPBOOK.packageId}::pool::place_limit_order`,
  ],
  cancelOrder: [
    `${DEEPBOOK.packageId}::balance_manager::generate_proof_as_owner`,
    `${DEEPBOOK.packageId}::pool::cancel_order`,
  ],
} as const;
