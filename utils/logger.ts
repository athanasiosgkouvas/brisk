export const log = {
  info: (message: string, data?: unknown): void => {
    console.log(`[BRISK] ${message}`, data ?? "");
  },
  warn: (message: string, data?: unknown): void => {
    console.warn(`[BRISK] ${message}`, data ?? "");
  },
  error: (message: string, data?: unknown): void => {
    console.error(`[BRISK] ${message}`, data ?? "");
  },
};
