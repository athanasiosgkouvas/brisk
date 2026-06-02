import { Transaction } from "@mysten/sui/transactions";

import { CLOCK_OBJECT_ID, ENV } from "@/utils/constants";

/**
 * Brisk payment transaction builders + invoice codec.
 *
 * A merchant payment runs as two feeless legs (see services/blockchain/payments):
 *  - Native gasless transfer (`buildGaslessTransferTx`): a PTB of solely
 *    `0x2::balance::send_funds<USDC>` with gas set to 0, submitted straight to
 *    the fullnode. The protocol treats it as a zero-fee Address-Balances transfer.
 *    (Auto gas=0 detection only fires on gRPC/GraphQL; on our JSON-RPC client we
 *    set gasPrice/gasBudget = 0 manually — USDC is allowlisted for send_funds.)
 *  - Atomic sponsored payment (`buildPaymentWithReceiptTx`): one Enoki-sponsored
 *    PTB that runs `payment_receipt::pay` (moves USDC + mints a soulbound receipt)
 *    then `loyalty::earn`. Used when the payer holds spendable Coin objects; see
 *    that builder for why the funds are coin-sourced.
 *
 * `0x2::balance::send_funds<T>(Balance<T>, recipient: address)` — verified on
 * testnet. `tx.balance({ type, balance })` sources the Balance from the sender's
 * address balance, falling back to owned coins.
 */

const USDC = ENV.usdcType;

// ─── Invoice codec (brisk://pay?...) ────────────────────────────────────────
// The merchant terminal emulates an NDEF tag carrying this URI; the customer
// reads it on tap. amount is in USDC micros (6 dp).

export type Invoice = {
  payee: string; // merchant Sui address
  amountMicros: number; // USDC micro-units (1 USDC = 1_000_000)
  invoiceId: string; // unique per charge
  merchant: string; // display name
};

export function encodeInvoice(inv: Invoice): string {
  const q = [
    `payee=${encodeURIComponent(inv.payee)}`,
    `amount=${inv.amountMicros}`,
    `invoice=${encodeURIComponent(inv.invoiceId)}`,
    `merchant=${encodeURIComponent(inv.merchant)}`,
  ].join("&");
  return `brisk://pay?${q}`;
}

export function parseInvoice(uri: string): Invoice | null {
  const qIndex = uri.indexOf("?");
  if (!uri.startsWith("brisk://pay") || qIndex === -1) return null;

  const params: Record<string, string> = {};
  for (const pair of uri.slice(qIndex + 1).split("&")) {
    const eq = pair.indexOf("=");
    if (eq === -1) continue;
    params[pair.slice(0, eq)] = decodeURIComponent(pair.slice(eq + 1));
  }

  const payee = params.payee;
  const amountMicros = Number(params.amount);
  if (!payee?.startsWith("0x") || !Number.isFinite(amountMicros) || amountMicros <= 0) {
    return null;
  }
  return {
    payee,
    amountMicros,
    invoiceId: params.invoice ?? "",
    merchant: params.merchant ?? "Merchant",
  };
}

// ─── Amount helpers (USDC, 6 decimals) ──────────────────────────────────────

export function usdToMicros(usd: number): number {
  return Math.round(usd * 10 ** ENV.usdcDecimals);
}

export function microsToUsd(micros: number): number {
  return micros / 10 ** ENV.usdcDecimals;
}

export function formatUsd(micros: number): string {
  // Manual thousands separators — Hermes' Intl/toLocaleString is only partial.
  const [int, dec] = microsToUsd(micros).toFixed(2).split(".");
  const grouped = int.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  return `$${grouped}.${dec}`;
}

// ─── Payment PTB builders ───────────────────────────────────────────────────

/**
 * Native-gasless USDC transfer. The user signs and submits this directly; the
 * protocol charges no gas. Caller must NOT set a gas payment.
 */
export function buildGaslessTransferTx(input: {
  sender: string;
  payee: string;
  amountMicros: number | bigint;
}): Transaction {
  const tx = new Transaction();
  const balance = tx.balance({ type: USDC, balance: BigInt(input.amountMicros) });
  tx.moveCall({
    target: "0x2::balance::send_funds",
    typeArguments: [USDC],
    arguments: [balance, tx.pure.address(input.payee)],
  });
  tx.setSender(input.sender);
  // Gasless: zero gas on the JSON-RPC path (USDC is allowlisted for send_funds).
  tx.setGasPrice(0);
  tx.setGasBudget(0);
  return tx;
}

const PKG = ENV.briskPackageId;

/**
 * Atomic merchant payment — transfer + on-chain receipt + cashback in ONE
 * Enoki-sponsored PTB:
 *   1. split `amount` from the payer's coins and hand it to
 *      `payment_receipt::pay`, which transfers it to the merchant, mints a
 *      soulbound `Receipt`, emits `PaymentMade`, and returns a `PaymentProof`.
 *   2. `loyalty::earn` consumes that proof and mints cashback to the payer.
 *
 * `amount`/`timestamp` on the receipt are authenticated on-chain (coin value +
 * `Clock`), and cashback is bound to this exact payment by the hot-potato proof
 * — neither can be forged or replayed.
 *
 * USDC is sourced from explicit Coin objects (`coinObjectIds`, merged + split)
 * so the sponsored tx uses `CallArg::Object` and clears Enoki's gas station.
 * TODO(enoki-fundswithdrawal): once Enoki sponsors Address-Balance withdrawals,
 * source the coin with `tx.balance(...)` and drop `coinObjectIds`. See
 * services/blockchain/coins.ts.
 */
export function buildPaymentWithReceiptTx(input: {
  payer: string;
  payee: string;
  amountMicros: number | bigint;
  memo: string;
  invoiceId: string;
  coinObjectIds: string[];
}): Transaction {
  const tx = new Transaction();
  tx.setSender(input.payer);

  const [primary, ...rest] = input.coinObjectIds.map((id) => tx.object(id));
  if (rest.length > 0) tx.mergeCoins(primary, rest);
  const [paymentCoin] = tx.splitCoins(primary, [tx.pure.u64(BigInt(input.amountMicros))]);

  const proof = tx.moveCall({
    target: `${PKG}::payment_receipt::pay`,
    typeArguments: [USDC],
    arguments: [
      paymentCoin,
      tx.pure.address(input.payee),
      tx.pure.string(input.memo),
      tx.pure.string(input.invoiceId),
      tx.object(CLOCK_OBJECT_ID),
    ],
  });
  tx.moveCall({ target: `${PKG}::loyalty::earn`, arguments: [proof] });

  return tx;
}

/** Allowlist for the atomic sponsored payment PTB (pay moves funds internally). */
export const PAY_WITH_RECEIPT_TARGETS = [`${PKG}::payment_receipt::pay`, `${PKG}::loyalty::earn`];
