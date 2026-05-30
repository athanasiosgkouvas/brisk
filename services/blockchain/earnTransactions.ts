import { Transaction } from "@mysten/sui/transactions";

import { CLOCK_OBJECT_ID, ENV, PLP_TYPE } from "@/utils/constants";

const QUOTE_DECIMALS = 1_000_000;

/**
 * Build a `predict::supply<Quote>` PTB: split exactly `depositAmount` dUSDC
 * out of the caller's coins, hand it to the vault, take back the resulting
 * `Coin<PLP>` and transfer to the caller.
 *
 * Mirrors the coin-merge/split pattern in `predictTransactions.ts` so a user
 * with many small fragments still hits the exact amount in one tx.
 */
export function buildEarnDepositTx(input: {
  /** Primary coin is [0]; any additional coins are merged into it before splitting. */
  ownerDusdcCoinIds: string[];
  /** dUSDC amount the user wants to deposit, human units (e.g. 5 → 5 dUSDC). */
  depositAmount: number;
  recipient: string;
}): Transaction {
  const tx = new Transaction();
  const amountMicro = Math.floor(input.depositAmount * QUOTE_DECIMALS);

  const primaryCoin = tx.object(input.ownerDusdcCoinIds[0]);
  if (input.ownerDusdcCoinIds.length > 1) {
    tx.mergeCoins(
      primaryCoin,
      input.ownerDusdcCoinIds.slice(1).map((id) => tx.object(id)),
    );
  }

  const [depositCoin] = tx.splitCoins(primaryCoin, [tx.pure.u64(amountMicro)]);

  const [plpCoin] = tx.moveCall({
    target: `${ENV.predictPackageId}::predict::supply`,
    typeArguments: [ENV.dusdcType],
    arguments: [tx.object(ENV.predictObjectId), depositCoin, tx.object(CLOCK_OBJECT_ID)],
  });

  tx.transferObjects([plpCoin], tx.pure.address(input.recipient));
  return tx;
}

/**
 * Build a `predict::withdraw<Quote>` PTB: split exactly `plpAmount` PLP out
 * of the caller's coins, hand to vault, take back `Coin<dUSDC>` and transfer.
 *
 * `plpAmount` is in PLP's smallest units (PLP has 6 decimals per the
 * `plp.move` config). For a user-facing number `5.0` PLP pass `5_000_000`.
 */
export function buildEarnWithdrawTx(input: {
  ownerPlpCoinIds: string[];
  plpAmountMicro: number;
  recipient: string;
}): Transaction {
  const tx = new Transaction();

  const primaryCoin = tx.object(input.ownerPlpCoinIds[0]);
  if (input.ownerPlpCoinIds.length > 1) {
    tx.mergeCoins(
      primaryCoin,
      input.ownerPlpCoinIds.slice(1).map((id) => tx.object(id)),
    );
  }

  const [plpCoin] = tx.splitCoins(primaryCoin, [tx.pure.u64(input.plpAmountMicro)]);

  const [quoteCoin] = tx.moveCall({
    target: `${ENV.predictPackageId}::predict::withdraw`,
    typeArguments: [ENV.dusdcType],
    arguments: [tx.object(ENV.predictObjectId), plpCoin, tx.object(CLOCK_OBJECT_ID)],
  });

  tx.transferObjects([quoteCoin], tx.pure.address(input.recipient));
  return tx;
}

export const EARN_TYPES = {
  plp: PLP_TYPE,
  quote: ENV.dusdcType,
} as const;
