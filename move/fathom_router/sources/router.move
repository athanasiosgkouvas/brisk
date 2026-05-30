/// Fathom's on-chain composability router.
///
/// `assert_and_record` enforces, on-chain, that the DeepBook spot leg of a
/// Smart Bet actually filled at least `min_out` DBUSDC, and emits a
/// `HedgedSwapExecuted` event linking the (same-PTB) Predict mint to the
/// verified orderbook fill.
///
/// Why this exists: the previous client-only flow passed `min_out = 0` to
/// `pool::swap_exact_base_for_quote`, so on a thin testnet book the spot leg
/// was a silent no-op — two unrelated Move calls coincidentally sharing a
/// digest. This module makes the fill a real, named, abort-on-failure
/// invariant owned by Fathom's own package. Because the call lives in the same
/// sponsored PTB as `predict::mint` (and the swap that produced `quote_out`),
/// an abort here reverts the whole transaction — the bet and its spot leg are
/// genuinely atomic.
///
/// Design note: the router takes the swap OUTPUT coin by reference rather than
/// calling DeepBook itself. DeepBook gates pool access by package version
/// (`pool::load_inner`), so a Move module that linked a specific deepbook
/// version would break the moment DeepBook upgrades. By asserting over the
/// already-produced `Coin<DBQuote>`, this package depends only on the Sui
/// framework and is immune to DeepBook upgrades — the swap stays a loose,
/// SDK-versioned PTB call. The borrow is immutable, so the caller still owns
/// `quote_out` and transfers it afterward.
module fathom_router::router;

use sui::coin::{Self, Coin};
use sui::event;

/// The DeepBook book filled less than the caller's enforced `min_out` floor.
const EHedgeBelowFloor: u64 = 1;

/// Emitted on every successful hedged swap. Links the Predict position
/// parameters (carried as plain values, since the mint and swap are adjacent
/// PTB calls) to the verified on-chain DeepBook fill. Indexed by the backend.
public struct HedgedSwapExecuted has copy, drop {
    trader: address,
    manager_id: ID,
    oracle_id: ID,
    // Binary: `strike` set, `is_yes` meaningful, `is_range = false`.
    // Range:  `lower_strike`/`upper_strike` set, `is_range = true`.
    expiry: u64,
    strike: u64,
    is_yes: bool,
    is_range: bool,
    lower_strike: u64,
    upper_strike: u64,
    // dUSDC micros staked into Predict by the adjacent mint.
    stake_amount: u64,
    // SUI micros sold on DeepBook (the swap input).
    hedge_base_in: u64,
    // DBUSDC micros actually received — asserted >= min_out.
    hedge_quote_out: u64,
    // The enforced floor.
    min_out: u64,
}

/// The load-bearing invariant, factored out so it is unit-testable without a
/// live coin. Aborts with `EHedgeBelowFloor` if the fill is below the floor.
public fun assert_floor(filled: u64, min_out: u64) {
    assert!(filled >= min_out, EHedgeBelowFloor);
}

/// Assert the DeepBook fill in `quote_out` (produced by an adjacent
/// `pool::swap_exact_base_for_quote` in the same PTB) cleared `min_out`, then
/// emit the linking event. Borrows `quote_out` immutably — the caller retains
/// ownership and transfers it to the user afterward.
public fun assert_and_record<DBQuote>(
    quote_out: &Coin<DBQuote>,
    min_out: u64,
    hedge_base_in: u64,
    manager_id: ID,
    oracle_id: ID,
    expiry: u64,
    strike: u64,
    is_yes: bool,
    is_range: bool,
    lower_strike: u64,
    upper_strike: u64,
    stake_amount: u64,
    ctx: &TxContext,
) {
    let hedge_quote_out = coin::value(quote_out);
    assert_floor(hedge_quote_out, min_out);

    event::emit(HedgedSwapExecuted {
        trader: ctx.sender(),
        manager_id,
        oracle_id,
        expiry,
        strike,
        is_yes,
        is_range,
        lower_strike,
        upper_strike,
        stake_amount,
        hedge_base_in,
        hedge_quote_out,
        min_out,
    });
}
