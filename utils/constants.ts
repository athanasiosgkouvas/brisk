export const APP_NAME = "Brisk";
export const CLOCK_OBJECT_ID = "0x6";

export const ENV = {
  enokiApiKey: process.env.EXPO_PUBLIC_ENOKI_API_KEY ?? "",
  googleClientId: process.env.EXPO_PUBLIC_GOOGLE_CLIENT_ID ?? "",
  googleRedirectUri: process.env.EXPO_PUBLIC_GOOGLE_REDIRECT_URI ?? "",
  suiNetwork:
    (process.env.EXPO_PUBLIC_SUI_NETWORK as "testnet" | "devnet" | "mainnet" | undefined) ??
    "testnet",
  backendUrl: process.env.EXPO_PUBLIC_BACKEND_URL ?? "https://brisk-z5bu.onrender.com",

  /** Brisk's on-chain Move package (move/). Republished to testnet 2026-06-03
   *  with merchant-linked receipts (pay takes &Merchant, asserts amount, returns
   *  change) + a cap-gated refund, on top of the separated principal/yield lender. */
  briskPackageId:
    process.env.EXPO_PUBLIC_BRISK_PACKAGE_ID ??
    "0x2c778e1d5f02baa51a6a3c08c3849626bb090058752a237c56717f1fa4d2515a",

  /** Shared mock_lender LendingPool<USDC> id (10% APY). */
  briskPoolId:
    process.env.EXPO_PUBLIC_BRISK_POOL_ID ??
    "0x8cb6bd492be2c79efc26c46ac55ce420c8d9ad1ff48ab684e829ea1b8419ffee",

  /** LendingPool APY in basis points (10% = 1000) — for Save yield display. */
  briskApyBps: Number(process.env.EXPO_PUBLIC_BRISK_APY_BPS ?? "1000"),

  /**
   * Circle USDC — Brisk's stablecoin. Both types VERIFIED (Circle docs) and USDC
   * is #1 on Sui's gasless-transfer allowlist (`0x2::balance::send_funds<USDC>`).
   *   testnet: 0xa1ec7fc0…::usdc::USDC
   *   mainnet: 0xdba34672e30cb065b1f93e3ab55318768fd6fef66c15942c9f7cb846e2f900e7::usdc::USDC
   * NOTE: auto gas=0 detection only fires on gRPC/GraphQL transport; on JSON-RPC
   * the payment builder sets gasPrice=0 / gasBudget=0 manually (eligibility known).
   */
  usdcType:
    process.env.EXPO_PUBLIC_USDC_TYPE ??
    "0xa1ec7fc00a6f40db9693ad1415d0c193ad3906494428cf252621037bd7117e29::usdc::USDC",
  usdcDecimals: Number(process.env.EXPO_PUBLIC_USDC_DECIMALS ?? "6"),
  usdcSymbol: process.env.EXPO_PUBLIC_USDC_SYMBOL ?? "USDC",
} as const;

/**
 * Revenue: Brisk's only take-rate is a spread on yield generated in the Save
 * vault — payments themselves are always free to the user. Basis points of the
 * accrued yield routed to the treasury (NOT of principal or of the payment).
 */
export const BRISK_REVENUE = {
  yieldSpreadBps: Number(process.env.EXPO_PUBLIC_YIELD_SPREAD_BPS ?? "1000"), // 10% of yield
  treasuryAddress:
    process.env.EXPO_PUBLIC_BRISK_TREASURY_ADDR ??
    "0x000000000000000000000000000000000000000000000000000000000000B215",
} as const;

export const OAUTH = {
  googleAuthEndpoint: "https://accounts.google.com/o/oauth2/v2/auth",
};
