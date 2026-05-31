import { Transaction } from "@mysten/sui/transactions";

import { ENV } from "@/utils/constants";

/**
 * Brisk payment transaction builders + invoice codec.
 *
 * Two payment paths, both feeless to the user:
 *  - Native gasless: PTB of solely `0x2::balance::send_funds<USDC>` with gas set
 *    to 0. The protocol treats it as a zero-fee Address-Balances transfer. (Auto
 *    gas=0 detection only fires on gRPC/GraphQL; on our JSON-RPC client we set
 *    gasPrice/gasBudget = 0 manually — eligibility is known since USDC is
 *    allowlisted.)
 *  - Sponsored: the same transfer (and later, +receipt/+cashback) with gas paid
 *    by Enoki. Used whenever the PTB does more than a bare stablecoin transfer.
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

/**
 * Sponsored USDC transfer (Enoki pays gas). Returns a kind-only Transaction;
 * the caller serializes its kind bytes and runs it through the sponsor relay.
 * This is the fallback when native-gasless submission isn't available, and the
 * base for the Phase 2 transfer-with-receipt PTB.
 */
export function buildSponsoredTransferTx(input: {
  sender: string;
  payee: string;
  amountMicros: number | bigint;
}): Transaction {
  const tx = new Transaction();
  tx.setSender(input.sender); // required so the balance source resolves at build time
  const balance = tx.balance({ type: USDC, balance: BigInt(input.amountMicros) });
  tx.moveCall({
    target: "0x2::balance::send_funds",
    typeArguments: [USDC],
    arguments: [balance, tx.pure.address(input.payee)],
  });
  return tx;
}

/** Move-call targets this payment touches — for the Enoki sponsorship allowlist. */
export const TRANSFER_TARGETS = ["0x2::balance::send_funds"];

const PKG = ENV.briskPackageId;

/**
 * Atomic merchant payment WITH an on-chain receipt, in one PTB:
 *   1. move `amount` USDC to the merchant (`balance::send_funds`)
 *   2. mint a `Receipt` (`payment_receipt::issue`) and hand it to the payer
 * Runs as an Enoki-sponsored tx (the receipt mint disqualifies native-gasless),
 * so the user still pays $0. Sender is set so the balance source resolves at
 * build time.
 */
export function buildPaymentWithReceiptTx(input: {
  payer: string;
  payee: string;
  amountMicros: number | bigint;
  memo: string;
  invoiceId: string;
  timestampMs: number | bigint;
}): Transaction {
  const tx = new Transaction();
  tx.setSender(input.payer);

  const balance = tx.balance({ type: USDC, balance: BigInt(input.amountMicros) });
  tx.moveCall({
    target: "0x2::balance::send_funds",
    typeArguments: [USDC],
    arguments: [balance, tx.pure.address(input.payee)],
  });

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

  // Cashback: mint loyalty points to the payer (closed-loop, atomic with the pay).
  tx.moveCall({
    target: `${PKG}::loyalty::earn`,
    arguments: [tx.pure.address(input.payer), tx.pure.u64(BigInt(input.amountMicros))],
  });

  return tx;
}

/** Allowlist for the sponsored payment-with-receipt-and-cashback PTB. */
export const PAY_WITH_RECEIPT_TARGETS = [
  "0x2::balance::send_funds",
  "0x2::coin::into_balance",
  `${PKG}::payment_receipt::issue`,
  `${PKG}::loyalty::earn`,
];
