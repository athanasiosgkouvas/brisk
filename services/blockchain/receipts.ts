import { ENV } from "@/utils/constants";
import { fetchAddressTransactions, type TxHistoryNode } from "@/services/blockchain/txHistory";

/**
 * The activity feed = on-chain USDC movements. We read the address's transaction
 * history and keep the ones with a net USDC balance change for the user, pairing
 * each with its counterparty. This captures Brisk's native-gasless `send_funds`
 * payments and P2P sends (the protocol-level zero-gas demo) — the money moving is
 * the source of truth. The best-effort `record_payment` receipt leg mints no coin
 * (no balance change), so it never double-counts; Save deposits/withdrawals pair
 * with a shared pool object (not an address), so they're excluded.
 */

const USDC = ENV.usdcType;

export type ActivityItem = {
  direction: "sent" | "received";
  counterparty: string;
  amountMicros: number;
  timestampMs: number;
  digest: string;
};

/** Turn one tx's USDC balance changes into an activity item for `address`, or null. */
function toItem(tx: TxHistoryNode, address: string): ActivityItem | null {
  const usdc = tx.balanceChanges.filter((b) => b.coinType === USDC && b.address);
  let mine = 0n;
  for (const b of usdc) if (b.address === address) mine += BigInt(b.amount);
  if (mine === 0n) return null; // no net USDC change for the user (e.g. Save op)

  const sent = mine < 0n;
  // Counterparty = the other address whose USDC moved the opposite way.
  let counterparty = "";
  let best = 0n;
  for (const b of usdc) {
    const owner = b.address;
    if (!owner || owner === address) continue;
    const amt = BigInt(b.amount);
    if (sent ? amt > 0n : amt < 0n) {
      const mag = amt < 0n ? -amt : amt;
      if (mag > best) {
        best = mag;
        counterparty = owner;
      }
    }
  }

  return {
    direction: sent ? "sent" : "received",
    counterparty,
    amountMicros: Number(mine < 0n ? -mine : mine),
    timestampMs: tx.timestampMs,
    digest: tx.digest,
  };
}

/** Recent USDC activity for an address (both sent and received), newest first. */
export async function queryActivity(address: string, limit = 30): Promise<ActivityItem[]> {
  // `affectedAddress` captures txs the address sent OR received, so a single
  // query covers both legs; direction is derived from the net balance change.
  const txs = await fetchAddressTransactions(address, { direction: "affected", last: 50 }).catch(
    () => [] as TxHistoryNode[],
  );

  const byDigest = new Map<string, ActivityItem>();
  for (const tx of txs) {
    const item = toItem(tx, address);
    if (item && item.digest && !byDigest.has(item.digest)) byDigest.set(item.digest, item);
  }
  return [...byDigest.values()].sort((a, b) => b.timestampMs - a.timestampMs).slice(0, limit);
}
