import { trackAnalyticsEvent } from "@/services/api/backendApi";

type AnalyticsProps = Record<string, unknown> | undefined;

let initialized = false;

export function initAnalytics() {
  initialized = true;
}

export async function trackEvent(event: string, userId?: string, properties?: AnalyticsProps) {
  if (!initialized) return;

  // Backend no longer correlates analytics events to a user — the indexer does
  // that off chain via the position table. We still accept the `userId` arg so
  // existing call sites don't need touching; it's folded into properties.
  const merged: Record<string, unknown> | undefined = userId
    ? { ...(properties ?? {}), userId }
    : (properties as Record<string, unknown> | undefined);

  try {
    await trackAnalyticsEvent(event, merged);
  } catch (error) {
    console.warn("Analytics track failed", error);
  }
}
