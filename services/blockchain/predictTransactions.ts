import { Transaction, type TransactionObjectArgument } from "@mysten/sui/transactions";
import { toBase64 } from "@mysten/sui/utils";

import { CLOCK_OBJECT_ID, DEEPBOOK, ENV, FATHOM_REVENUE } from "@/utils/constants";

import { addSuiToDbusdcSwapLeg } from "./spotSwapTx";

const PRICE_DECIMALS = 1_000_000;
const STRIKE_SCALE = 1_000_000_000;
const MAX_SCALED_STRIKE = Number.MAX_SAFE_INTEGER - 1;

/**
 * Scale a human-readable strike price (e.g. 67250.5 USD) into the on-chain
 * 1e9 fixed-point representation used by `predict::mint` / `mint_range`
 * and the payout lookup endpoints. Rejects NaN, Infinity, and values that
 * would exceed JS's safe integer range — silent overflow there has
 * happened in other projects and is a long-tail support nightmare to
 * diagnose.
 */
export function safeScaleStrike(price: number): number {
  if (!Number.isFinite(price)) {
    throw new Error(`Invalid strike price: ${String(price)}`);
  }
  if (price < 0) {
    throw new Error(`Strike price cannot be negative (got ${price})`);
  }
  const scaled = Math.floor(price * STRIKE_SCALE);
  if (scaled > MAX_SCALED_STRIKE) {
    throw new Error(
      `Strike price ${price} exceeds the supported range (max ~${MAX_SCALED_STRIKE / STRIKE_SCALE}).`,
    );
  }
  return scaled;
}

export function buildCreateManagerTx(): Transaction {
  const tx = new Transaction();
  tx.moveCall({
    target: `${ENV.predictPackageId}::predict::create_manager`,
    arguments: [],
  });
  return tx;
}

export function buildMintPredictionTx(input: {
  managerId: string;
  oracleId: string;
  expiryTimestamp: number;
  strikePrice: number;
  isYes: boolean;
  /** Primary coin is [0]; any additional coins are merged into it before splitting. */
  ownerDusdcCoinIds: string[];
  fixedBetAmount: number;
}): Transaction {
  const tx = new Transaction();
  const fixedBetMicro = Math.floor(input.fixedBetAmount * PRICE_DECIMALS);

  const primaryCoin = tx.object(input.ownerDusdcCoinIds[0]);
  if (input.ownerDusdcCoinIds.length > 1) {
    tx.mergeCoins(
      primaryCoin,
      input.ownerDusdcCoinIds.slice(1).map((id) => tx.object(id)),
    );
  }

  const [depositCoin] = tx.splitCoins(primaryCoin, [tx.pure.u64(fixedBetMicro)]);
  tx.moveCall({
    target: `${ENV.predictPackageId}::predict_manager::deposit`,
    typeArguments: [ENV.dusdcType],
    arguments: [tx.object(input.managerId), depositCoin],
  });

  const [marketKey] = tx.moveCall({
    target: `${ENV.predictPackageId}::market_key::new`,
    arguments: [
      tx.pure.id(input.oracleId),
      tx.pure.u64(input.expiryTimestamp),
      tx.pure.u64(input.strikePrice),
      tx.pure.bool(input.isYes),
    ],
  });

  tx.moveCall({
    target: `${ENV.predictPackageId}::predict::mint`,
    typeArguments: [ENV.dusdcType],
    arguments: [
      tx.object(ENV.predictObjectId),
      tx.object(input.managerId),
      tx.object(input.oracleId),
      marketKey,
      tx.pure.u64(fixedBetMicro),
      tx.object(CLOCK_OBJECT_ID),
    ],
  });

  return tx;
}

export function buildClaimPayoutTx(input: {
  managerId: string;
  oracleId: string;
  expiryTimestamp: number;
  strikePrice: number;
  isYes: boolean;
  payoutAmountMicro: number;
  recipient: string;
}): Transaction {
  const tx = new Transaction();

  const [marketKey] = tx.moveCall({
    target: `${ENV.predictPackageId}::market_key::new`,
    arguments: [
      tx.pure.id(input.oracleId),
      tx.pure.u64(input.expiryTimestamp),
      tx.pure.u64(input.strikePrice),
      tx.pure.bool(input.isYes),
    ],
  });

  tx.moveCall({
    target: `${ENV.predictPackageId}::predict::redeem`,
    typeArguments: [ENV.dusdcType],
    arguments: [
      tx.object(ENV.predictObjectId),
      tx.object(input.managerId),
      tx.object(input.oracleId),
      marketKey,
      tx.pure.u64(input.payoutAmountMicro),
      tx.object(CLOCK_OBJECT_ID),
    ],
  });

  const [withdrawnCoin] = tx.moveCall({
    target: `${ENV.predictPackageId}::predict_manager::withdraw`,
    typeArguments: [ENV.dusdcType],
    arguments: [tx.object(input.managerId), tx.pure.u64(input.payoutAmountMicro)],
  });

  // Fathom take-rate: skim FATHOM_REVENUE.claimFeeBps from the redeemed payout
  // and route it to the treasury inside the same PTB. Zero protocol changes —
  // just a splitCoins + transferObjects pair. Surfaced transparently in the
  // claim modal as "Fathom fee · we only earn when you win".
  const feeMicro = computeClaimFeeMicro(input.payoutAmountMicro);
  if (feeMicro > 0) {
    const [feeCoin] = tx.splitCoins(withdrawnCoin, [tx.pure.u64(feeMicro)]);
    tx.transferObjects([feeCoin], tx.pure.address(FATHOM_REVENUE.treasuryAddress));
  }

  tx.transferObjects([withdrawnCoin], tx.pure.address(input.recipient));
  return tx;
}

/**
 * Compute the integer micros Fathom skims from a winning payout. Centralised
 * so the UI (claim modal) can preview the same number the PTB will split.
 *
 * Returns 0 when fee config is zero or rounds to nothing (sub-micro payouts).
 */
export function computeClaimFeeMicro(payoutAmountMicro: number): number {
  const bps = Math.max(0, Math.floor(FATHOM_REVENUE.claimFeeBps));
  if (bps === 0 || payoutAmountMicro <= 0) return 0;
  return Math.floor((payoutAmountMicro * bps) / 10_000);
}

/**
 * Mint a BOUNDED range position. The protocol's `predict::mint_range` only
 * sells the bounded side — the PLP/vault is the implicit OUTSIDE counterparty.
 * See docs/range-markets.md for the discovery write-up.
 */
export function buildMintRangeTx(input: {
  managerId: string;
  oracleId: string;
  expiryTimestamp: number;
  lowerStrike: number;
  upperStrike: number;
  ownerDusdcCoinIds: string[];
  fixedBetAmount: number;
}): Transaction {
  const tx = new Transaction();
  const fixedBetMicro = Math.floor(input.fixedBetAmount * PRICE_DECIMALS);

  const primaryCoin = tx.object(input.ownerDusdcCoinIds[0]);
  if (input.ownerDusdcCoinIds.length > 1) {
    tx.mergeCoins(
      primaryCoin,
      input.ownerDusdcCoinIds.slice(1).map((id) => tx.object(id)),
    );
  }

  const [depositCoin] = tx.splitCoins(primaryCoin, [tx.pure.u64(fixedBetMicro)]);
  tx.moveCall({
    target: `${ENV.predictPackageId}::predict_manager::deposit`,
    typeArguments: [ENV.dusdcType],
    arguments: [tx.object(input.managerId), depositCoin],
  });

  const [rangeKey] = tx.moveCall({
    target: `${ENV.predictPackageId}::range_key::new`,
    arguments: [
      tx.pure.id(input.oracleId),
      tx.pure.u64(input.expiryTimestamp),
      tx.pure.u64(input.lowerStrike),
      tx.pure.u64(input.upperStrike),
    ],
  });

  tx.moveCall({
    target: `${ENV.predictPackageId}::predict::mint_range`,
    typeArguments: [ENV.dusdcType],
    arguments: [
      tx.object(ENV.predictObjectId),
      tx.object(input.managerId),
      tx.object(input.oracleId),
      rangeKey,
      tx.pure.u64(fixedBetMicro),
      tx.object(CLOCK_OBJECT_ID),
    ],
  });

  return tx;
}

/**
 * Redeem a settled BOUNDED range position and transfer the dUSDC payout to
 * the recipient. Mirrors buildClaimPayoutTx for binary markets — including
 * the take-rate skim to FATHOM_REVENUE.treasuryAddress.
 */
export function buildClaimRangePayoutTx(input: {
  managerId: string;
  oracleId: string;
  expiryTimestamp: number;
  lowerStrike: number;
  upperStrike: number;
  payoutAmountMicro: number;
  recipient: string;
}): Transaction {
  const tx = new Transaction();

  const [rangeKey] = tx.moveCall({
    target: `${ENV.predictPackageId}::range_key::new`,
    arguments: [
      tx.pure.id(input.oracleId),
      tx.pure.u64(input.expiryTimestamp),
      tx.pure.u64(input.lowerStrike),
      tx.pure.u64(input.upperStrike),
    ],
  });

  tx.moveCall({
    target: `${ENV.predictPackageId}::predict::redeem_range`,
    typeArguments: [ENV.dusdcType],
    arguments: [
      tx.object(ENV.predictObjectId),
      tx.object(input.managerId),
      tx.object(input.oracleId),
      rangeKey,
      tx.pure.u64(input.payoutAmountMicro),
      tx.object(CLOCK_OBJECT_ID),
    ],
  });

  const [withdrawnCoin] = tx.moveCall({
    target: `${ENV.predictPackageId}::predict_manager::withdraw`,
    typeArguments: [ENV.dusdcType],
    arguments: [tx.object(input.managerId), tx.pure.u64(input.payoutAmountMicro)],
  });

  const feeMicro = computeClaimFeeMicro(input.payoutAmountMicro);
  if (feeMicro > 0) {
    const [feeCoin] = tx.splitCoins(withdrawnCoin, [tx.pure.u64(feeMicro)]);
    tx.transferObjects([feeCoin], tx.pure.address(FATHOM_REVENUE.treasuryAddress));
  }

  tx.transferObjects([withdrawnCoin], tx.pure.address(input.recipient));
  return tx;
}

/**
 * Smart Bet: a single sponsored PTB that mints a Predict binary YES/NO
 * position AND runs a DeepBook Spot leg on the user's SUI in the same
 * transaction — through Fathom's own `router::hedged_swap`. The headline
 * composability beat for the Sui Overflow DeepBook track: one explorer digest
 * carries `predict::mint` plus a Fathom-authored Move call that itself invokes
 * `deepbook::pool::swap_exact_base_for_quote` and ENFORCES the fill.
 *
 * The spot leg sells `hedgeSuiAmountMicro` SUI into DBUSDC on the canonical
 * SUI_DBUSDC pool. `router::hedged_swap` asserts the orderbook returned at
 * least `minHedgeDbusdcOutMicro` DBUSDC — if the book can't fill the floor it
 * aborts, reverting the whole PTB (including the mint), so the bet and its
 * spot leg are genuinely atomic. It also emits a `HedgedSwapExecuted` event
 * linking the Predict position to the verified fill (consumed by the indexer).
 * DBUSDC and all residuals are returned to the user.
 *
 * Why a spot leg and not "swap SUI → dUSDC → mint": on testnet there is no
 * on-chain bridge between DBUSDC and Predict's `dUSDC` (verified by
 * scripts/probe-deepbook.ts), and Predict's `dUSDC` exposes no swap fn, so
 * atomically converting SUI → mintable stake isn't possible. The stake stays
 * dUSDC; the DeepBook leg is an honest, asserted spot fill priced against the
 * same book.
 */
export function buildSmartBetTx(input: {
  managerId: string;
  oracleId: string;
  expiryTimestamp: number;
  strikePrice: number;
  isYes: boolean;
  ownerDusdcCoinIds: string[];
  fixedBetAmount: number;
  /** Primary SUI coin is [0]; merged before splitting. Caller fetches via getUserSuiCoins. */
  ownerSuiCoinIds: string[];
  /** Hedge size in SUI micros (1e9). Caller decides ratio (e.g. 0.5×, 1×, 2× stake notional). */
  hedgeSuiAmountMicro: bigint;
  /** Slippage-floored DBUSDC out, in 1e6 micros (BigInt). 0 is permitted but ill-advised. */
  minHedgeDbusdcOutMicro: bigint;
  /**
   * DEEP coin ids in the user's wallet. DeepBook v3 charges fill fees in
   * DEEP — without a real DEEP coin the swap returns a no-op. If empty we
   * fall back to `coin::zero<DEEP>` and the surrounding mint still settles.
   */
  ownerDeepCoinIds?: string[];
  recipient: string;
}): Transaction {
  const tx = new Transaction();
  const fixedBetMicro = Math.floor(input.fixedBetAmount * PRICE_DECIMALS);

  // === Predict leg (identical to buildMintPredictionTx) ===
  const primaryDusdc = tx.object(input.ownerDusdcCoinIds[0]);
  if (input.ownerDusdcCoinIds.length > 1) {
    tx.mergeCoins(
      primaryDusdc,
      input.ownerDusdcCoinIds.slice(1).map((id) => tx.object(id)),
    );
  }
  const [depositCoin] = tx.splitCoins(primaryDusdc, [tx.pure.u64(fixedBetMicro)]);
  tx.moveCall({
    target: `${ENV.predictPackageId}::predict_manager::deposit`,
    typeArguments: [ENV.dusdcType],
    arguments: [tx.object(input.managerId), depositCoin],
  });
  const [marketKey] = tx.moveCall({
    target: `${ENV.predictPackageId}::market_key::new`,
    arguments: [
      tx.pure.id(input.oracleId),
      tx.pure.u64(input.expiryTimestamp),
      tx.pure.u64(input.strikePrice),
      tx.pure.bool(input.isYes),
    ],
  });
  tx.moveCall({
    target: `${ENV.predictPackageId}::predict::mint`,
    typeArguments: [ENV.dusdcType],
    arguments: [
      tx.object(ENV.predictObjectId),
      tx.object(input.managerId),
      tx.object(input.oracleId),
      marketKey,
      tx.pure.u64(fixedBetMicro),
      tx.object(CLOCK_OBJECT_ID),
    ],
  });

  // === DeepBook spot leg, via Fathom's asserted router ===
  const primarySui = tx.object(input.ownerSuiCoinIds[0]);
  if (input.ownerSuiCoinIds.length > 1) {
    tx.mergeCoins(
      primarySui,
      input.ownerSuiCoinIds.slice(1).map((id) => tx.object(id)),
    );
  }
  const [hedgeSuiCoin] = tx.splitCoins(primarySui, [tx.pure.u64(input.hedgeSuiAmountMicro)]);
  const { baseLeftover, quoteOut, deepLeftover } = addHedgedSwapLeg(tx, {
    suiCoinHandle: hedgeSuiCoin,
    hedgeBaseInMicro: input.hedgeSuiAmountMicro,
    deepCoinIds: input.ownerDeepCoinIds,
    minHedgeDbusdcOutMicro: input.minHedgeDbusdcOutMicro,
    managerId: input.managerId,
    oracleId: input.oracleId,
    expiryTimestamp: input.expiryTimestamp,
    strikePrice: input.strikePrice,
    isYes: input.isYes,
    isRange: false,
    lowerStrike: 0,
    upperStrike: 0,
    stakeAmountMicro: fixedBetMicro,
  });
  // Transfer all swap residuals back to the user. baseLeftover is unconsumed
  // SUI (slippage residual), quoteOut is DBUSDC, deepLeftover is the unused
  // DEEP after fees.
  tx.transferObjects([baseLeftover, quoteOut, deepLeftover], tx.pure.address(input.recipient));

  return tx;
}

/**
 * Build a Coin<DEEP> handle for the DeepBook leg. If the user holds DEEP,
 * merges it into a single primary (the swap consumes what it needs, returns
 * the rest as `deepLeftover`). Otherwise mints `coin::zero<DEEP>` so the Move
 * signature is satisfied — testnet pools accept paying the fill fee in the
 * input asset when the DEEP coin is empty.
 */
function deepCoinOrZero(tx: Transaction, deepCoinIds?: string[]) {
  if (deepCoinIds && deepCoinIds.length > 0) {
    const primary = tx.object(deepCoinIds[0]);
    if (deepCoinIds.length > 1) {
      tx.mergeCoins(
        primary,
        deepCoinIds.slice(1).map((id) => tx.object(id)),
      );
    }
    return primary;
  }
  const [empty] = tx.moveCall({
    target: `0x0000000000000000000000000000000000000000000000000000000000000002::coin::zero`,
    typeArguments: [DEEPBOOK.deepType],
    arguments: [],
  });
  return empty;
}

/**
 * Append the Smart Bet DeepBook spot leg + Fathom's enforced assertion.
 *
 * 1. `pool::swap_exact_base_for_quote` (via the shared `addSuiToDbusdcSwapLeg`
 *    helper, SDK-current DeepBook package) sells the SUI handle for DBUSDC.
 *    `min_out = 0` is passed to the pool because the floor is enforced by us.
 * 2. `router::assert_and_record` (Fathom's own package) asserts the DBUSDC
 *    output cleared `minHedgeDbusdcOutMicro` — abort reverts the whole PTB,
 *    including the Predict mint — and emits a `HedgedSwapExecuted` event
 *    linking the adjacent Predict position to the verified fill. It borrows
 *    `quoteOut` immutably, so the caller still transfers it.
 *
 * Returns `{ baseLeftover, quoteOut, deepLeftover }` for the caller to route.
 *
 * `strikePrice`/`isYes` are used for binary bets; `lowerStrike`/`upperStrike`
 * for range bets (set `isRange` accordingly). All strike values are the
 * already-scaled on-chain integers.
 */
function addHedgedSwapLeg(
  tx: Transaction,
  input: {
    suiCoinHandle: TransactionObjectArgument;
    hedgeBaseInMicro: bigint;
    deepCoinIds?: string[];
    minHedgeDbusdcOutMicro: bigint;
    managerId: string;
    oracleId: string;
    expiryTimestamp: number;
    strikePrice: number;
    isYes: boolean;
    isRange: boolean;
    lowerStrike: number;
    upperStrike: number;
    stakeAmountMicro: number;
  },
) {
  const deepCoinHandle = deepCoinOrZero(tx, input.deepCoinIds);
  const { baseLeftover, quoteOut, deepLeftover } = addSuiToDbusdcSwapLeg(tx, {
    suiCoinHandle: input.suiCoinHandle,
    deepCoinHandle,
    minQuoteOutMicro: 0n, // floor enforced by router::assert_and_record below
  });

  tx.moveCall({
    target: `${ENV.fathomRouterPackageId}::router::assert_and_record`,
    typeArguments: [DEEPBOOK.quoteType],
    arguments: [
      quoteOut,
      tx.pure.u64(input.minHedgeDbusdcOutMicro),
      tx.pure.u64(input.hedgeBaseInMicro),
      tx.pure.id(input.managerId),
      tx.pure.id(input.oracleId),
      tx.pure.u64(input.expiryTimestamp),
      tx.pure.u64(input.strikePrice),
      tx.pure.bool(input.isYes),
      tx.pure.bool(input.isRange),
      tx.pure.u64(input.lowerStrike),
      tx.pure.u64(input.upperStrike),
      tx.pure.u64(input.stakeAmountMicro),
    ],
  });

  return { baseLeftover, quoteOut, deepLeftover };
}

/**
 * Smart Bet variant for BOUNDED range positions. Same DeepBook spot hedge
 * leg appended to the range mint flow.
 */
export function buildSmartBetRangeTx(input: {
  managerId: string;
  oracleId: string;
  expiryTimestamp: number;
  lowerStrike: number;
  upperStrike: number;
  ownerDusdcCoinIds: string[];
  fixedBetAmount: number;
  ownerSuiCoinIds: string[];
  ownerDeepCoinIds?: string[];
  hedgeSuiAmountMicro: bigint;
  minHedgeDbusdcOutMicro: bigint;
  recipient: string;
}): Transaction {
  const tx = new Transaction();
  const fixedBetMicro = Math.floor(input.fixedBetAmount * PRICE_DECIMALS);

  const primaryDusdc = tx.object(input.ownerDusdcCoinIds[0]);
  if (input.ownerDusdcCoinIds.length > 1) {
    tx.mergeCoins(
      primaryDusdc,
      input.ownerDusdcCoinIds.slice(1).map((id) => tx.object(id)),
    );
  }
  const [depositCoin] = tx.splitCoins(primaryDusdc, [tx.pure.u64(fixedBetMicro)]);
  tx.moveCall({
    target: `${ENV.predictPackageId}::predict_manager::deposit`,
    typeArguments: [ENV.dusdcType],
    arguments: [tx.object(input.managerId), depositCoin],
  });
  const [rangeKey] = tx.moveCall({
    target: `${ENV.predictPackageId}::range_key::new`,
    arguments: [
      tx.pure.id(input.oracleId),
      tx.pure.u64(input.expiryTimestamp),
      tx.pure.u64(input.lowerStrike),
      tx.pure.u64(input.upperStrike),
    ],
  });
  tx.moveCall({
    target: `${ENV.predictPackageId}::predict::mint_range`,
    typeArguments: [ENV.dusdcType],
    arguments: [
      tx.object(ENV.predictObjectId),
      tx.object(input.managerId),
      tx.object(input.oracleId),
      rangeKey,
      tx.pure.u64(fixedBetMicro),
      tx.object(CLOCK_OBJECT_ID),
    ],
  });

  const primarySui = tx.object(input.ownerSuiCoinIds[0]);
  if (input.ownerSuiCoinIds.length > 1) {
    tx.mergeCoins(
      primarySui,
      input.ownerSuiCoinIds.slice(1).map((id) => tx.object(id)),
    );
  }
  const [hedgeSuiCoin] = tx.splitCoins(primarySui, [tx.pure.u64(input.hedgeSuiAmountMicro)]);
  const { baseLeftover, quoteOut, deepLeftover } = addHedgedSwapLeg(tx, {
    suiCoinHandle: hedgeSuiCoin,
    hedgeBaseInMicro: input.hedgeSuiAmountMicro,
    deepCoinIds: input.ownerDeepCoinIds,
    minHedgeDbusdcOutMicro: input.minHedgeDbusdcOutMicro,
    managerId: input.managerId,
    oracleId: input.oracleId,
    expiryTimestamp: input.expiryTimestamp,
    strikePrice: 0,
    isYes: false,
    isRange: true,
    lowerStrike: input.lowerStrike,
    upperStrike: input.upperStrike,
    stakeAmountMicro: fixedBetMicro,
  });
  tx.transferObjects([baseLeftover, quoteOut, deepLeftover], tx.pure.address(input.recipient));

  return tx;
}

export async function buildTransactionKindBytes(tx: Transaction, client: unknown): Promise<string> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const bytes = await tx.build({ onlyTransactionKind: true, client: client as any });
  return toBase64(bytes);
}

export function buildSendDusdcTx(input: {
  /** Primary coin is [0]; additional coins are merged into it before splitting. */
  fromCoinIds: string[];
  amount: number;
  recipient: string;
}): Transaction {
  const tx = new Transaction();
  const amountMicro = Math.floor(input.amount * 1_000_000);

  const primaryCoin = tx.object(input.fromCoinIds[0]);
  if (input.fromCoinIds.length > 1) {
    tx.mergeCoins(
      primaryCoin,
      input.fromCoinIds.slice(1).map((id) => tx.object(id)),
    );
  }

  const [coin] = tx.splitCoins(primaryCoin, [tx.pure.u64(amountMicro)]);
  tx.transferObjects([coin], tx.pure.address(input.recipient));
  return tx;
}
