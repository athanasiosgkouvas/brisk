import { ENV } from "@/utils/constants";
import { getSuiClientForBuild } from "@/services/blockchain/suiClient";

/**
 * Reads `PaymentMade` events (emitted by payment_receipt::issue) — the canonical
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

/** Recent activity for an address (both sent and received), newest first. */
export async function queryActivity(address: string, limit = 30): Promise<ActivityItem[]> {
  const client = await getSuiClientForBuild();
  const res = await client.queryEvents({
    query: { MoveEventType: PAYMENT_EVENT_TYPE },
    limit,
    order: "descending",
  });
  const items: ActivityItem[] = [];
  for (const raw of (res?.data ?? []) as unknown[]) {
    const p = parsePaymentEvent(raw);
    if (!p) continue;
    if (p.payer === address) {
      items.push({
        direction: "sent",
        counterparty: p.payee,
        amountMicros: p.amountMicros,
        timestampMs: p.timestampMs,
        digest: p.digest,
      });
    } else if (p.payee === address) {
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
