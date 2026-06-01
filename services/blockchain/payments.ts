import { toBase64 } from "@mysten/sui/utils";

import type { AuthSession } from "@/types/user";
import { enokiAuthService } from "@/services/auth/enokiAuth";
import { executeSponsored } from "@/services/blockchain/sponsoredExec";
import { getSuiClientForBuild, suiClient } from "@/services/blockchain/suiClient";
import {
  buildGaslessTransferTx,
  buildPaymentWithReceiptTx,
  buildReceiptOnlyTx,
  PAY_WITH_RECEIPT_TARGETS,
  RECEIPT_LOYALTY_TARGETS,
  type Invoice,
} from "@/services/blockchain/paymentTx";
import { coinBalanceMicros, resolveSpendableCoins } from "@/services/blockchain/coins";
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
 * Pay a merchant invoice, feeless to the user. Two paths:
 *
 *  - PREFERRED (coins available): one atomic Enoki-sponsored PTB does it all —
 *    transfer USDC to the merchant + mint the on-chain Receipt + cashback. The
 *    USDC is sourced from owned Coin objects so Enoki's gas station accepts it.
 *  - FALLBACK (funds only in the Address Balance, no coins): move the money via
 *    native-gasless `send_funds` to the fullnode, then mint the receipt + cashback
 *    as a separate best-effort sponsored tx (`receiptIssued` flags if it didn't).
 *
 * TODO(enoki-fundswithdrawal): the fallback exists only because Enoki can't yet
 * sponsor an Address-Balance withdrawal (`CallArg::FundsWithdrawal` →
 * "Invalid bcs bytes for TransactionData"). When that ships, drop the
 * coin-sourcing + fallback and always use one sponsored PTB built from
 * `tx.balance(...)`. See services/blockchain/coins.ts.
 *
 * `now` is the client timestamp stamped into the receipt.
 */
export async function payInvoice(
  session: AuthSession,
  invoice: Invoice,
  now: number,
): Promise<PayResult> {
  const amount = invoice.amountMicros;

  // PREFERRED: atomic transfer + receipt + cashback, sourced from coin objects.
  if ((await coinBalanceMicros(session.address)) >= amount) {
    const client = await getSuiClientForBuild();
    const coinObjectIds = await resolveSpendableCoins(session.address, amount);
    const tx = buildPaymentWithReceiptTx({
      payer: session.address,
      payee: invoice.payee,
      amountMicros: amount,
      memo: invoice.merchant,
      invoiceId: invoice.invoiceId,
      timestampMs: now,
      coinObjectIds,
    });
    const txKindBytes = toBase64(await tx.build({ client, onlyTransactionKind: true }));
    const { digest } = await executeSponsored({
      session,
      txKindBytes,
      allowedMoveCallTargets: PAY_WITH_RECEIPT_TARGETS,
    });
    return { digest, method: "sponsored", receiptIssued: true };
  }

  // FALLBACK: native-gasless transfer (the money) + best-effort sponsored receipt.
  const transfer = await payGasless(session, invoice.payee, amount);
  let receiptIssued = false;
  try {
    const client = await getSuiClientForBuild();
    const tx = buildReceiptOnlyTx({
      payer: session.address,
      payee: invoice.payee,
      amountMicros: amount,
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
