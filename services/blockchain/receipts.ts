import { ENV } from "@/utils/constants";
import { getSuiClientForBuild } from "@/services/blockchain/suiClient";

/**
 * Reads `PaymentMade` events (emitted by payment_receipt::pay) — the canonical
 * record of settled Brisk payments. A merchant lists their sales / detects a tap
 * settlement by querying these where `payee == <merchant address>`.
 */

const PAYMENT_EVENT_TYPE = `${ENV.briskPackageId}::payment_receipt::PaymentMade`;

export type PaymentEvent = {
  receipt: string;
  payer: string;
  payee: string;
  amountMicros: number;
  timestampMs: number;
  digest: string;
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function parsePaymentEvent(e: any): PaymentEvent | null {
  const j = e?.parsedJson;
  if (!j || typeof j.payee !== "string") return null;
  // Prefer the event envelope timestamp (always present); fall back to the
  // in-event field when available. Keeps this robust across event-shape changes.
  const ts = Number(e?.timestampMs ?? j.timestamp_ms ?? 0);
  return {
    receipt: j.receipt ?? "",
    payer: j.payer,
    payee: j.payee,
    amountMicros: Number(j.amount),
    timestampMs: ts,
    digest: e?.id?.txDigest ?? "",
  };
}

export type ActivityItem = {
  direction: "sent" | "received";
  counterparty: string;
  amountMicros: number;
  timestampMs: number;
  digest: string;
};

const RECEIPT_TYPE = `${ENV.briskPackageId}::payment_receipt::Receipt`;

/** "Sent" history: the caller's own soulbound Receipts (minted to the payer). */
async function querySent(address: string): Promise<ActivityItem[]> {
  const client = await getSuiClientForBuild();
  const res = await client.getOwnedObjects({
    owner: address,
    filter: { StructType: RECEIPT_TYPE },
    options: { showContent: true, showPreviousTransaction: true },
  });
  const items: ActivityItem[] = [];
  for (const o of res?.data ?? []) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const f = (o?.data?.content as any)?.fields;
    if (!f) continue;
    items.push({
      direction: "sent",
      counterparty: f.payee,
      amountMicros: Number(f.amount),
      timestampMs: Number(f.timestamp_ms ?? 0),
      digest: o?.data?.previousTransaction ?? "",
    });
  }
  return items;
}

/**
 * "Received" history: PaymentMade events where the caller is the payee. Receipts
 * are soulbound to the payer, so the merchant has no owned object to read — the
 * event is the only record. Filtered client-side (RPC can't filter by an event
 * field), so we pull a generous page.
 */
async function queryReceived(address: string, limit: number): Promise<ActivityItem[]> {
  const client = await getSuiClientForBuild();
  const res = await client.queryEvents({
    query: { MoveEventType: PAYMENT_EVENT_TYPE },
    limit,
    order: "descending",
  });
  const items: ActivityItem[] = [];
  for (const raw of (res?.data ?? []) as unknown[]) {
    const p = parsePaymentEvent(raw);
    if (p && p.payee === address) {
      items.push({
        direction: "received",
        counterparty: p.payer,
        amountMicros: p.amountMicros,
        timestampMs: p.timestampMs,
        digest: p.digest,
      });
    }
  }
  return items;
}

/** Recent activity for an address (both sent and received), newest first. */
export async function queryActivity(address: string, limit = 30): Promise<ActivityItem[]> {
  const [sent, received] = await Promise.all([
    querySent(address).catch(() => [] as ActivityItem[]),
    queryReceived(address, 50).catch(() => [] as ActivityItem[]),
  ]);
  // Dedupe by digest+direction (a self-payment could appear in both lists).
  const seen = new Set<string>();
  const merged: ActivityItem[] = [];
  for (const it of [...sent, ...received]) {
    const key = `${it.digest}-${it.direction}`;
    if (seen.has(key)) continue;
    seen.add(key);
    merged.push(it);
  }
  merged.sort((a, b) => b.timestampMs - a.timestampMs);
  return merged.slice(0, limit);
}
