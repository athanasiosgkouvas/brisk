type AnalyticsEvent = {
  event: string;
  properties?: Record<string, unknown>;
  userId?: string;
  createdAt: string;
};

const recentEvents: AnalyticsEvent[] = [];

export function trackEvent(event: string, userId?: string, properties?: Record<string, unknown>) {
  recentEvents.unshift({
    event,
    userId,
    properties,
    createdAt: new Date().toISOString(),
  });
  recentEvents.splice(100);
}

export function listRecentEvents() {
  return recentEvents;
}
