import { CONFIG } from "./config";

export type ResolvedLink = {
  merchantId: string;
  payee: string;
  tillId: string | null;
  amountMicros: number;
  invoiceId: string;
  merchant: string;
  status: "pending" | "paid";
  reusable: boolean;
};

export class LinkError extends Error {
  constructor(
    public readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = "LinkError";
  }
}

/** Resolve a payment-link code into its invoice. Throws LinkError on 404/410. */
export async function resolveLink(code: string): Promise<ResolvedLink> {
  const res = await fetch(`${CONFIG.backendUrl}/api/links/${encodeURIComponent(code)}`);
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new LinkError(res.status, text || `Could not load this request (${res.status})`);
  }
  return (await res.json()) as ResolvedLink;
}

/** Best-effort: tell the backend the link settled so the merchant sees it paid. */
export async function markPaid(code: string, digest: string): Promise<void> {
  try {
    await fetch(`${CONFIG.backendUrl}/api/links/${encodeURIComponent(code)}/paid`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ digest }),
    });
  } catch {
    // Non-fatal: the payment already settled on-chain.
  }
}

/**
 * Ask the backend for a Coinbase hosted onramp URL (buy USDC on Sui → address).
 * `surface: "web"` makes the backend return the user to the web /pay/onramp-return
 * page. Same endpoint the app uses; all Coinbase specifics stay server-side.
 */
export async function createOnrampSession(
  address: string,
  amountUsd?: number,
): Promise<{ url: string }> {
  const res = await fetch(`${CONFIG.backendUrl}/api/onramp/session`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ address, amountUsd, surface: "web" }),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(text || `Could not start Add funds (${res.status})`);
  }
  return (await res.json()) as { url: string };
}

/** Format micro-USDC (6dp) as `$1,234.56` (matches the app's formatUsd). */
export function formatUsd(micros: number): string {
  const [int, dec] = (micros / 1_000_000).toFixed(2).split(".");
  const grouped = int.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  return `$${grouped}.${dec}`;
}
