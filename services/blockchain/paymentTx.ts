import { Transaction } from "@mysten/sui/transactions";

import { ENV } from "@/utils/constants";

/**
 * Brisk payment transaction builders + invoice codec.
 *
 * A merchant payment runs as two feeless legs (see services/blockchain/payments):
 *  - Native gasless transfer (`buildGaslessTransferTx`): a PTB of solely
 *    `0x2::balance::send_funds<USDC>` with gas set to 0, submitted straight to
 *    the fullnode. The protocol treats it as a zero-fee Address-Balances transfer.
 *    (Auto gas=0 detection only fires on gRPC/GraphQL; on our JSON-RPC client we
 *    set gasPrice/gasBudget = 0 manually — USDC is allowlisted for send_funds.)
 *  - Receipt + cashback (`buildReceiptOnlyTx`): a balance-free, Enoki-sponsored
 *    PTB. Kept separate from the transfer because the gas station can't yet
 *    sponsor Address-Balance withdrawals — see buildReceiptOnlyTx for the detail.
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
  return `$${microsToUsd(micros).toFixed(2)}`;
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
 * Receipt + cashback ONLY — no USDC movement. Used as the second leg of a
 * payment after the value transfer settles natively-gasless.
 *
 * Why split: when the payer's USDC lives in their Address Balance accumulator
 * (the norm once funds are received via `send_funds`), the SDK sources it with
 * the new `CallArg::FundsWithdrawal` input. Enoki's sponsor accepts it, but the
 * gas station can't yet BCS-deserialize that variant → "Invalid bcs bytes for
 * TransactionData". So the transfer runs natively-gasless straight to the
 * fullnode (which understands FundsWithdrawal), and ONLY the receipt/cashback —
 * which touch no balance and use solely `Pure` inputs — go through Enoki.
 */
export function buildReceiptOnlyTx(input: {
  payer: string;
  payee: string;
  amountMicros: number | bigint;
  memo: string;
  invoiceId: string;
  timestampMs: number | bigint;
}): Transaction {
  const tx = new Transaction();
  tx.setSender(input.payer);

  const receipt = tx.moveCall({
    target: `${PKG}::payment_receipt::issue`,
    typeArguments: [USDC],
    arguments: [
      tx.pure.address(input.payer),
      tx.pure.address(input.payee),
      tx.pure.u64(BigInt(input.amountMicros)),
      tx.pure.string(input.memo),
      tx.pure.string(input.invoiceId),
      tx.pure.u64(BigInt(input.timestampMs)),
    ],
  });
  tx.transferObjects([receipt], tx.pure.address(input.payer));

  tx.moveCall({
    target: `${PKG}::loyalty::earn`,
    arguments: [tx.pure.address(input.payer), tx.pure.u64(BigInt(input.amountMicros))],
  });

  return tx;
}

/** Allowlist for the sponsored receipt-and-cashback-only PTB (no balance ops). */
export const RECEIPT_LOYALTY_TARGETS = [`${PKG}::payment_receipt::issue`, `${PKG}::loyalty::earn`];
