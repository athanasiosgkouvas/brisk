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

export type PayResult = { digest: string; method: "gasless" | "sponsored" };

/**
 * Pay a merchant invoice: an Enoki-sponsored PTB that atomically moves USDC to
 * the merchant AND mints an on-chain Receipt for the payer. Feeless to the user
 * (Enoki covers gas), charged exactly the invoice amount. `now` is the client
 * timestamp stamped into the receipt.
 */
export async function payInvoice(
  session: AuthSession,
  invoice: Invoice,
  now: number,
): Promise<PayResult> {
  const client = await getSuiClientForBuild();
  const tx = buildPaymentWithReceiptTx({
    payer: session.address,
    payee: invoice.payee,
    amountMicros: invoice.amountMicros,
    memo: invoice.merchant,
    invoiceId: invoice.invoiceId,
    timestampMs: now,
  });
  const txKindBytes = toBase64(await tx.build({ client, onlyTransactionKind: true }));
  const { digest } = await executeSponsored({
    session,
    txKindBytes,
    allowedMoveCallTargets: PAY_WITH_RECEIPT_TARGETS,
  });
  return { digest, method: "sponsored" };
}

/**
 * Plain peer-to-peer transfer with NO receipt — the native-gasless showcase
 * (protocol charges zero gas). Kept for a future "send to a friend" flow.
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
  return { digest: res.digest, method: "gasless" };
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
