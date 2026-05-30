# TECHNICAL OVERVIEW

## zkLogin flow

1. App creates an ephemeral Ed25519 keypair.
2. App requests nonce/randomness/maxEpoch from Enoki (`createZkLoginNonce`).
3. User signs in with Google OAuth (`id_token` response).
4. App exchanges JWT for zkLogin identity (`getZkLogin`) and proof (`createZkLoginZkp`).
5. Session is stored in SecureStore (JWT/proof/ephemeral secret) and restored on startup.
6. Transactions are signed locally via `EnokiKeypair` (zkLogin signature wrapping ephemeral signature).

## Enoki sponsorship architecture

- Mobile app builds transaction kind bytes with `@mysten/sui`.
- App sends tx kind bytes + sender + allowed targets to backend `/api/sponsor`.
- Backend calls `EnokiClient.createSponsoredTransaction`.
- App signs sponsored bytes with zkLogin (`EnokiKeypair.signTransaction`).
- App sends `{ digest, signature }` to backend `/api/execute`.
- Backend calls `EnokiClient.executeSponsoredTransaction`.

This keeps the Enoki private key server-side while preserving self-custodial user signing. The shared helper is `services/blockchain/sponsoredExec.ts`.

## DeepBook Predict integration

We target the canonical DeepBook Predict deployment on Sui testnet:

- Predict package: `0xf5ea2b3749c65d6e56507cc35388719aadb28f9cab873696a2f8687f5c785138`
- Predict shared object: `0xc8736204d12f0a7277c86388a68bf8a194b0a14c5538ad13f22cbd8e2a38028a`
- Predict registry: `0x43af14fed5480c20ff77e2263d5f794c35b9fab7e2212903127062f4fe2a6e64`
- dUSDC quote type: `0xe95040…1a::dusdc::DUSDC`
- PLP share token type: `<predict_pkg>::plp::PLP`
- Source of truth: branch `predict-testnet-4-16` of `MystenLabs/deepbookv3`, `packages/predict/sources/`.

The Predict server (`predict-server.testnet.mystenlabs.com`) is used for market discovery, manager lookup, and oracle state for settlement checks. There is **no** Fathom-owned Move package — both trading and LP flows hit Predict's modules directly.

## Trading flow (Swipe tab)

1. Ensure the user has a `PredictManager` (`predict::create_manager` if absent — discovered via backend indexer).
2. Build the PTB:
   - `predict_manager::deposit` to escrow the stake
   - `market_key::new` (or `range_key::new`) for the target market
   - `predict::mint` (or `predict::mint_range`) to mint the position
3. App signs sponsored bytes; Enoki executes on testnet.
4. Position is added as `PENDING` in local history; settlement polling updates it to `WIN` or `LOSS`.
5. For `WIN`, Profile surfaces the payout CTA: `Claim winnings → Claiming → Winnings claimed | Retry claim`.
6. Claim builds `predict::redeem` + `predict_manager::withdraw` and transfers dUSDC to the user.

Solvency is enforced **on-chain** by `predict::max_total_exposure_pct`. The app does not pre-check exposure — if the protocol aborts a mint, the error is surfaced cleanly.

## Earn flow (Earn tab) — DeepBook Predict LP

The Earn tab is direct, single-call integration with DeepBook Predict's shared LP vault.

### Deposit (LP supply)

```move
public fun predict::supply<Quote>(
    predict: &mut Predict,
    coin: Coin<Quote>,
    clock: &Clock,
    ctx: &mut TxContext,
): Coin<PLP>
```

PTB shape (`services/blockchain/earnTransactions.ts::buildEarnDepositTx`):

1. Merge user's dUSDC coins and `splitCoins` the exact deposit amount.
2. `predict::supply<dUSDC>(predict, coin, clock)` → returns `Coin<PLP>`.
3. `transferObjects` PLP back to the user.

Sponsored target allowlist: `<pkg>::predict::supply`.

### Withdrawal (LP redeem)

```move
public fun predict::withdraw<Quote>(
    predict: &mut Predict,
    lp_coin: Coin<PLP>,
    clock: &Clock,
    ctx: &mut TxContext,
): Coin<Quote>
```

PTB shape (`buildEarnWithdrawTx`):

1. Merge user's PLP coins and `splitCoins` the exact PLP burn amount.
2. `predict::withdraw<dUSDC>(predict, plp_coin, clock)` → returns `Coin<dUSDC>`.
3. `transferObjects` dUSDC back to the user.

Sponsored target allowlist: `<pkg>::predict::withdraw`.

The withdrawal limiter (`predict::available_withdrawal(&Predict, &Clock) → u64`) caps how much the vault is willing to pay out at any moment when payout coverage is tight. Exceeding it aborts the tx on-chain.

### Share price / NAV

Per the DeepBook Predict design docs:

> The first supplier receives shares one-to-one with the supplied amount. Later suppliers receive shares proportional to their deposit relative to current vault value.

```
vault_value     = vault.balance - vault.total_mtm   // NAV in dUSDC micros
share_price     = vault_value / total_plp_supply    // 1:1 when supply == 0
plp_minted      = coin_in * total_plp_supply / vault_value
```

The on-chain read is `vault::vault_value(&Vault)` (not exposed as a top-level Move fn — we mirror the formula in `services/api/predictVaultApi.ts` by reading the Predict object's `vault.balance` and `vault.total_mtm`).

### APY computation

LP yield is realized through:

- The spread between position pricing and oracle-driven fair value
- Net trader losses (vault is the implicit counterparty)
- Protocol fees that accrue into `vault.balance`

All of these grow `vault_value` (or hold it flat) and never reduce `total_plp_supply` mid-flight, so **share price is monotone non-decreasing between settlement events**.

The backend snapshotter (`backend/src/services/predictVaultSnapshotter.ts`) writes a `(timestamp, vault_value, total_plp, share_price_micro)` row every `PREDICT_VAULT_SNAPSHOT_MS` (default 5 min) into the `predict_vault_snapshots` SQLite table. `GET /api/earn/apy` annualizes the change between the latest snapshot and the snapshot closest to `now − 7d`:

```
growth   = latest.share_price / baseline.share_price
yearsΔ   = (latest.ts − baseline.ts) / (365 * 24 * 3600 * 1000)
apy_pct  = (growth ^ (1 / yearsΔ) - 1) * 100
```

If the rolling window contains < 12h of data or < 2 samples, the endpoint returns `apy7d: null, reason: "warming_up"` so the UI shows a placeholder.

### Dual-sided economy

Swipe-tab traders mint Predict positions against the Predict vault. Earn-tab LPs supply that same Predict vault. The two flows close the loop on a single shared liquidity pool — there is no intermediary, no Fathom-owned Move package, and no keeper bot to babysit.

## DeepBook composability (Smart Bet) — enforced on-chain by `fathom_router`

The headline beat for the Sui Overflow 2026 **DeepBook track**: a single sponsored PTB that mints a Predict position AND trades on the DeepBook orderbook, where the fill is **asserted on-chain by Fathom's own Move package** — not a cosmetic no-op.

```
sponsored PTB (Smart Bet binary mint):
  1. predict_manager::deposit<dUSDC>          (stake into Predict)
  2. market_key::new                          (binary key)
  3. predict::mint<dUSDC>                     (mint YES/NO)
  4. coin::zero<DEEP> (or the user's DEEP)    (fill-fee coin)
  5. deepbook::pool::swap_exact_base_for_quote<SUI, DBUSDC>
       (sells `smartBetSuiNotional` SUI for DBUSDC; pool min_out=0)
  6. fathom_router::assert_and_record<DBUSDC>(&quoteOut, min_out, …)
       (ASSERTS quoteOut ≥ min_out — abort reverts the whole PTB,
        including the mint — and emits HedgedSwapExecuted)
  7. transferObjects(baseRem, quoteOut, deepRem → recipient)
```

**Why `fathom_router` asserts the swap *output* instead of calling DeepBook itself:** DeepBook gates pools by package version (`pool::load_inner`). A Move module linked to the feature-branch deepbook id (`0x74cd56…`) aborts (code 11) against the live pool, which only accepts the current `0x22be4ca…`. So the swap stays a loose, SDK-versioned PTB call and `router::assert_and_record` (Sui-framework-only, immune to DeepBook upgrades) borrows the output coin and enforces the floor. The package is `move/fathom_router` (testnet `0x92555862…1c89c`); the invariant is verified on-chain by [`scripts/probe-router.ts`](scripts/probe-router.ts) (Case A aborts with `EHedgeBelowFloor`; Case B emits the event).

**Honest engagement gate** (`hooks/usePredict.ts`): before taking the smart-bet path the hook fetches a live `get_quote_quantity_out` quote and the user's DEEP balance. It engages the enforced spot leg **only** when the book can fill the size AND the wallet holds enough DEEP for the fill fee, setting `min_out = applySlippage(quote)`. Otherwise it falls back to a plain Predict mint and surfaces a visible note (`smartBetNote`) — no silent no-op. On testnet the SUI/DBUSDC book fills only for sizes ≥ ~1 SUI and requires DEEP (a `coin::zero<DEEP>` fee yields a zero fill).

The DeepBook leg does not pay back into Predict — testnet has no on-chain wrapper between Predict's `dUSDC` and DeepBook's `DBUSDC` (verified by [`scripts/probe-deepbook.ts`](scripts/probe-deepbook.ts)), so it is an honest spot leg priced against the same book, not a stake onramp.

## DeepBook maker orders (limit orders)

Beyond market-taking, Fathom rests **real limit orders** on the SUI/DBUSDC CLOB via a per-user `BalanceManager`, sponsored end-to-end. Builders: [`services/blockchain/deepbookLimitOrders.ts`](services/blockchain/deepbookLimitOrders.ts); hook: [`hooks/useDeepBookLimitOrders.ts`](hooks/useDeepBookLimitOrders.ts); UI: [`components/profile/DeepBookMakerPanel.tsx`](components/profile/DeepBookMakerPanel.tsx).

```
tx 1 (once):  balance_manager::new → transfer::public_share_object   (shared BalanceManager)
tx 2 (place): balance_manager::deposit → generate_proof_as_owner → pool::place_limit_order
tx 3 (cancel):                          generate_proof_as_owner → pool::cancel_order
```

Create+share is its own tx (a shared object can't be reused in its creating PTB). The deposit must exceed the order notional (a 1 SUI deposit can't rest a 1 SUI ask — `EBalanceManagerBalanceTooLow`; ~1.2× clears it, surplus stays withdrawable). Full flow verified on testnet by [`scripts/probe-limit-order.ts`](scripts/probe-limit-order.ts) (`OrderPlaced` then `OrderCanceled`).

## Live DeepBook orderbook ticker

The backend records the SUI/DBUSDC mid + best bid/ask + spread every `DEEPBOOK_PRICE_FEED_MS` (default 15s) into `deepbook_price_snapshots` ([`backend/src/indexer/deepbookPriceFeed.ts`](backend/src/indexer/deepbookPriceFeed.ts)), exposed at `GET /api/deepbook/ticker` and rendered live on the Swipe screen ([`components/markets/DeepBookTicker.tsx`](components/markets/DeepBookTicker.tsx)). This is the real book the Smart Bet spot leg trades. It does **not** price the prediction markets: Predict lists only BTC on testnet and the DeepBook DBTC book is empty, so pricing BTC off a SUI book would be dishonest — prediction-market odds stay on the predict-server forward.

**Builder file map:**

- Move targets and SDK pinning: [`utils/constants.ts::DEEPBOOK`](utils/constants.ts) and [`PREDICT_ALLOWED_TARGETS.smartBet`](utils/constants.ts).
- PTB composition: [`services/blockchain/predictTransactions.ts::buildSmartBetTx`](services/blockchain/predictTransactions.ts) and `buildSmartBetRangeTx`.
- Spot-leg helper (reused by the standalone DeepBook swap utility): [`services/blockchain/spotSwapTx.ts`](services/blockchain/spotSwapTx.ts).
- Live quote via devInspect: [`services/blockchain/deepbookClient.ts::quoteSuiToDbusdc`](services/blockchain/deepbookClient.ts).
- Hook integration: [`hooks/usePredict.ts`](hooks/usePredict.ts) — branches into `buildSmartBetTx` only when (a) the user has enabled the toggle, (b) wallet SUI covers the hedge notional plus a 0.1 SUI headroom, and (c) DeepBook's `get_quote_quantity_out` returns a non-zero quote. Any miss reverts to the standard mint PTB so the swipe never breaks mid-demo.
- UI: [`components/markets/SmartBetBar.tsx`](components/markets/SmartBetBar.tsx) (chip + setup sheet) and [`store/settingsStore.ts`](store/settingsStore.ts) (`smartBet`, `smartBetSuiNotional`).

**Sponsorship allowlist:** Smart Bet sends the union of Predict and DeepBook targets via `PREDICT_ALLOWED_TARGETS.smartBet` (or `smartBetRange`). Enoki refuses sponsored transactions that touch targets outside the allowlist; the allowlist is constructed per-request in `usePredict.ts` so the standard mint flow is unaffected.

### Standalone DeepBook swap utility

A separate "DeepBook swap" panel on the Profile tab lets users move SUI ↔ DBUSDC through the canonical orderbook, sponsored end-to-end. PTB builders live in [`services/blockchain/deepbookSwapTransactions.ts`](services/blockchain/deepbookSwapTransactions.ts); the hook is [`hooks/useDeepBookSwap.ts`](hooks/useDeepBookSwap.ts) and the UI is [`components/profile/DeepBookSwapPanel.tsx`](components/profile/DeepBookSwapPanel.tsx). Uses the same allowlist convention via `PREDICT_ALLOWED_TARGETS.deepbookSwap`.

## Revenue mechanic — claim take-rate

A 1% fee (configurable via `EXPO_PUBLIC_FATHOM_CLAIM_FEE_BPS`) is skimmed from every winning payout, **inside the same redeem PTB**:

```
sponsored PTB (claim):
  ... market_key::new
  predict::redeem<dUSDC>(...)
  let withdrawn = predict_manager::withdraw<dUSDC>(...)
  let fee = splitCoins(withdrawn, feeMicro)
  transferObjects(fee → FATHOM_TREASURY_ADDR)
  transferObjects(withdrawn → user)
```

No Move package needed; the skim is a vanilla `coin::split` + `transfer`. The claim success modal itemises **Gross → Fathom fee → Net** so users see exactly what they're paying. The amount is also exported as a helper (`computeClaimFeeMicro`) so the UI never drifts from the PTB.

Treasury and fee-bps are config-driven (`FATHOM_REVENUE` in `utils/constants.ts`) so a mainnet release can be relaunched with a tighter rate without code changes.

## Transaction lifecycle (Swipe)

1. Swipe gesture triggers immediate UI card advance.
2. Prediction submit starts in background.
3. Sponsored tx is created and signed with zkLogin.
4. Enoki executes tx on testnet.
5. Position is added as `PENDING` in local history.
6. Settlement polling updates to `WIN` or `LOSS`, updates streak, and triggers haptics.
7. For `WIN`, Profile shows payout CTA states: `Claim winnings` → `Claiming` → `Winnings claimed` (or `Retry claim` if failed).
8. User must tap claim to receive funds in wallet; settlement alone does not auto-transfer payout.

## Demo mode behavior

When `EXPO_PUBLIC_DEMO_MODE=true`:

- Market feed uses deterministic mock data.
- Submit prediction simulates network latency and writes a synthetic digest.
- Settlement resolves deterministically after polling interval.
- Allows reliable full demo even if APIs, faucet, or sponsorship are unstable.

The Earn tab does **not** have a demo path. It will fail loudly if it cannot read the Predict object.

## Known limitations

- Predict testnet package IDs are provisional and may change before mainnet.
- Predict server payload structures may evolve; parser logic currently uses resilient field mapping but may require adjustment.
- The Earn tab's "Your P&L" stat is computed from local-device deposit/withdraw history (`store/earnHistoryStore.ts`). Reinstalling or signing in on another device resets the local cost basis — this is acceptable for the demo, but a future mainnet build should derive cost basis from on-chain event history.
- Faucet endpoint currently rate-limits and accepts requests, but transfer integration is left as an extension hook.
- No full automated test suite for the app; backend has `node --test` coverage over the indexer and sponsorship paths.
- Smart Bet's DeepBook leg is an enforced spot trade (asserted fill via `fathom_router`), not a stake onramp — settling `DBUSDC` back into Predict's `dUSDC` would need an on-chain wrapper or a mainnet-canonical USDC asset (the Predict-testnet `dUSDC` package exposes zero public functions). On testnet the leg only engages when the SUI/DBUSDC book can fill (≥ ~1 SUI) and the wallet holds DEEP; otherwise the swipe mints a plain Predict position with a visible note.
- DeepBook is not used to price the prediction markets: Predict lists only BTC on testnet and the DeepBook DBTC book is empty (the only liquid book is SUI/DBUSDC). We surface a live SUI/DBUSDC ticker rather than fake BTC odds off a SUI book. A mainnet build with a liquid same-asset book could drive strike/odds from the CLOB mid.
- Push notifications and full copy-trading (follow + mirror) are out of scope for this submission; both are designed in the plan file (`~/.claude/plans/`) and ready to land post-hackathon without touching the DeepBook composability core.
