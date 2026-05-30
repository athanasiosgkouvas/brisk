import { ENV } from "@/utils/constants";

type SuiClientLike = {
  getBalance: (input: { owner: string; coinType?: string }) => Promise<{ totalBalance?: string }>;
  getCoins: (input: { owner: string; coinType?: string; limit?: number }) => Promise<{
    data: Array<{ balance: string; coinObjectId: string }>;
  }>;
  getObject: (input: { id: string; options?: Record<string, unknown> }) => Promise<{
    data?: { content?: unknown };
  }>;
  getTotalSupply: (input: { coinType: string }) => Promise<{ value?: string }>;
  getTransactionBlock: (input: {
    digest: string;
    options?: Record<string, unknown>;
  }) => Promise<{
    objectChanges?: Array<{ type: string; objectType?: string; objectId?: string }>;
    events?: Array<{ type: string; parsedJson?: unknown }>;
  }>;
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
          url: getJsonRpcFullnodeUrl(ENV.suiNetwork),
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
  async getCoins(input) {
    return (await getRawClient()).getCoins(input) as Promise<{
      data: Array<{ balance: string; coinObjectId: string }>;
    }>;
  },
  async getObject(input) {
    return (await getRawClient()).getObject(input) as Promise<{
      data?: { content?: unknown };
    }>;
  },
  async getTotalSupply(input) {
    return (await getRawClient()).getTotalSupply(input) as Promise<{ value?: string }>;
  },
  async getTransactionBlock(input) {
    return (await getRawClient()).getTransactionBlock(input) as Promise<{
      objectChanges?: Array<{ type: string; objectType?: string; objectId?: string }>;
      events?: Array<{ type: string; parsedJson?: unknown }>;
    }>;
  },
};

/**
 * Returns the underlying SuiJsonRpcClient needed by Transaction#build() to
 * resolve object references (types, versions, digests) from the network.
 */
export async function getSuiClientForBuild() {
  return getRawClient();
}
