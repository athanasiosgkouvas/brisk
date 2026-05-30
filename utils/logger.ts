export const log = {
  info: (message: string, data?: unknown): void => {
    console.log(`[FATHOM] ${message}`, data ?? "");
  },
  warn: (message: string, data?: unknown): void => {
    console.warn(`[FATHOM] ${message}`, data ?? "");
  },
  error: (message: string, data?: unknown): void => {
    console.error(`[FATHOM] ${message}`, data ?? "");
  },
};
