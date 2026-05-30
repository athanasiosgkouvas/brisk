export const APP_NAME = "FATHOM";
export const CLOCK_OBJECT_ID = "0x6";

export const ENV = {
  enokiApiKey: process.env.EXPO_PUBLIC_ENOKI_API_KEY ?? "",
  googleClientId: process.env.EXPO_PUBLIC_GOOGLE_CLIENT_ID ?? "",
  googleRedirectUri: process.env.EXPO_PUBLIC_GOOGLE_REDIRECT_URI ?? "",
  suiNetwork:
    (process.env.EXPO_PUBLIC_SUI_NETWORK as "testnet" | "devnet" | "mainnet" | undefined) ??
    "testnet",
  predictApiUrl:
    process.env.EXPO_PUBLIC_PREDICT_API_URL ?? "https://predict-server.testnet.mystenlabs.com",
  demoMode: (process.env.EXPO_PUBLIC_DEMO_MODE ?? "false").toLowerCase() === "true",
  fixedBetAmount: Number(process.env.EXPO_PUBLIC_FIXED_BET_AMOUNT ?? "5"),
  predictPackageId:
    process.env.EXPO_PUBLIC_PREDICT_PACKAGE_ID ??
    "0xf5ea2b3749c65d6e56507cc35388719aadb28f9cab873696a2f8687f5c785138",
  predictObjectId:
    process.env.EXPO_PUBLIC_PREDICT_OBJECT_ID ??
    "0xc8736204d12f0a7277c86388a68bf8a194b0a14c5538ad13f22cbd8e2a38028a",
  predictRegistryId:
    process.env.EXPO_PUBLIC_PREDICT_REGISTRY_ID ??
    "0x43af14fed5480c20ff77e2263d5f794c35b9fab7e2212903127062f4fe2a6e64",
  dusdcType:
    process.env.EXPO_PUBLIC_DUSDC_TYPE ??
    "0xe95040085976bfd54a1a07225cd46c8a2b4e8e2b6732f140a0fc49850ba73e1a::dusdc::DUSDC",
  /**
   * Fathom's own on-chain Move package (`move/fathom_router`).
   * `router::assert_and_record` enforces the min-out invariant on the DeepBook
   * spot leg of a Smart Bet (over the swap's output coin) and emits a
   * `HedgedSwapExecuted` linking event. Published to testnet 2026-05-28
   * (digest BjTsyDszkMAqWPQB8HKUdYr4Z82x87iaADJx5AmnPkUz).
   */
  fathomRouterPackageId:
    process.env.EXPO_PUBLIC_FATHOM_ROUTER_PACKAGE_ID ??
    "0x92555862cc0dbcedfd6f7ff15bc5ebf42e5bc33e81bf87dac0e611bf45e1c89c",
  backendUrl: process.env.EXPO_PUBLIC_BACKEND_URL ?? "http://localhost:3001",
};

// DeepBook Predict's PLP share token. Lives on the same package as Predict
// itself — see https://docs.sui.io/onchain-finance/deepbook-predict/.
export const PLP_TYPE = `${ENV.predictPackageId}::plp::PLP`;

/**
 * DeepBook v3 testnet identifiers — verified by scripts/probe-deepbook.ts on
 * 2026-05-28. The DBUSDC asset here is intentionally NOT the same as
 * Predict's dUSDC (which has no on-chain bridge); we use DBUSDC for the
 * orderbook leg of the Smart Bet composability story.
 */
export const DEEPBOOK = {
  packageId:
    process.env.EXPO_PUBLIC_DEEPBOOK_PACKAGE_ID ??
    "0x22be4cade64bf2d02412c7e8d0e8beea2f78828b948118d46735315409371a3c",
  /**
   * Pool address used by Smart Bet's hedge leg and the standalone DeepBook
   * swap panel. On testnet this is SUI/DBUSDC; on mainnet the same env var
   * should point at SUI/USDC. The PTB builders are quote-asset-agnostic —
   * they read the type from `quoteType` below.
   */
  suiQuotePoolId:
    process.env.EXPO_PUBLIC_DEEPBOOK_SUI_QUOTE_POOL ??
    process.env.EXPO_PUBLIC_DEEPBOOK_SUI_DBUSDC_POOL ??
    "0x1c19362ca52b8ffd7a33cee805a67d40f31e6ba303753fd3a4cfdfacea7163a5",
  /** Quote-asset coin type. Mainnet: canonical USDC. Testnet: DBUSDC. */
  quoteType:
    process.env.EXPO_PUBLIC_DEEPBOOK_QUOTE_TYPE ??
    process.env.EXPO_PUBLIC_DEEPBOOK_DBUSDC_TYPE ??
    "0xf7152c05930480cd740d7311b5b8b45c6f488e3a53a11c3f74a6fac36a52e0d7::DBUSDC::DBUSDC",
  /** Display symbol for the quote asset — used in UI strings. */
  quoteSymbol: process.env.EXPO_PUBLIC_DEEPBOOK_QUOTE_SYMBOL ?? "DBUSDC",
  /** Decimals of the quote asset. DBUSDC=6, mainnet USDC=6. */
  quoteDecimals: Number(process.env.EXPO_PUBLIC_DEEPBOOK_QUOTE_DECIMALS ?? "6"),
  deepType:
    process.env.EXPO_PUBLIC_DEEPBOOK_DEEP_TYPE ??
    "0x36dbef866a1d62bf7328989a10fb2f07d769f4ee587c0de4a0a256e57e0a58a8::deep::DEEP",
  // SUI native — included for completeness.
  suiType: "0x2::sui::SUI",
  suiDecimals: 9,

  // Legacy aliases kept for any caller that still references `dbusdc*`.
  // Schedule for removal once all imports are migrated.
  /** @deprecated use `suiQuotePoolId` */
  get suiDbusdcPoolId(): string {
    return this.suiQuotePoolId;
  },
  /** @deprecated use `quoteType` */
  get dbusdcType(): string {
    return this.quoteType;
  },
  /** @deprecated use `quoteDecimals` */
  get dbusdcDecimals(): number {
    return this.quoteDecimals;
  },
} as const;

/**
 * Marketing / revenue config: we skim a small fee on every winning claim and
 * route it to a treasury address inside the same redeem PTB. No Move package
 * required — see services/blockchain/predictTransactions.ts.
 */
export const FATHOM_REVENUE = {
  /** Basis points (1bp = 0.01%). Default 100bp = 1% of payout. */
  claimFeeBps: Number(process.env.EXPO_PUBLIC_FATHOM_CLAIM_FEE_BPS ?? "100"),
  /** Treasury address receiving the take-rate slice. Falls back to a recognizable burn-style address on testnet for safety. */
  treasuryAddress:
    process.env.EXPO_PUBLIC_FATHOM_TREASURY_ADDR ??
    "0x000000000000000000000000000000000000000000000000000000000000FA70",
} as const;

export const PREDICT_ALLOWED_TARGETS = {
  createManager: [`${ENV.predictPackageId}::predict::create_manager`],
  mint: [
    `${ENV.predictPackageId}::predict_manager::deposit`,
    `${ENV.predictPackageId}::market_key::new`,
    `${ENV.predictPackageId}::predict::mint`,
  ],
  /**
   * Smart Bet: Predict mint + DeepBook Spot leg in the same PTB. Headline
   * composability beat for the Sui Overflow DeepBook track.
   *
   * The DeepBook swap (`pool::swap_exact_base_for_quote`, SDK-current package)
   * produces a DBUSDC coin; Fathom's own `router::assert_and_record` then
   * ASSERTS that fill cleared the caller's min-out floor (abort reverts the
   * whole PTB — including the mint) and emits a `HedgedSwapExecuted` event
   * linking the two legs. The router asserts over the swap *output* rather
   * than calling DeepBook itself, so it never breaks when DeepBook upgrades.
   *
   * `0x2::coin::zero<DEEP>` is here because the TS builder mints an empty DEEP
   * fee coin handle for the swap when the user holds no DEEP. Enoki checks
   * every PTB-level moveCall target against this list.
   */
  smartBet: [
    `${ENV.predictPackageId}::predict_manager::deposit`,
    `${ENV.predictPackageId}::market_key::new`,
    `${ENV.predictPackageId}::predict::mint`,
    `${DEEPBOOK.packageId}::pool::swap_exact_base_for_quote`,
    `${ENV.fathomRouterPackageId}::router::assert_and_record`,
    `0x0000000000000000000000000000000000000000000000000000000000000002::coin::zero`,
  ],
  smartBetRange: [
    `${ENV.predictPackageId}::predict_manager::deposit`,
    `${ENV.predictPackageId}::range_key::new`,
    `${ENV.predictPackageId}::predict::mint_range`,
    `${DEEPBOOK.packageId}::pool::swap_exact_base_for_quote`,
    `${ENV.fathomRouterPackageId}::router::assert_and_record`,
    `0x0000000000000000000000000000000000000000000000000000000000000002::coin::zero`,
  ],
  payout: [
    `${ENV.predictPackageId}::market_key::new`,
    `${ENV.predictPackageId}::predict::redeem`,
    `${ENV.predictPackageId}::predict_manager::withdraw`,
  ],
  mintRange: [
    `${ENV.predictPackageId}::predict_manager::deposit`,
    `${ENV.predictPackageId}::range_key::new`,
    `${ENV.predictPackageId}::predict::mint_range`,
  ],
  payoutRange: [
    `${ENV.predictPackageId}::range_key::new`,
    `${ENV.predictPackageId}::predict::redeem_range`,
    `${ENV.predictPackageId}::predict_manager::withdraw`,
  ],
  earnDeposit: [`${ENV.predictPackageId}::predict::supply`],
  earnWithdraw: [`${ENV.predictPackageId}::predict::withdraw`],
  /** Standalone DeepBook swap (utility panel) — no Predict touch. */
  deepbookSwap: [
    `${DEEPBOOK.packageId}::pool::swap_exact_base_for_quote`,
    `${DEEPBOOK.packageId}::pool::swap_exact_quote_for_base`,
    `0x0000000000000000000000000000000000000000000000000000000000000002::coin::zero`,
  ],
} as const;

export const REFRESH_INTERVALS = {
  settlementMs: 15_000,
  noMarketsMs: 30_000,
  marketRefetchMs: 20_000,
};

export const OAUTH = {
  googleAuthEndpoint: "https://accounts.google.com/o/oauth2/v2/auth",
};
