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

  /** Brisk's on-chain Move package (move/). Republished to testnet 2026-06-01
   *  with the separated principal/yield lender design. */
  briskPackageId:
    process.env.EXPO_PUBLIC_BRISK_PACKAGE_ID ??
    "0x5b0bb1e60ae43b411e2ed92c51c210fa674cd70ce162116a8bf9497c1f8be08a",

  /** Shared mock_lender LendingPool<USDC> id (10% APY). */
  briskPoolId:
    process.env.EXPO_PUBLIC_BRISK_POOL_ID ??
    "0xfaf55b512f8f73d4b40b053ecf0a0f882d15d1d16f2b2b0d3c16b9c641c492aa",

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

const PKG = ENV.briskPackageId;

/**
 * Enoki checks every PTB-level moveCall target against an allowlist before
 * sponsoring. Each flow passes the matching list. Plain P2P transfers go the
 * native-gasless route (`0x2::balance::send_funds`) and are NOT sponsored.
 * Expanded per phase as the payment/vault/loyalty PTBs land.
 */
export const BRISK_ALLOWED_TARGETS = {
  registerMerchant: [`${PKG}::merchant_registry::register`],
  // Phase 2: sponsored payment that also mints an on-chain receipt.
  payWithReceipt: [
    `${PKG}::payment_receipt::issue`,
    "0x2::coin::split",
    "0x2::transfer::public_transfer",
  ],
} as const;

export const REFRESH_INTERVALS = {
  settlementMs: 5_000,
};

export const OAUTH = {
  googleAuthEndpoint: "https://accounts.google.com/o/oauth2/v2/auth",
};
