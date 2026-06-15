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
  tillId: string | null;
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
  tillId?: string;
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

export type TillSummary = {
  tillId: string;
  merchantId: string;
  treasuryAddr: string;
  name: string;
  active: boolean;
  createdAt: string | null;
  lastSweptAt: string | null;
};

/** Record a till on the backend after its on-chain create_till tx. */
export async function recordTill(input: {
  sender: string;
  tillId: string;
  merchantId: string;
  ownerAddr: string;
  treasuryAddr: string;
  name: string;
}): Promise<void> {
  await backendFetch<{ ok: boolean }>("/api/tills", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

/** List the tills a merchant owns (newest first), for the Pro management screen. */
export async function listTills(merchant: string): Promise<TillSummary[]> {
  const res = await backendFetch<{ tills: TillSummary[] }>(
    `/api/tills?merchant=${encodeURIComponent(merchant)}`,
  );
  return res.tills;
}

/** Mirror a till rename after its on-chain tx. */
export async function renameTill(tillId: string, sender: string, name: string): Promise<void> {
  await backendFetch<{ ok: boolean }>(`/api/tills/${tillId}/rename`, {
    method: "POST",
    body: JSON.stringify({ sender, name }),
  });
}

/** Mirror a till enable/disable after its on-chain tx (disable = "remove"). */
export async function setTillActive(
  tillId: string,
  sender: string,
  active: boolean,
): Promise<void> {
  await backendFetch<{ ok: boolean }>(`/api/tills/${tillId}/active`, {
    method: "POST",
    body: JSON.stringify({ sender, active }),
  });
}

export type MerchantProfile = {
  merchantId: string;
  ownerAddr: string;
  businessName: string;
  slug: string;
};

/** Create or update the caller's business profile (the merchant directory). */
export async function upsertMerchantProfile(input: {
  sender: string;
  merchantId: string;
  businessName: string;
}): Promise<MerchantProfile> {
  const res = await backendFetch<{ profile: MerchantProfile }>("/api/merchants", {
    method: "POST",
    body: JSON.stringify(input),
  });
  return res.profile;
}

/** The business profile owned by an address, or null if none. */
export async function getMerchantByOwner(address: string): Promise<MerchantProfile | null> {
  try {
    const res = await backendFetch<{ profile: MerchantProfile }>(
      `/api/merchants/by-owner/${encodeURIComponent(address)}`,
    );
    return res.profile;
  } catch {
    return null;
  }
}

/** Search the merchant directory by business name (the buy-gift-card picker). */
export async function searchMerchants(query: string): Promise<MerchantProfile[]> {
  if (query.trim().length < 2) return [];
  try {
    const res = await backendFetch<{ profiles: MerchantProfile[] }>(
      `/api/merchants/search?q=${encodeURIComponent(query.trim())}`,
    );
    return res.profiles;
  } catch {
    return [];
  }
}

/** Batch-resolve merchant ids and/or owner addresses to profiles (name rendering). */
export async function lookupMerchants(
  merchantIds: string[],
  addrs: string[],
): Promise<MerchantProfile[]> {
  const params = new URLSearchParams();
  if (merchantIds.length) params.set("ids", merchantIds.join(","));
  if (addrs.length) params.set("addrs", addrs.join(","));
  if (![...params].length) return [];
  try {
    const res = await backendFetch<{ profiles: MerchantProfile[] }>(
      `/api/merchants/lookup?${params.toString()}`,
    );
    return res.profiles;
  } catch {
    return [];
  }
}

// --- Gift cards (on-chain escrow; the backend is a metadata index) ---
export type MyGiftCard = {
  objectId: string;
  claimCode: string;
  merchantId: string;
  recipientAddr: string | null;
  faceValueMicros: number;
  status: string;
};

/** Index a freshly-minted on-chain gift card; returns its share code + URL. */
export async function recordGiftCard(input: {
  sender: string;
  objectId: string;
  merchantId: string;
  faceValueMicros: number;
}): Promise<{ claimCode: string; url: string }> {
  return backendFetch<{ claimCode: string; url: string }>("/api/giftcards/record", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

/** Record the recipient after an on-chain claim (best-effort index update). */
export async function recordGiftCardClaim(code: string, recipient: string): Promise<void> {
  await backendFetch(`/api/giftcards/code/${code}/claim`, {
    method: "POST",
    body: JSON.stringify({ recipient }),
  });
}

/** A customer's claimed gift cards (index rows; live balances are read on-chain). */
export async function listMyGiftCards(customer: string): Promise<MyGiftCard[]> {
  const res = await backendFetch<{ cards: MyGiftCard[] }>(
    `/api/giftcards?customer=${encodeURIComponent(customer)}`,
  );
  return res.cards;
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
