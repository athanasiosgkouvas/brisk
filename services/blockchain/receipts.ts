import { ENV } from "@/utils/constants";
import { getSuiClientForBuild } from "@/services/blockchain/suiClient";

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

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function addressOwner(owner: any): string | null {
  return owner && typeof owner === "object" && "AddressOwner" in owner ? owner.AddressOwner : null;
}

/** Turn one tx's USDC balance changes into an activity item for `address`, or null. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function toItem(tx: any, address: string): ActivityItem | null {
  const usdc = (tx?.balanceChanges ?? []).filter(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (b: any) => b?.coinType === USDC && addressOwner(b.owner),
  );
  let mine = 0n;
  for (const b of usdc) if (addressOwner(b.owner) === address) mine += BigInt(b.amount);
  if (mine === 0n) return null; // no net USDC change for the user (e.g. Save op)

  const sent = mine < 0n;
  // Counterparty = the other address whose USDC moved the opposite way.
  let counterparty = "";
  let best = 0n;
  for (const b of usdc) {
    const owner = addressOwner(b.owner);
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
    timestampMs: Number(tx?.timestampMs ?? 0),
    digest: tx?.digest ?? "",
  };
}

/** Recent USDC activity for an address (both sent and received), newest first. */
export async function queryActivity(address: string, limit = 30): Promise<ActivityItem[]> {
  const client = await getSuiClientForBuild();
  const opts = { showBalanceChanges: true } as const;
  const [out, inc] = await Promise.all([
    client
      .queryTransactionBlocks({
        filter: { FromAddress: address },
        options: opts,
        limit: 25,
        order: "descending",
      })
      .catch(() => ({ data: [] as unknown[] })),
    client
      .queryTransactionBlocks({
        filter: { ToAddress: address },
        options: opts,
        limit: 25,
        order: "descending",
      })
      .catch(() => ({ data: [] as unknown[] })),
  ]);

  const byDigest = new Map<string, ActivityItem>();
  for (const tx of [...(out?.data ?? []), ...(inc?.data ?? [])] as unknown[]) {
    const item = toItem(tx, address);
    if (item && item.digest && !byDigest.has(item.digest)) byDigest.set(item.digest, item);
  }
  return [...byDigest.values()].sort((a, b) => b.timestampMs - a.timestampMs).slice(0, limit);
}
