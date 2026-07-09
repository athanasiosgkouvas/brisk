import { ENV } from "@/utils/constants";

type SuiClientLike = {
  getBalance: (input: { owner: string; coinType?: string }) => Promise<{ totalBalance?: string }>;
};

/**
 * Hermes (React Native JS engine) may be missing Intl.PluralRules.
 * @mysten/sui/client/utils.mjs calls `new Intl.PluralRules(...)` at module
 * load time for ordinal error-message formatting.  Without this polyfill the
 * dynamic import throws and every RPC call silently fails.
 */
function patchIntlPluralRules() {
  if (
    typeof Intl !== "undefined" &&
    typeof (Intl as Record<string, unknown>).PluralRules === "function"
  ) {
    return;
  }
  const stub = class PluralRulesStub {
    // Always returns "other" → ordinal suffix "th", fine for error message formatting
    select(): string {
      return "other";
    }
  };
  if (typeof Intl === "undefined") {
    (globalThis as Record<string, unknown>).Intl = { PluralRules: stub };
  } else {
    (Intl as Record<string, unknown>).PluralRules = stub;
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let rawClientPromise: Promise<any> | null = null;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function getRawClient(): Promise<any> {
  if (!rawClientPromise) {
    patchIntlPluralRules();
    rawClientPromise = import("@mysten/sui/jsonRpc").then(
      ({ SuiJsonRpcClient, getJsonRpcFullnodeUrl }) =>
        new SuiJsonRpcClient({
          network: ENV.suiNetwork,
          // Mysten disabled JSON-RPC on the public testnet fullnode (the SDK default
          // now 404s), so prefer an explicit endpoint when configured.
          url: ENV.rpcUrl || getJsonRpcFullnodeUrl(ENV.suiNetwork),
        }),
    );
  }
  return rawClientPromise;
}

/**
 * Thin typed facade for RPC calls in the app.
 */
export const suiClient: SuiClientLike = {
  async getBalance(input) {
    return (await getRawClient()).getBalance(input) as Promise<{ totalBalance?: string }>;
  },
};

/**
 * Returns the underlying SuiJsonRpcClient needed by Transaction#build() to
 * resolve object references (types, versions, digests) from the network.
 */
export async function getSuiClientForBuild() {
  return getRawClient();
}
