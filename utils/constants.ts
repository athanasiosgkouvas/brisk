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

  /** Brisk's on-chain Move package (move/). Fresh republish 2026-06-04: mock_lender
   *  is now a real cToken/share money market (compounding exchange-rate + reserve
   *  factor → treasury), mirroring Suilend/Scallop. New type ids → prior Save
   *  positions/merchants reset (re-register lazily). */
  briskPackageId:
    process.env.EXPO_PUBLIC_BRISK_PACKAGE_ID ??
    "0xcbd54ab52fad4110fdad2d9fd8e92e84dd87db436f2b608cc47819f7d4fd03cc",

  /** Upgraded package id (2026-06-04 upgrade of briskPackageId) that carries
   *  payment_receipt::record_payment — the best-effort receipt leg of the two-leg
   *  payment. Types + the existing entry fns stay at briskPackageId (type origin
   *  preserved by the upgrade); ONLY record_payment is called here. */
  briskRecordPkg:
    process.env.EXPO_PUBLIC_BRISK_RECORD_PKG ??
    "0x3ac880a1eab2763fc1b92376a88e1913d0bc4dbf02023a3c0a0321d16c2837cb",

  /** Upgraded package id (2026-06-08 upgrade) that carries the `till` module —
   *  merchant receiving accounts that hide the private treasury from customers.
   *  `till::*` entry fns (create_till/sweep/set_treasury/rename/set_active) are
   *  called here; types + prior entry fns stay at their original package ids. */
  briskTillPkg:
    process.env.EXPO_PUBLIC_BRISK_TILL_PKG ??
    "0xe96ec7f8b0633204af0a4060cc10adeac019641d1ec71096f0567071885b1e35",

  /** Package id (v6, 2026-06-09) carrying the `gift_card` module — closed-loop
   *  gift cards on the merchant-prepaid promise model (merchant paid at issuance,
   *  card holds no escrow). Entry fns mint/claim/redeem/regift live here. */
  briskGiftCardPkg:
    process.env.EXPO_PUBLIC_BRISK_GIFT_CARD_PKG ??
    "0xc90ebfadb58657be143a09342d575223681587de6eb87efe006d720edc0b6a86",

  /** Shared GiftCardConfig object (protocol fee bps + treasury, enforced on-chain). */
  giftCardConfigId:
    process.env.EXPO_PUBLIC_GIFT_CARD_CONFIG_ID ??
    "0xa50c8948a8e4a555e3f7539dc9364e11e32ceec486403d15a61c74f4fead5bf7",

  /** Shared mock_lender LendingPool<USDC> id (10% APY, 10% reserve factor). */
  briskPoolId:
    process.env.EXPO_PUBLIC_BRISK_POOL_ID ??
    "0xdd22637b26c052aedd2ab234a62d52d607e3fe381cc2181768b154f25c2023b8",

  /** LendingPool gross APY in basis points (10% = 1000) — for Save yield display.
   *  Suppliers net APY × (1 − reserveFactor); reserve factor is 10% (1000 bps). */
  briskApyBps: Number(process.env.EXPO_PUBLIC_BRISK_APY_BPS ?? "1000"),

  /** Reserve factor in basis points (10% = 1000): the protocol's cut of accrued
   *  interest (the on-chain yield spread). Supplier net APY = gross × (1 − this).
   *  The on-chain exchange rate grows at the NET rate, so the live ticker uses it. */
  briskReserveFactorBps: Number(process.env.EXPO_PUBLIC_BRISK_RESERVE_FACTOR_BPS ?? "1000"),

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
  // Display-only mirror of the on-chain gift-card fee (enforced in the Move
  // GiftCardConfig). Used for fee transparency in the UI.
  giftCardFeeBps: Number(process.env.EXPO_PUBLIC_GIFT_CARD_FEE_BPS ?? "300"), // 3% of face value
} as const;

export const OAUTH = {
  googleAuthEndpoint: "https://accounts.google.com/o/oauth2/v2/auth",
};
