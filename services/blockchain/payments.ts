import { toBase64 } from "@mysten/sui/utils";

import type { AuthSession } from "@/types/user";
import { enokiAuthService } from "@/services/auth/enokiAuth";
import { executeSponsored } from "@/services/blockchain/sponsoredExec";
import { getSuiClientForBuild, suiClient } from "@/services/blockchain/suiClient";
import {
  buildGaslessTransferTx,
  buildReceiptOnlyTx,
  RECEIPT_LOYALTY_TARGETS,
  type Invoice,
} from "@/services/blockchain/paymentTx";
import { ENV } from "@/utils/constants";

export type PayResult = {
  digest: string;
  method: "gasless" | "sponsored";
  /** Whether the on-chain receipt + cashback leg minted. The payment settles
   *  regardless (leg 1 moves the money); this just tells the UI whether the
   *  receipt/loyalty record is on-chain yet. */
  receiptIssued: boolean;
};

/**
 * Pay a merchant invoice in two legs, both feeless to the user:
 *   1. Move USDC to the merchant via native-gasless `send_funds` (protocol gas
 *      = 0, submitted straight to the fullnode). The fullnode fully supports
 *      withdrawing from the payer's Address Balance.
 *   2. Mint the on-chain Receipt + cashback via a separate Enoki-sponsored tx
 *      that touches no balance (only `Pure` inputs), so it's gas-station-safe.
 *
 * They're split because a single sponsored PTB that withdraws from the Address
 * Balance emits a `CallArg::FundsWithdrawal` the Enoki gas station can't yet
 * deserialize ("Invalid bcs bytes for TransactionData"). The transfer is the
 * source of truth for the payment; the receipt leg is best-effort and never
 * blocks settlement. `now` is the client timestamp stamped into the receipt.
 */
export async function payInvoice(
  session: AuthSession,
  invoice: Invoice,
  now: number,
): Promise<PayResult> {
  // Leg 1 — the money. This is what settles the payment.
  const transfer = await payGasless(session, invoice.payee, invoice.amountMicros);

  // Leg 2 — receipt + cashback. Best-effort: a hiccup here must not fail a
  // payment whose funds already moved. `receiptIssued` lets the UI flag it.
  let receiptIssued = false;
  try {
    const client = await getSuiClientForBuild();
    const tx = buildReceiptOnlyTx({
      payer: session.address,
      payee: invoice.payee,
      amountMicros: invoice.amountMicros,
      memo: invoice.merchant,
      invoiceId: invoice.invoiceId,
      timestampMs: now,
    });
    const txKindBytes = toBase64(await tx.build({ client, onlyTransactionKind: true }));
    await executeSponsored({
      session,
      txKindBytes,
      allowedMoveCallTargets: RECEIPT_LOYALTY_TARGETS,
    });
    receiptIssued = true;
  } catch (e) {
    console.warn("[brisk-pay] receipt/cashback leg failed (payment still settled):", e);
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
}): Promise<boolean> {
  const timeoutMs = input.timeoutMs ?? 60_000;
  const intervalMs = input.intervalMs ?? 2_000;
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const current = await getUsdcBalanceMicros(input.merchant).catch(() => input.baselineMicros);
    if (current - input.baselineMicros >= input.expectedMicros) return true;
    await new Promise((r) => setTimeout(r, intervalMs));
  }
  return false;
}
