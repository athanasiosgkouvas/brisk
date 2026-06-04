import { toBase64 } from "@mysten/sui/utils";

import type { AuthSession } from "@/types/user";
import { enokiAuthService } from "@/services/auth/enokiAuth";
import { executeSponsored } from "@/services/blockchain/sponsoredExec";
import { getSuiClientForBuild, suiClient } from "@/services/blockchain/suiClient";
import {
  buildGaslessTransferTx,
  buildPaymentWithReceiptTx,
  PAY_WITH_RECEIPT_TARGETS,
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
 * Pay a merchant invoice, feeless to the user, in one atomic Enoki-sponsored PTB:
 * `payment_receipt::pay` moves the USDC to the merchant, mints the soulbound
 * Receipt, and emits `PaymentMade` (which powers the activity feed). The coin is
 * sourced via CoinWithBalance, so it works whether the payer's USDC sits in the
 * Address Balance or in owned coins.
 */
export async function payInvoice(session: AuthSession, invoice: Invoice): Promise<PayResult> {
  const client = await getSuiClientForBuild();
  const tx = buildPaymentWithReceiptTx({
    payer: session.address,
    merchantId: invoice.merchantId,
    amountMicros: invoice.amountMicros,
    memo: invoice.merchant,
    invoiceId: invoice.invoiceId,
  });
  const txKindBytes = toBase64(await tx.build({ client, onlyTransactionKind: true }));
  const { digest } = await executeSponsored({
    session,
    txKindBytes,
    allowedMoveCallTargets: PAY_WITH_RECEIPT_TARGETS,
  });
  return { digest, method: "sponsored", receiptIssued: true };
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
