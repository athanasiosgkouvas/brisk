import { toBase64 } from "@mysten/sui/utils";

import type { AuthSession } from "@/types/user";
import { enokiAuthService } from "@/services/auth/enokiAuth";
import { executeSponsored } from "@/services/blockchain/sponsoredExec";
import { getSuiClientForBuild, suiClient } from "@/services/blockchain/suiClient";
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
  const bytesB64 = toBase64(await tx.build({ client }));
  const signature = await enokiAuthService.signSponsoredTransaction(bytesB64, session);
  const res = await client.executeTransactionBlock({
    transactionBlock: bytesB64,
    signature,
    options: { showEffects: true },
  });
  // A bare transfer has no receipt leg, so nothing is pending.
  return { digest: res.digest, method: "gasless", receiptIssued: true };
}

/** Current USDC balance (micro-units) for an address. */
export async function getUsdcBalanceMicros(owner: string): Promise<number> {
  const res = await suiClient.getBalance({ owner, coinType: ENV.usdcType });
  return Number(res.totalBalance ?? "0");
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
