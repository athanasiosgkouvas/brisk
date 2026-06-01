import { getSuiClientForBuild } from "@/services/blockchain/suiClient";
import { ENV } from "@/utils/constants";

const USDC = ENV.usdcType;

/**
 * Coin-object helpers for Enoki-sponsored transactions.
 *
 * TODO(enoki-fundswithdrawal): TEMPORARY. Enoki's gas station can't yet
 * BCS-deserialize a sponsored tx that withdraws USDC from the Address Balance
 * accumulator — the new `CallArg::FundsWithdrawal` input fails with
 * "Invalid bcs bytes for TransactionData". Until Enoki ships the fix (expected
 * soon), any *sponsored* tx that spends the user's USDC must source it from
 * owned Coin objects (split/merge → `CallArg::Object`), which Enoki sponsors
 * fine. When the fix lands, callers can delete the coin-sourcing and go back to
 * `tx.balance({ type, balance })` (Address-Balance withdrawal) directly.
 */

/** Spendable USDC held as Coin objects (excludes Address-Balance funds). */
export async function coinBalanceMicros(owner: string): Promise<number> {
  const client = await getSuiClientForBuild();
  const { balance } = await client.core.getBalance({ owner, coinType: USDC });
  return Number(balance.coinBalance);
}

/**
 * Coin object ids (largest-first) that together cover `amountMicros`, for use as
 * explicit inputs in a sponsored PTB. Throws a user-facing message if the
 * owner's coin holdings are short (e.g. funds are only in the Address Balance).
 */
export async function resolveSpendableCoins(
  owner: string,
  amountMicros: number,
): Promise<string[]> {
  const client = await getSuiClientForBuild();
  const { balance } = await client.core.getBalance({ owner, coinType: USDC });
  if (Number(balance.coinBalance) < amountMicros) {
    throw new Error(
      "Not enough spendable coins. Receive USDC or withdraw to your wallet first, then try again.",
    );
  }
  const { objects } = await client.core.listCoins({ owner, coinType: USDC });
  const sorted = [...objects].sort((a, b) => Number(b.balance) - Number(a.balance));
  const ids: string[] = [];
  let acc = 0n;
  for (const c of sorted) {
    ids.push(c.objectId);
    acc += BigInt(c.balance);
    if (acc >= BigInt(amountMicros)) break;
  }
  return ids;
}
