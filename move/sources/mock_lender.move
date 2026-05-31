/// Testnet lender behind the adapter interface (see lender_adapter): a shared
/// `LendingPool<T>` that accrues deterministic, time-based yield from an
/// admin-funded reserve, so the Save flow is fully demonstrable without a
/// mainnet money market. On mainnet this module is swapped for a real
/// Suilend/Scallop adapter exposing the same supply/redeem/current_value shape.
module brisk::mock_lender;

use sui::balance::{Self, Balance};
use sui::clock::Clock;
use sui::coin::{Self, Coin};

const MS_PER_YEAR: u128 = 31_536_000_000;
const BPS_DENOM: u128 = 10_000;

const EInsufficientReserve: u64 = 0;

/// Held by the publisher; gates pool creation/config.
public struct AdminCap has key, store {
    id: UID,
}

/// Shared lending pool for coin type `T`. `reserve` holds both supplied
/// principal and the yield buffer the admin tops up via `fund`.
public struct LendingPool<phantom T> has key {
    id: UID,
    reserve: Balance<T>,
    apy_bps: u64,
}

/// A user's supply position. `store` so the spending_vault can custody it.
public struct Position<phantom T> has key, store {
    id: UID,
    principal: u64,
    since_ms: u64,
}

fun init(ctx: &mut TxContext) {
    transfer::transfer(AdminCap { id: object::new(ctx) }, ctx.sender());
}

public fun create_pool<T>(_admin: &AdminCap, apy_bps: u64, ctx: &mut TxContext) {
    transfer::share_object(LendingPool<T> {
        id: object::new(ctx),
        reserve: balance::zero<T>(),
        apy_bps,
    });
}

/// Admin tops up the yield reserve.
public fun fund<T>(pool: &mut LendingPool<T>, c: Coin<T>) {
    pool.reserve.join(c.into_balance());
}

/// Supply `c` and receive a Position recording principal + start time.
public fun supply<T>(
    pool: &mut LendingPool<T>,
    c: Coin<T>,
    clock: &Clock,
    ctx: &mut TxContext,
): Position<T> {
    let principal = c.value();
    pool.reserve.join(c.into_balance());
    Position { id: object::new(ctx), principal, since_ms: clock.timestamp_ms() }
}

/// Principal + accrued yield as of now: principal * apy_bps * elapsed / (1e4 * yearMs).
public fun current_value<T>(pool: &LendingPool<T>, pos: &Position<T>, clock: &Clock): u64 {
    let elapsed = (clock.timestamp_ms() - pos.since_ms) as u128;
    let accrued = (pos.principal as u128) * (pool.apy_bps as u128) * elapsed / (BPS_DENOM * MS_PER_YEAR);
    pos.principal + (accrued as u64)
}

/// Redeem the whole position for principal + accrued yield.
public fun redeem<T>(
    pool: &mut LendingPool<T>,
    pos: Position<T>,
    clock: &Clock,
    ctx: &mut TxContext,
): Coin<T> {
    let value = current_value(pool, &pos, clock);
    assert!(pool.reserve.value() >= value, EInsufficientReserve);
    let Position { id, principal: _, since_ms: _ } = pos;
    id.delete();
    coin::take(&mut pool.reserve, value, ctx)
}

public fun apy_bps<T>(pool: &LendingPool<T>): u64 {
    pool.apy_bps
}

public fun reserve_value<T>(pool: &LendingPool<T>): u64 {
    pool.reserve.value()
}

public fun principal<T>(pos: &Position<T>): u64 {
    pos.principal
}

#[test_only]
public fun init_for_testing(ctx: &mut TxContext) {
    init(ctx);
}
