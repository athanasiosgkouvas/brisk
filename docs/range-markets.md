# Range Markets — Discovery Notes

Findings from `sui_getNormalizedMoveModulesByPackage` on the Predict package `0xf5ea2b3749c65d6e56507cc35388719aadb28f9cab873696a2f8687f5c785138` (testnet, May 2026).

## Modules present

`constants`, `i64`, `market_key`, `math`, `oracle`, `oracle_config`, `plp`, `predict`, `predict_manager`, `pricing_config`, **`range_key`**, `rate_limiter`, `registry`, `risk_config`, `strike_matrix`, `treasury_config`, `vault`.

Range support **is published** and live on testnet.

## Range entry points

```
predict::mint_range(
  &mut Predict,
  &mut PredictManager,
  &OracleSVI,
  RangeKey,
  u64,             // quantity (face value to mint)
  &Clock,
  &mut TxContext,
)

predict::redeem_range(
  &mut Predict,
  &mut PredictManager,
  &OracleSVI,
  RangeKey,
  u64,             // quantity (face value to redeem)
  &Clock,
  &mut TxContext,
)

range_key::new(oracle_id: ID, expiry: u64, lower_strike: u64, higher_strike: u64): RangeKey
```

Helper for previewing trade economics:

```
predict::get_range_trade_amounts(...)  // off-chain quote helper
```

## Critical UX implication: range markets are one-sided

`mint_range` has **no `is_bounded` / side parameter**. The protocol only supports a single position type for any range: the **bounded** payoff (pays out if settlement price lands in `[lower, higher]`).

There is no `mint_outside_range` or equivalent — going OUTSIDE a range is the **liquidity-provider counterparty role**, not a user-mintable position. The PLP (and our adversarial vault) is the implicit "outside" side.

**Resulting UX:**

- **Swipe right** on a range card → submit a sponsored `mint_range` for face value = `fixedBetAmount`. Stores the resulting position as `direction = "BOUNDED"`.
- **Swipe left** → dismiss the card without an on-chain action. Counts as a "passed" market for analytics but does not create a position.

(The earlier plan's "swipe-left = OUTSIDE mint" cannot be implemented against the current protocol surface. If `mint_outside` lands later, we revisit.)

## Event names — Phase A indexer correction

The Phase A indexer was scaffolded with **wrong** event type names (the Sui docs and blog never published the actual names). Correct names from the published package:

| Phase A guessed name   | Actual on-chain type        |
| ---------------------- | --------------------------- |
| `predict::MintEvent`   | `predict::PositionMinted`   |
| `predict::RedeemEvent` | `predict::PositionRedeemed` |
| `predict::SettleEvent` | `oracle::OracleSettled`     |
| (none)                 | `predict::RangeMinted`      |
| (none)                 | `predict::RangeRedeemed`    |

The indexer's poller filter strings and eventHandlers field parsing have been updated to match.

## Event field shapes (verified)

### `predict::PositionMinted`

```
predict_id: ID, manager_id: ID, trader: address, quote_asset: TypeName,
oracle_id: ID, expiry: u64, strike: u64, is_up: bool,
quantity: u64, cost: u64, ask_price: u64
```

- `cost` = bet size paid by the user (micro units).
- `quantity` = face value of the position (what the user receives if their side wins).

### `predict::PositionRedeemed`

```
predict_id: ID, manager_id: ID, owner: address, executor: address,
quote_asset: TypeName, oracle_id: ID, expiry: u64, strike: u64, is_up: bool,
quantity: u64, payout: u64, bid_price: u64, is_settled: bool
```

- `owner` (not `trader`) — the user being redeemed.
- `executor` is the address that submitted the redeem tx (may differ; `predict::redeem_permissionless` exists).
- `payout` = micro units paid out.

### `predict::RangeMinted`

```
predict_id: ID, manager_id: ID, trader: address, quote_asset: TypeName,
oracle_id: ID, expiry: u64, lower_strike: u64, higher_strike: u64,
quantity: u64, cost: u64, ask_price: u64
```

Note: protocol uses **`higher_strike`**, not `upper_strike`.

### `predict::RangeRedeemed`

```
predict_id: ID, manager_id: ID, trader: address, quote_asset: TypeName,
oracle_id: ID, expiry: u64, lower_strike: u64, higher_strike: u64,
quantity: u64, payout: u64, bid_price: u64, is_settled: bool
```

### `oracle::OracleSettled`

```
oracle_id: ID, expiry: u64, settlement_price: u64, timestamp: u64
```

The settle event lives in the `oracle` module — there is no equivalent in the `predict` module. The indexer subscribes to this filter to drive position resolution.

## Vault exposure for range markets

`mint_range` only sells BOUNDED. The PLP (vault) is automatically the OUTSIDE counterparty, so the vault's worst-case liability per range position is `quantity - cost` (max payout minus what was paid).

The indexer's `getAggregatedExposure` accordingly computes:

- Binary: `cost` per unsettled position (vault loses `cost` on a winning user side; the existing binary formula).
- Range: `quantity - cost` per unsettled BOUNDED position (vault pays `quantity` if BOUNDED wins).

No Move-side change is required — `vault::keeper_update_exposure` already accepts `predict_exposure` and `max_liability` separately.

## Open questions

- Does `predict::redeem` (binary) emit `PositionRedeemed` with `is_settled = false` when called pre-settlement (e.g. closeout) vs `true` post-settlement? The indexer should not mark a position as `WIN` purely from a redeem — it waits for `OracleSettled` and infers outcome from settlement price + position fields. To be confirmed via a live test mint.
- `predict::redeem_permissionless` — appears to let anyone settle on behalf of an owner. Worth understanding for the keeper's auto-claim flow in a future Phase C.
- Forward / ask-price oracle inputs needed for sparkline rendering in the range card; `oracle::forward_price`, `oracle::spot_price`, `oracle::settlement_price` are the relevant readers.
