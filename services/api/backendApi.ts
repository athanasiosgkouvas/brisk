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
