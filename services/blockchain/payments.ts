import { toBase64, fromBase64 } from "@mysten/sui/utils";

import type { AuthSession } from "@/types/user";
import { enokiAuthService } from "@/services/auth/enokiAuth";
import { executeSponsored } from "@/services/blockchain/sponsoredExec";
import { getSuiClientForBuild, suiClient } from "@/services/blockchain/suiClient";
import { fetchAddressTransactions } from "@/services/blockchain/txHistory";
import {
  buildGaslessTransferTx,
  buildRecordPaymentTx,
  RECORD_PAYMENT_TARGETS,
  type Invoice,
} from "@/services/blockchain/paymentTx";
import { ENV } from "@/utils/constants";

export type PayResult = {
  digest: string;
  method: "gasless" | "sponsored";
  /** Whether the on-chain receipt was minted. The payment settles regardless
   *  (the money always moves); this tells the UI whether the receipt is on-chain
   *  (atomic path) or the gasless fallback was used (no receipt). */
  receiptIssued: boolean;
};

/**
 * Pay a merchant invoice, feeless to the user, as two legs:
 *
 *  1. SETTLEMENT — native-gasless `send_funds<USDC>` straight to the fullnode.
 *     The money moves at zero protocol gas with no sponsor: Brisk's whole thesis,
 *     and the source of truth (it also shows in Activity as a USDC transfer).
 *  2. RECEIPT (best-effort) — a sponsored `record_payment` that mints the
 *     soulbound Receipt + emits PaymentMade, recording merchant-bound commerce
 *     without moving a coin. If it fails (e.g. Enoki hiccup), the payment has
 *     already settled in leg 1 — we just don't mint the receipt.
 *
 * `receiptIssued` reports whether leg 2 succeeded.
 */
export async function payInvoice(session: AuthSession, invoice: Invoice): Promise<PayResult> {
  // Leg 1: the money moves (native gasless). Throws propagate — this must succeed.
  const transfer = await payGasless(session, invoice.payee, invoice.amountMicros);

  // P2P (no merchant): the transfer IS the whole payment — there's no Merchant
  // object to bind a receipt to, so skip leg 2 entirely.
  if (!invoice.merchantId) {
    return { digest: transfer.digest, method: "gasless", receiptIssued: false };
  }

  // Leg 2: best-effort on-chain receipt. Never block the (already-settled) payment.
  let receiptIssued = false;
  try {
    const client = await getSuiClientForBuild();
    const tx = buildRecordPaymentTx({
      payer: session.address,
      merchantId: invoice.merchantId,
      amountMicros: invoice.amountMicros,
      memo: invoice.merchant,
      invoiceId: invoice.invoiceId,
    });
    const txKindBytes = toBase64(await tx.build({ client, onlyTransactionKind: true }));
    await executeSponsored({
      session,
      txKindBytes,
      allowedMoveCallTargets: RECORD_PAYMENT_TARGETS,
    });
    receiptIssued = true;
  } catch (e) {
    console.warn(
      "[brisk-pay] receipt leg failed (payment already settled):",
      e instanceof Error ? e.message : e,
    );
  }
  return { digest: transfer.digest, method: "gasless", receiptIssued };
}

/**
 * Native-gasless USDC transfer — the protocol-level zero-gas showcase. Builds a
 * bare `send_funds<USDC>` (gas price/budget 0), signs it with the user's zkLogin
 * key, and submits straight to the fullnode (no gas station). Works whether the
 * funds sit in coin objects or the Address Balance accumulator.
 */
export async function payGasless(
  session: AuthSession,
  payee: string,
  amountMicros: number,
): Promise<PayResult> {
  const client = await getSuiClientForBuild();
  const tx = buildGaslessTransferTx({ sender: session.address, payee, amountMicros });
  const bytes = await tx.build({ client });
  const bytesB64 = toBase64(bytes);
  const signature = await enokiAuthService.signSponsoredTransaction(bytesB64, session);
  const res = await client.executeTransaction({
    transaction: fromBase64(bytesB64),
    signatures: [signature],
    include: { effects: true },
  });
  // This is the SETTLEMENT leg — the money must actually move. executeTransaction
  // does NOT throw on an on-chain abort (it returns $kind:"FailedTransaction"), so
  // surface a failure here rather than reporting a payment that never settled.
  const txn = res.Transaction ?? res.FailedTransaction;
  if (res.$kind !== "Transaction" || !txn) {
    throw new Error(
      `gasless transfer failed to settle (${txn?.effects?.status?.error?.message ?? txn?.digest ?? "unknown"})`,
    );
  }
  // A bare transfer has no receipt leg, so nothing is pending.
  return { digest: txn.digest, method: "gasless", receiptIssued: true };
}

/** Current USDC balance (micro-units) for an address. */
export async function getUsdcBalanceMicros(owner: string): Promise<number> {
  const res = await suiClient.getBalance({ owner, coinType: ENV.usdcType });
  return Number(res.totalBalance ?? "0");
}

/**
 * Find the on-chain digest of the incoming USDC payment that just credited a
 * till. Used by the ERP/terminal flow: the merchant device has no digest of its
 * own (the customer signs the transfer), so after settlement we look up the
 * crediting transaction from the till's history and report its digest.
 *
 * Matches the newest transaction with a positive USDC credit to `till` of at
 * least `amountMicros`, restricted to `sinceMs` (with slack) so an older
 * identical-amount payment can't be mistaken for this one. Retries to ride out
 * GraphQL indexing lag (settlement is detected via balance, which can be indexed
 * a beat before the tx is queryable).
 */
export async function findIncomingDigest(input: {
  till: string;
  amountMicros: number;
  sinceMs: number;
  attempts?: number;
  intervalMs?: number;
}): Promise<string | null> {
  const attempts = input.attempts ?? 8;
  const intervalMs = input.intervalMs ?? 1_500;
  const till = input.till.toLowerCase();
  // Clock-skew slack between device time (sinceMs) and on-chain timestamps.
  const floorMs = input.sinceMs - 60_000;

  for (let i = 0; i < attempts; i++) {
    if (i > 0) await new Promise((r) => setTimeout(r, intervalMs));
    try {
      const txs = await fetchAddressTransactions(input.till, { direction: "affected", last: 25 });
      const match = txs.find(
        (tx) =>
          tx.timestampMs >= floorMs &&
          tx.balanceChanges.some(
            (bc) =>
              (bc.address ?? "").toLowerCase() === till &&
              bc.coinType === ENV.usdcType &&
              Number(bc.amount) >= input.amountMicros,
          ),
      );
      if (match?.digest) return match.digest;
    } catch {
      // transient GraphQL error — keep retrying until attempts run out
    }
  }
  return null;
}

/**
 * Merchant settlement detection: poll the merchant's USDC balance until it rises
 * by at least `expectedMicros` above `baselineMicros`. Resolves true on receipt,
 * false on timeout.
 */
export async function waitForSettlement(input: {
  merchant: string;
  baselineMicros: number;
  expectedMicros: number;
  timeoutMs?: number;
  intervalMs?: number;
  // Custom balance reader. Tills receive into the address-balance accumulator, so
  // they must be polled via an accumulator-aware reader (getSpendableUsdcMicros)
  // rather than the default coin-balance reader.
  readBalance?: (owner: string) => Promise<number>;
}): Promise<boolean> {
  const timeoutMs = input.timeoutMs ?? 60_000;
  const intervalMs = input.intervalMs ?? 2_000;
  const read = input.readBalance ?? getUsdcBalanceMicros;
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const current = await read(input.merchant).catch(() => input.baselineMicros);
    if (current - input.baselineMicros >= input.expectedMicros) return true;
    await new Promise((r) => setTimeout(r, intervalMs));
  }
  return false;
}
