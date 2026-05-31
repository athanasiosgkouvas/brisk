import { toBase64 } from "@mysten/sui/utils";

import type { AuthSession } from "@/types/user";
import { executeSponsored } from "@/services/blockchain/sponsoredExec";
import { getSuiClientForBuild } from "@/services/blockchain/suiClient";
import { payGasless, type PayResult } from "@/services/blockchain/payments";
import { buildSponsoredTransferTx, TRANSFER_TARGETS } from "@/services/blockchain/paymentTx";
import { ENV } from "@/utils/constants";

/**
 * Wallet basics: spendable USDC balance + sending USDC out to an address.
 *
 * Balance uses the unified `core.getBalance`, whose response includes
 * `addressBalance` — so funds received via gasless `send_funds` (which land in
 * the Address-Balance accumulator, not coin objects) are counted. `balance.balance`
 * is the true total (coins + address balance).
 */

export async function getSpendableUsdcMicros(owner: string): Promise<number> {
  const client = await getSuiClientForBuild();
  const res = await client.core.getBalance({ owner, coinType: ENV.usdcType });
  return Number(res?.balance?.balance ?? "0");
}

/** Sui addresses are 0x + up to 64 hex chars. */
export function isValidSuiAddress(addr: string): boolean {
  return /^0x[0-9a-fA-F]{1,64}$/.test(addr.trim());
}

/**
 * Send USDC to an external address — feeless. Tries native-gasless `send_funds`
 * first, falls back to an Enoki-sponsored transfer if that can't be submitted.
 */
export async function sendUsdc(
  session: AuthSession,
  toAddress: string,
  amountMicros: number,
): Promise<PayResult> {
  const to = toAddress.trim();
  try {
    return await payGasless(session, to, amountMicros);
  } catch {
    const client = await getSuiClientForBuild();
    const tx = buildSponsoredTransferTx({ payee: to, amountMicros });
    const txKindBytes = toBase64(await tx.build({ client, onlyTransactionKind: true }));
    const { digest } = await executeSponsored({
      session,
      txKindBytes,
      allowedMoveCallTargets: TRANSFER_TARGETS,
    });
    return { digest, method: "sponsored" };
  }
}
