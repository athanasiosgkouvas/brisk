import { ENV } from "@/utils/constants";

type SuiClientLike = {
  getBalance: (input: { owner: string; coinType?: string }) => Promise<{ totalBalance?: string }>;
};

/**
 * Hermes (React Native JS engine) may be missing Intl.PluralRules.
 * @mysten/sui/client utils call `new Intl.PluralRules(...)` at module load
 * time for ordinal error-message formatting.  Without this polyfill the
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
    // JSON-RPC is deprecated / being deactivated. The app uses the supported
    // GraphQL transport (plain fetch → RN/Hermes-friendly). `url` is required.
    rawClientPromise = import("@mysten/sui/graphql").then(
      ({ SuiGraphQLClient }) =>
        new SuiGraphQLClient({
          network: ENV.suiNetwork,
          url: ENV.rpcUrl || "https://graphql.testnet.sui.io/graphql",
        }),
    );
  }
  return rawClientPromise;
}

/**
 * Thin typed facade for RPC calls in the app. Routes through the unified
 * `core.getBalance` (Balance shape) and maps it back to the legacy field name
 * the callers expect.
 */
export const suiClient: SuiClientLike = {
  async getBalance(input) {
    const c = await getRawClient();
    const res = await c.core.getBalance({ owner: input.owner, coinType: input.coinType });
    return { totalBalance: res?.balance?.balance };
  },
};

/**
 * Returns the underlying SuiGraphQLClient. Needed by Transaction#build() to
 * resolve object references (types, versions, digests) from the network, and
 * exposes `.query()` for the raw GraphQL history reads (see txHistory.ts).
 */
export async function getSuiClientForBuild() {
  return getRawClient();
}
