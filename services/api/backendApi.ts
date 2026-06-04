import { ENV } from "@/utils/constants";

type SponsorResponse = {
  bytes: string;
  digest: string;
};

async function backendFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const headers = new Headers(init?.headers);
  if (!headers.has("Content-Type") && init?.body) {
    headers.set("Content-Type", "application/json");
  }

  const response = await fetch(`${ENV.backendUrl}${path}`, {
    ...init,
    headers,
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(text || `Backend request failed (${response.status})`);
  }

  return (await response.json()) as T;
}

export async function sponsorTransaction(input: {
  sender: string;
  transactionKindBytes: string;
  allowedMoveCallTargets?: string[];
  allowedAddresses?: string[];
}): Promise<SponsorResponse> {
  return backendFetch<SponsorResponse>("/api/sponsor", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export async function executeSponsoredTransaction(input: {
  digest: string;
  signature: string;
}): Promise<{ digest: string }> {
  return backendFetch<{ digest: string }>("/api/execute", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export async function requestFaucet(address: string): Promise<{
  accepted: boolean;
  message?: string;
  redirectUrl?: string;
}> {
  return backendFetch<{
    accepted: boolean;
    message?: string;
    redirectUrl?: string;
  }>("/api/faucet/request", {
    method: "POST",
    body: JSON.stringify({ address }),
  });
}

export type ResolvedLink = {
  merchantId: string;
  payee: string;
  amountMicros: number;
  invoiceId: string;
  merchant: string;
  status: "pending" | "paid";
  reusable: boolean;
};

export type LinkSummary = {
  code: string;
  url: string;
  amountMicros: number;
  merchant: string;
  status: "pending" | "paid" | "expired" | "canceled";
  reusable: boolean;
  createdAt: string | null;
  expiresAt: string | null;
};

/** Mint a shareable payment link for an invoice. Returns the short code + url. */
export async function createPaymentLink(input: {
  sender: string;
  merchantId: string;
  payee: string;
  amountMicros: number;
  invoiceId: string;
  merchant: string;
  expiresInSec?: number;
}): Promise<{ code: string; url: string }> {
  return backendFetch<{ code: string; url: string }>("/api/links", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

/** Resolve a payment-link code into its invoice (throws on 404/410/expired). */
export async function resolvePaymentLink(code: string): Promise<ResolvedLink> {
  return backendFetch<ResolvedLink>(`/api/links/${code}`);
}

/** Best-effort report that a link settled, so the merchant sees it as paid. */
export async function markPaymentLinkPaid(code: string, digest: string): Promise<void> {
  await backendFetch<{ ok: boolean; updated: boolean }>(`/api/links/${code}/paid`, {
    method: "POST",
    body: JSON.stringify({ digest }),
  });
}

/** All payment links a merchant created (newest first), for the manage screen. */
export async function listPaymentLinks(merchant: string): Promise<LinkSummary[]> {
  const res = await backendFetch<{ links: LinkSummary[] }>(
    `/api/links?merchant=${encodeURIComponent(merchant)}`,
  );
  return res.links;
}

/** Cancel (void) an unpaid link. Only the creator (`sender`) may cancel it. */
export async function cancelPaymentLink(code: string, sender: string): Promise<void> {
  await backendFetch<{ ok: boolean }>(`/api/links/${code}/cancel`, {
    method: "POST",
    body: JSON.stringify({ sender }),
  });
}

export type SponsorshipQuota = {
  usedCount: number;
  dailyLimit: number;
  remaining: number;
  windowMs: number;
};

export async function fetchSponsorshipQuota(address: string): Promise<SponsorshipQuota> {
  return backendFetch<SponsorshipQuota>(`/api/user/${address}/sponsorship`);
}

export async function trackAnalyticsEvent(event: string, properties?: Record<string, unknown>) {
  return backendFetch<{ accepted: boolean }>("/api/analytics/track", {
    method: "POST",
    body: JSON.stringify({ event, properties }),
  });
}

export async function reportError(input: {
  message: string;
  source?: string;
  stack?: string;
  metadata?: Record<string, unknown>;
}) {
  return backendFetch<{ accepted: boolean }>("/api/errors/report", {
    method: "POST",
    body: JSON.stringify(input),
  });
}
