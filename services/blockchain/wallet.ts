import type { AuthSession } from "@/types/user";
import { getSuiClientForBuild } from "@/services/blockchain/suiClient";
import { payGasless, type PayResult } from "@/services/blockchain/payments";
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
 * Send USDC to an external address — feeless to the user via native-gasless
 * `send_funds` (protocol gas = 0, no SUI needed, submitted straight to the
 * fullnode). Charged exactly the amount. This avoids the Enoki gas station,
 * which can't yet sponsor Address-Balance withdrawals (`FundsWithdrawal`).
 */
export async function sendUsdc(
  session: AuthSession,
  toAddress: string,
  amountMicros: number,
): Promise<PayResult> {
  return payGasless(session, toAddress.trim(), amountMicros);
}
