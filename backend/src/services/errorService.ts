type ErrorEntry = {
  message: string;
  source?: string;
  stack?: string;
  userId?: string;
  metadata?: Record<string, unknown>;
  createdAt: string;
};

const recentErrors: ErrorEntry[] = [];

export function captureError(input: Omit<ErrorEntry, "createdAt">) {
  recentErrors.unshift({
    ...input,
    createdAt: new Date().toISOString(),
  });
  recentErrors.splice(100);
}
