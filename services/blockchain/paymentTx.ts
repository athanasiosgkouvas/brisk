import { Transaction } from "@mysten/sui/transactions";
import { normalizeSuiObjectId } from "@mysten/sui/utils";

import { CLOCK_OBJECT_ID, ENV } from "@/utils/constants";
import { isValidSuiAddress } from "@/utils/address";

/**
 * Brisk payment transaction builders + invoice codec.
 *
 * A merchant/link payment runs as TWO feeless legs (see services/blockchain/payments):
 *  - Native gasless transfer (`buildGaslessTransferTx`): a PTB of solely
 *    `0x2::balance::send_funds<USDC>` with gas set to 0, submitted straight to the
 *    fullnode — the protocol-level zero-gas demonstration and the settlement
 *    source of truth. Also used for plain P2P wallet sends. (Auto gas=0 detection
 *    only fires on gRPC/GraphQL; on our JSON-RPC client we set gasPrice/gasBudget
 *    = 0 manually — USDC is allowlisted for send_funds.)
 *  - Sponsored receipt (`buildRecordPaymentTx`): best-effort Enoki-sponsored PTB
 *    that mints the soulbound `Receipt` + emits `PaymentMade` WITHOUT moving a
 *    coin. Records merchant-bound commerce on top of the gasless transfer.
 */

const USDC = ENV.usdcType;

// ─── Invoice codec (brisk://pay?...) ────────────────────────────────────────
// The merchant terminal emulates an NDEF tag carrying this URI; the customer
// reads it on tap. amount is in USDC micros (6 dp).

export type Invoice = {
  // Destination of the customer's gasless transfer. For a merchant charge this is
  // the TILL's receiving address (a Till object id) — never the merchant's
  // private treasury, which the customer must not see. For legacy/P2P it's a
  // plain address. The receipt is still bound to `merchantId`.
  payee: string;
  merchantId: string; // shared Merchant object id the receipt is bound to
  tillId?: string; // the receiving account this charge collects into, if any
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
  ];
  if (inv.tillId) q.push(`till=${encodeURIComponent(inv.tillId)}`);
  return `brisk://pay?${q.join("&")}`;
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
  // Optional till id (the receiving account). Validated like any Sui id when present.
  const tillId = params.till && isValidSuiAddress(params.till) ? params.till : undefined;
  return {
    payee,
    merchantId,
    tillId,
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
):
  | { kind: "invoice"; invoice: Invoice }
  | { kind: "code"; code: string }
  | { kind: "claim"; cardId: string; code?: string; secret?: string }
  | { kind: "buy"; merchantId: string; name?: string }
  | null {
  const qIndex = url.indexOf("?");
  if (qIndex === -1) return null;

  const params: Record<string, string> = {};
  for (const pair of url.slice(qIndex + 1).split("&")) {
    const eq = pair.indexOf("=");
    if (eq === -1) continue;
    params[pair.slice(0, eq)] = decodeURIComponent(pair.slice(eq + 1));
  }

  // Gift-card claim: brisk://claim?card=<objectId>&code=<code>&s=<secret>. The
  // on-chain GiftCard object id + the claim secret; code is for backend indexing.
  if (url.startsWith("brisk://claim")) {
    return params.card && params.card.startsWith("0x")
      ? { kind: "claim", cardId: params.card, code: params.code, secret: params.s }
      : null;
  }

  // Buy a gift card for a merchant: brisk://buy-gift-card?merchant=<id>&name=<name>.
  if (url.startsWith("brisk://buy-gift-card")) {
    return params.merchant && params.merchant.startsWith("0x")
      ? { kind: "buy", merchantId: params.merchant, name: params.name }
      : null;
  }

  if (!url.startsWith("brisk://pay")) return null;
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

/**
 * Gift cards are on-chain escrowed objects (Move `gift_card`). These builders
 * produce SPONSORED PTBs (Enoki pays gas; the user signs):
 *  - mint: withdraw the buyer's USDC via `tx.balance` and escrow it (the module
 *    skims the protocol fee to the treasury, both from the on-chain config).
 *  - claim: bind the card to the caller by presenting the secret.
 *  - redeem: release `amount` from escrow to the issuing merchant.
 */
const GIFT_PKG = ENV.briskGiftCardPkg;

export function buildMintGiftCardTx(input: {
  sender: string;
  merchantId: string;
  faceMicros: number | bigint;
  claimHash: Uint8Array;
}): Transaction {
  const tx = new Transaction();
  const funds = tx.balance({ type: USDC, balance: BigInt(input.faceMicros) });
  tx.moveCall({
    target: `${GIFT_PKG}::gift_card::mint`,
    typeArguments: [USDC],
    arguments: [
      tx.object(ENV.giftCardConfigId),
      tx.object(input.merchantId),
      funds,
      tx.pure.u64(BigInt(input.faceMicros)),
      tx.pure.vector("u8", Array.from(input.claimHash)),
      tx.object(CLOCK_OBJECT_ID),
    ],
  });
  tx.setSender(input.sender);
  return tx;
}

export function buildClaimGiftCardTx(input: {
  sender: string;
  cardId: string;
  secret: Uint8Array;
}): Transaction {
  const tx = new Transaction();
  tx.moveCall({
    target: `${GIFT_PKG}::gift_card::claim`,
    typeArguments: [USDC],
    arguments: [tx.object(input.cardId), tx.pure.vector("u8", Array.from(input.secret))],
  });
  tx.setSender(input.sender);
  return tx;
}

export function buildRedeemGiftCardTx(input: {
  sender: string;
  cardId: string;
  merchantId: string;
  amountMicros: number | bigint;
}): Transaction {
  const tx = new Transaction();
  tx.moveCall({
    target: `${GIFT_PKG}::gift_card::redeem`,
    typeArguments: [USDC],
    arguments: [
      tx.object(input.cardId),
      tx.object(input.merchantId),
      tx.pure.u64(BigInt(input.amountMicros)),
    ],
  });
  tx.setSender(input.sender);
  return tx;
}

/** Re-gift a held card onward: reset its recipient + install a new claim hash so
 *  a fresh secret link can be shared. Only the current recipient may regift. */
export function buildRegiftGiftCardTx(input: {
  sender: string;
  cardId: string;
  claimHash: Uint8Array;
}): Transaction {
  const tx = new Transaction();
  tx.moveCall({
    target: `${GIFT_PKG}::gift_card::regift`,
    typeArguments: [USDC],
    arguments: [tx.object(input.cardId), tx.pure.vector("u8", Array.from(input.claimHash))],
  });
  tx.setSender(input.sender);
  return tx;
}

// `mint` withdraws USDC via `tx.balance` (the CoinWithBalance intent), which
// injects framework coin/balance ops into the built PTB — Enoki rejects the
// sponsorship unless every injected target is declared too (mirrors DEPOSIT_TARGETS
// in vaultTx.ts). All entries are a subset of the backend serverAllowedTargets.
const SUI_FW = "0x0000000000000000000000000000000000000000000000000000000000000002";
export const MINT_GIFT_CARD_TARGETS = [
  `${GIFT_PKG}::gift_card::mint`,
  `${SUI_FW}::coin::redeem_funds`,
  `${SUI_FW}::coin::into_balance`,
  `${SUI_FW}::coin::send_funds`,
  `${SUI_FW}::coin::destroy_zero`,
  `${SUI_FW}::balance::redeem_funds`, // balance-output path of tx.balance()
];
export const CLAIM_GIFT_CARD_TARGETS = [`${GIFT_PKG}::gift_card::claim`];
export const REDEEM_GIFT_CARD_TARGETS = [`${GIFT_PKG}::gift_card::redeem`];
export const REGIFT_GIFT_CARD_TARGETS = [`${GIFT_PKG}::gift_card::regift`];

const PKG = ENV.briskPackageId;

/**
 * Receipt leg of a two-leg payment (see services/blockchain/payments). The money
 * moves in a separate native-gasless `send_funds` transfer (the demonstration +
 * source of truth); THIS sponsored PTB calls `payment_receipt::record_payment`
 * to mint the soulbound `Receipt` + emit `PaymentMade` WITHOUT moving a coin — so
 * it carries no `FundsWithdrawal` and Enoki sponsors it trivially. `payee`/
 * `merchant` are still read on-chain from the `&Merchant`; `amount`/`memo`/
 * `invoiceId` are attested by the payer.
 *
 * Called at `briskRecordPkg` (the upgraded package that introduced
 * `record_payment`); everything else stays on `briskPackageId`.
 */
export function buildRecordPaymentTx(input: {
  payer: string;
  merchantId: string;
  amountMicros: number | bigint;
  memo: string;
  invoiceId: string;
}): Transaction {
  const tx = new Transaction();
  tx.setSender(input.payer);
  tx.moveCall({
    target: `${ENV.briskRecordPkg}::payment_receipt::record_payment`,
    typeArguments: [USDC],
    arguments: [
      tx.object(input.merchantId),
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

/** Allowlist for the sponsored receipt leg (no funds move; just records). */
export const RECORD_PAYMENT_TARGETS = [`${ENV.briskRecordPkg}::payment_receipt::record_payment`];

/** Allowlist for the sponsored merchant-onboarding PTB. */
export const REGISTER_MERCHANT_TARGETS = [`${PKG}::merchant_registry::register_and_share`];

// ─── Till (merchant receiving account) PTB builders ─────────────────────────
// Tills live in the upgraded `briskTillPkg`. Creating/sweeping/managing a till
// runs sponsored; customer payments still go to the till's address via the
// native-gasless transfer above (payee = till receiving address).

const TILL_PKG = ENV.briskTillPkg;
// The on-chain funds accumulator root (well-known system shared object @0xacc),
// which sweep reads to size the withdrawal.
const ACCUMULATOR_ROOT_ID = normalizeSuiObjectId("0xacc");

/**
 * Create a named receiving account ("till") for a merchant. Cap-gated on-chain:
 * the sender must own the `MerchantCap` for `merchantId`. `treasury` is the sweep
 * destination — typically the merchant's own (private) address.
 */
export function buildCreateTillTx(input: {
  sender: string;
  capId: string;
  merchantId: string;
  name: string;
  treasury: string;
}): Transaction {
  const tx = new Transaction();
  tx.setSender(input.sender);
  tx.moveCall({
    target: `${TILL_PKG}::till::create_till`,
    arguments: [
      tx.object(input.capId),
      tx.object(input.merchantId),
      tx.pure.string(input.name),
      tx.pure.address(input.treasury),
    ],
  });
  return tx;
}

/**
 * Sweep a till's accumulated USDC to its recorded treasury. Permissionless
 * on-chain (destination is read from the till), so this is the "Move to treasury"
 * action a merchant taps; the daily auto-sweep runs the same call server-side.
 */
export function buildSweepTillTx(input: { sender: string; tillId: string }): Transaction {
  const tx = new Transaction();
  tx.setSender(input.sender);
  tx.moveCall({
    target: `${TILL_PKG}::till::sweep`,
    typeArguments: [USDC],
    arguments: [tx.object(input.tillId), tx.object(ACCUMULATOR_ROOT_ID)],
  });
  return tx;
}

/** Repoint a till's sweep destination (cap-gated on-chain). */
export function buildSetTillTreasuryTx(input: {
  sender: string;
  capId: string;
  merchantId: string;
  tillId: string;
  treasury: string;
}): Transaction {
  const tx = new Transaction();
  tx.setSender(input.sender);
  tx.moveCall({
    target: `${TILL_PKG}::till::set_treasury`,
    arguments: [
      tx.object(input.capId),
      tx.object(input.merchantId),
      tx.object(input.tillId),
      tx.pure.address(input.treasury),
    ],
  });
  return tx;
}

/** Rename a till (cap-gated on-chain). */
export function buildRenameTillTx(input: {
  sender: string;
  capId: string;
  merchantId: string;
  tillId: string;
  name: string;
}): Transaction {
  const tx = new Transaction();
  tx.setSender(input.sender);
  tx.moveCall({
    target: `${TILL_PKG}::till::rename`,
    arguments: [
      tx.object(input.capId),
      tx.object(input.merchantId),
      tx.object(input.tillId),
      tx.pure.string(input.name),
    ],
  });
  return tx;
}

/** Enable/disable a till (cap-gated on-chain). Disabling = "remove" in the UI. */
export function buildSetTillActiveTx(input: {
  sender: string;
  capId: string;
  merchantId: string;
  tillId: string;
  active: boolean;
}): Transaction {
  const tx = new Transaction();
  tx.setSender(input.sender);
  tx.moveCall({
    target: `${TILL_PKG}::till::set_active`,
    arguments: [
      tx.object(input.capId),
      tx.object(input.merchantId),
      tx.object(input.tillId),
      tx.pure.bool(input.active),
    ],
  });
  return tx;
}

export const CREATE_TILL_TARGETS = [`${TILL_PKG}::till::create_till`];
export const SWEEP_TILL_TARGETS = [`${TILL_PKG}::till::sweep`];
export const SET_TILL_TREASURY_TARGETS = [`${TILL_PKG}::till::set_treasury`];
export const RENAME_TILL_TARGETS = [`${TILL_PKG}::till::rename`];
export const SET_TILL_ACTIVE_TARGETS = [`${TILL_PKG}::till::set_active`];
