// Runtime config, sourced from Vite build-time env (VITE_*). Mirrors the values
// in the app's `utils/constants.ts` ENV so the web pay flow talks to the same
// backend / network / USDC type.

const origin = typeof window !== "undefined" ? window.location.origin : "";

export const CONFIG = {
  backendUrl: import.meta.env.VITE_BACKEND_URL ?? "https://brisk-z5bu.onrender.com",
  enokiApiKey: import.meta.env.VITE_ENOKI_API_KEY ?? "",
  googleClientId: import.meta.env.VITE_GOOGLE_CLIENT_ID ?? "",
  suiNetwork: (import.meta.env.VITE_SUI_NETWORK ?? "testnet") as "testnet" | "mainnet" | "devnet",
  rpcUrl: import.meta.env.VITE_SUI_RPC_URL ?? "",
  usdcType:
    import.meta.env.VITE_USDC_TYPE ??
    "0xa1ec7fc00a6f40db9693ad1415d0c193ad3906494428cf252621037bd7117e29::usdc::USDC",
  // Where Google returns the id_token (implicit flow). Must be registered in the
  // Google web client's authorized redirect URIs. A fixed path (not per-code) so
  // one URI covers every link; the pending code is restored from localStorage.
  redirectUri: import.meta.env.VITE_WEB_REDIRECT_URI ?? `${origin}/pay/`,
} as const;

export const GOOGLE_AUTH_ENDPOINT = "https://accounts.google.com/o/oauth2/v2/auth";

export function assertConfigured(): void {
  if (!CONFIG.enokiApiKey) throw new Error("Missing VITE_ENOKI_API_KEY");
  if (!CONFIG.googleClientId) throw new Error("Missing VITE_GOOGLE_CLIENT_ID");
}
