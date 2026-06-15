import { reportError } from "@/services/api/backendApi";

let initialized = false;

export function initErrorTracking() {
  initialized = true;
}

export async function captureError(input: {
  message: string;
  source?: string;
  stack?: string;
  userId?: string;
  metadata?: Record<string, unknown>;
}) {
  if (!initialized) return;

  try {
    await reportError(input);
  } catch (error) {
    console.warn("Error reporting failed", error);
  }
}
