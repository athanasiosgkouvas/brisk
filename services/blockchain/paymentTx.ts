import { Transaction } from "@mysten/sui/transactions";

import { CLOCK_OBJECT_ID, ENV } from "@/utils/constants";
import { isValidSuiAddress } from "@/utils/address";

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
 *    PTB that runs `payment_receipt::pay` (moves USDC + mints a soulbound receipt).
 *    Used when the payer holds spendable Coin objects; see that builder for why
 *    the funds are coin-sourced.
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
  payee: string; // merchant Sui address (= Merchant.owner; used by the gasless fallback)
  merchantId: string; // shared Merchant object id the receipt is bound to
  amountMicros: number; // USDC micro-units (1 USDC = 1_000_000)
  invoiceId: string; // unique per charge
  merchant: string; // display name
};

// Upper bound on a single tapped invoice (1,000,000 USDC) — a sanity ceiling so a
// garbled/hostile tag can't present an absurd or precision-lossy amount to sign.
const MAX_INVOICE_MICROS = 1_000_000 * 10 ** 6;

export function encodeInvoice(inv: Invoice): string {
  const q = [
    `payee=${encodeURIComponent(inv.payee)}`,
    `merchantId=${encodeURIComponent(inv.merchantId)}`,
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
  const merchantId = params.merchantId;
  const amountMicros = Number(params.amount);
  // The invoice arrives over NFC from an untrusted tag: validate the payee and
  // the merchant object id are real Sui ids (not just a "0x" prefix) and the
  // amount is a positive integer within a sane bound, so a tampered/garbled tag
  // can't steer funds to a malformed address or inject a fractional /
  // precision-lossy amount.
  if (
    !payee ||
    !isValidSuiAddress(payee) ||
    !merchantId ||
    !isValidSuiAddress(merchantId) ||
    !Number.isInteger(amountMicros) ||
    amountMicros <= 0 ||
    amountMicros > MAX_INVOICE_MICROS
  ) {
    return null;
  }
  return {
    payee,
    merchantId,
    amountMicros,
    invoiceId: params.invoice ?? "",
    merchant: params.merchant ?? "Merchant",
  };
}

/**
 * Parse an incoming `brisk://pay?…` deep link into either a self-contained
 * invoice (the NFC tag form) or a payment-link short `code` (resolved via the
 * backend). Returns null for any non-pay link (e.g. `brisk://oauth`).
 */
export function parsePayDeepLink(
  url: string,
): { kind: "invoice"; invoice: Invoice } | { kind: "code"; code: string } | null {
  const qIndex = url.indexOf("?");
  if (!url.startsWith("brisk://pay") || qIndex === -1) return null;

  const params: Record<string, string> = {};
  for (const pair of url.slice(qIndex + 1).split("&")) {
    const eq = pair.indexOf("=");
    if (eq === -1) continue;
    params[pair.slice(0, eq)] = decodeURIComponent(pair.slice(eq + 1));
  }

  // Short-code form: brisk://pay?code=AbCd1234 — resolve server-side.
  if (params.code && /^[A-Za-z0-9]{8}$/.test(params.code)) {
    return { kind: "code", code: params.code };
  }
  // Self-contained NFC form: reuse the strict invoice validator.
  const invoice = parseInvoice(url);
  return invoice ? { kind: "invoice", invoice } : null;
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
 * Atomic merchant payment — transfer + on-chain receipt in ONE Enoki-sponsored
 * PTB: hand the payer's coin and the invoiced `amount` to `payment_receipt::pay`,
 * which splits exactly `amount` to the merchant (`&Merchant`, shared), returns
 * change to the payer, mints a soulbound `Receipt`, and emits `PaymentMade`.
 * `amount`/`payee`/`merchant`/`timestamp` are all authenticated on-chain (coin
 * value, Merchant profile, Clock), never caller-supplied.
 *
 * USDC is sourced from explicit Coin objects (`coinObjectIds`, merged) so the
 * sponsored tx uses `CallArg::Object` and clears Enoki's gas station; the
 * contract does the exact-amount split and hands back any change.
 * TODO(enoki-fundswithdrawal): once Enoki sponsors Address-Balance withdrawals,
 * source the coin with `tx.balance(...)` and drop `coinObjectIds`. See
 * services/blockchain/coins.ts.
 */
export function buildPaymentWithReceiptTx(input: {
  payer: string;
  merchantId: string;
  amountMicros: number | bigint;
  memo: string;
  invoiceId: string;
  coinObjectIds: string[];
}): Transaction {
  const tx = new Transaction();
  tx.setSender(input.payer);

  const [primary, ...rest] = input.coinObjectIds.map((id) => tx.object(id));
  if (rest.length > 0) tx.mergeCoins(primary, rest);

  tx.moveCall({
    target: `${PKG}::payment_receipt::pay`,
    typeArguments: [USDC],
    arguments: [
      tx.object(input.merchantId),
      primary,
      tx.pure.u64(BigInt(input.amountMicros)),
      tx.pure.string(input.memo),
      tx.pure.string(input.invoiceId),
      tx.object(CLOCK_OBJECT_ID),
    ],
  });

  return tx;
}

/**
 * Merchant onboarding PTB: register a `Merchant` profile and share it (so a
 * customer's pay PTB can reference it), handing the `MerchantCap` to the sender.
 * Run sponsored the first time a user opens Charge.
 */
export function buildRegisterMerchantTx(input: { sender: string; name: string }): Transaction {
  const tx = new Transaction();
  tx.setSender(input.sender);
  tx.moveCall({
    target: `${PKG}::merchant_registry::register_and_share`,
    arguments: [tx.pure.string(input.name)],
  });
  return tx;
}

/** Allowlist for the atomic sponsored payment PTB (pay moves funds internally). */
export const PAY_WITH_RECEIPT_TARGETS = [`${PKG}::payment_receipt::pay`];

/** Allowlist for the sponsored merchant-onboarding PTB. */
export const REGISTER_MERCHANT_TARGETS = [`${PKG}::merchant_registry::register_and_share`];
