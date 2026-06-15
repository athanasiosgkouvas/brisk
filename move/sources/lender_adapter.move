/// The single seam between testnet and mainnet. `spending_vault` routes every
/// lender operation (supply / redeem / value / principal) through this adapter
/// instead of calling a money market directly. On testnet the adapter delegates
/// to `mock_lender`; on mainnet you replace the bodies below with calls into a
/// real Suilend/Scallop market exposing the same shape — the vault and the app
/// stay untouched.
///
/// The `LendingPool`/`Position` types are re-exported from `mock_lender` so the
/// vault names them through one place; swapping lenders means swapping this
/// module's `use` + bodies together.
module brisk::lender_adapter;

use brisk::mock_lender::{Self, LendingPool, Position};
use sui::clock::Clock;
use sui::coin::Coin;

/// Supply idle stablecoin to the lender, receiving a yield-bearing position.
public fun supply<T>(
    pool: &mut LendingPool<T>,
    c: Coin<T>,
    clock: &Clock,
    ctx: &mut TxContext,
): Position<T> {
    mock_lender::supply(pool, c, clock, ctx)
}

/// Add to an existing position (mints more shares at the current exchange rate).
public fun supply_into<T>(
    pool: &mut LendingPool<T>,
    pos: &mut Position<T>,
    c: Coin<T>,
    clock: &Clock,
) {
    mock_lender::supply_into(pool, pos, c, clock)
}

/// Redeem a position for principal + accrued yield.
public fun redeem<T>(
    pool: &mut LendingPool<T>,
    pos: Position<T>,
    clock: &Clock,
    ctx: &mut TxContext,
): Coin<T> {
    mock_lender::redeem(pool, pos, clock, ctx)
}

/// Current redeemable value (principal + accrued yield) of a position.
public fun current_value<T>(pool: &LendingPool<T>, pos: &Position<T>, clock: &Clock): u64 {
    mock_lender::current_value(pool, pos, clock)
}

/// Principal component of a position (excludes accrued yield).
public fun principal<T>(pos: &Position<T>): u64 {
    mock_lender::principal(pos)
}
