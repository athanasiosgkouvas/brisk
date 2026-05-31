import { toBase64 } from "@mysten/sui/utils";

import type { AuthSession } from "@/types/user";
import { enokiAuthService } from "@/services/auth/enokiAuth";
import { executeSponsored } from "@/services/blockchain/sponsoredExec";
import { getSuiClientForBuild, suiClient } from "@/services/blockchain/suiClient";
import {
  buildGaslessTransferTx,
  buildSponsoredTransferTx,
  TRANSFER_TARGETS,
  type Invoice,
} from "@/services/blockchain/paymentTx";
import { ENV } from "@/utils/constants";

export type PayResult = { digest: string; method: "gasless" | "sponsored" };

/**
 * Pay an invoice, feeless to the user. Tries the native-gasless path first
 * (protocol charges no gas); if building/submitting that fails (e.g. JSON-RPC
 * gas-zeroing quirks), falls back to an Enoki-sponsored transfer (Enoki pays
 * gas). Either way the user is charged exactly the invoice amount.
 */
export async function payInvoice(session: AuthSession, invoice: Invoice): Promise<PayResult> {
  try {
    const client = await getSuiClientForBuild();
    const tx = buildGaslessTransferTx({
      sender: session.address,
      payee: invoice.payee,
      amountMicros: invoice.amountMicros,
    });
    const bytes: Uint8Array = await tx.build({ client });
    const bytesB64 = toBase64(bytes);
    // signSponsoredTransaction just produces a zkLogin signature over the bytes;
    // for this self-built (unsponsored) tx that single signature is sufficient.
    const signature = await enokiAuthService.signSponsoredTransaction(bytesB64, session);
    const res = await client.executeTransactionBlock({
      transactionBlock: bytesB64,
      signature,
      options: { showEffects: true },
    });
    const status = res?.effects?.status?.status;
    if (status && status !== "success") {
      throw new Error(`gasless tx status ${status}`);
    }
    return { digest: res.digest, method: "gasless" };
  } catch {
    // Fallback: Enoki-sponsored transfer (proven path).
    const client = await getSuiClientForBuild();
    const tx = buildSponsoredTransferTx({
      payee: invoice.payee,
      amountMicros: invoice.amountMicros,
    });
    const txKindBytes = toBase64(await tx.build({ client, onlyTransactionKind: true }));
    const { digest } = await executeSponsored({
      session,
      txKindBytes,
      allowedMoveCallTargets: TRANSFER_TARGETS,
    });
    return { digest, method: "sponsored" };
  }
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
