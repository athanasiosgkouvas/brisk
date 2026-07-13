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
    // GraphQL transport (plain fetch → RN/Hermes-friendly). `url` is required and
    // must agree with `network`, so derive the default from the configured network.
    const defaultUrl = `https://graphql.${ENV.suiNetwork}.sui.io/graphql`;
    rawClientPromise = import("@mysten/sui/graphql").then(
      ({ SuiGraphQLClient }) =>
        new SuiGraphQLClient({
          network: ENV.suiNetwork,
          url: ENV.rpcUrl || defaultUrl,
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

/**
 * Poll `getTransaction` until our (lagging) GraphQL fullnode has indexed `digest`.
 * A sponsored tx is executed on Enoki's node, so an immediate one-shot read races
 * indexing and throws ("Missing response data"). The SDK's own `waitForTransaction`
 * relies on `AbortSignal.timeout`/`AbortSignal.any`, which Hermes (RN) does not
 * implement ("undefined is not a function"), so we poll manually with `setTimeout`.
 */
export async function waitForTxIndexed(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  client: any,
  digest: string,
  include: Record<string, boolean>,
  opts?: { timeoutMs?: number; intervalMs?: number },
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
): Promise<any> {
  const timeoutMs = opts?.timeoutMs ?? 30_000;
  const intervalMs = opts?.intervalMs ?? 800;
  const deadline = Date.now() + timeoutMs;
  let lastErr: unknown;
  let first = true;
  while (Date.now() < deadline) {
    if (!first) await new Promise((r) => setTimeout(r, intervalMs));
    first = false;
    try {
      return await client.getTransaction({ digest, include });
    } catch (e) {
      lastErr = e; // not indexed yet — keep polling until the deadline
    }
  }
  throw lastErr instanceof Error
    ? lastErr
    : new Error(`transaction ${digest} was not indexed within ${timeoutMs}ms`);
}
