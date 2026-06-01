/// Testnet lender behind the adapter seam (see `lender_adapter`): a shared
/// `LendingPool<T>` that accrues deterministic, time-based yield. On mainnet this
/// module is swapped for a real Suilend/Scallop adapter exposing the same
/// supply / redeem / current_value shape.
///
/// Solvency by construction. The pool keeps two separate balances:
///   - `principal`  — the sum of every supplier's principal, held 1:1 and never
///     drawn down to pay yield. A supplier's principal is therefore *always*
///     redeemable, regardless of how much yield others have taken.
///   - `yield_reserve` — an admin-funded buffer that pays accrued yield.
/// `redeem` returns `principal` (always available) + `min(accrued, yield_reserve)`
/// (best-effort), so it can never abort for insufficient funds. If the yield
/// buffer ever runs dry the supplier still gets all principal back plus whatever
/// yield remains — the shortfall is surfaced in the `Redeemed` event.
module brisk::mock_lender;

use sui::balance::{Self, Balance};
use sui::clock::Clock;
use sui::coin::{Self, Coin};
use sui::event;

const MS_PER_YEAR: u128 = 31_536_000_000;
const BPS_DENOM: u128 = 10_000;

/// Held by the publisher; gates pool creation/config and yield funding.
public struct AdminCap has key, store {
    id: UID,
}

/// Shared lending pool for coin type `T`.
public struct LendingPool<phantom T> has key {
    id: UID,
    /// Sum of all supplied principal, 1:1. Never spent on yield.
    principal: Balance<T>,
    /// Admin-funded buffer that yield is paid from.
    yield_reserve: Balance<T>,
    apy_bps: u64,
}

/// A user's supply position. `store` so the spending_vault can custody it.
public struct Position<phantom T> has key, store {
    id: UID,
    principal: u64,
    since_ms: u64,
}

// ─── Events (auditable trail) ───────────────────────────────────────────────

public struct PoolCreated has copy, drop { pool: ID, apy_bps: u64 }
public struct YieldFunded has copy, drop { amount: u64, yield_reserve: u64 }
public struct Supplied has copy, drop { principal: u64, since_ms: u64 }
public struct Redeemed has copy, drop {
    principal: u64,
    yield_paid: u64,
    /// Accrued yield that the buffer couldn't cover (0 when fully funded).
    yield_shortfall: u64,
}

fun init(ctx: &mut TxContext) {
    transfer::transfer(AdminCap { id: object::new(ctx) }, ctx.sender());
}

/// Create a shared, empty pool for coin type `T` at a fixed APY.
public fun create_pool<T>(_admin: &AdminCap, apy_bps: u64, ctx: &mut TxContext) {
    let pool = LendingPool<T> {
        id: object::new(ctx),
        principal: balance::zero<T>(),
        yield_reserve: balance::zero<T>(),
        apy_bps,
    };
    event::emit(PoolCreated { pool: object::id(&pool), apy_bps });
    transfer::share_object(pool);
}

/// Admin tops up the yield buffer (the only place yield is paid from).
public fun fund_yield<T>(_admin: &AdminCap, pool: &mut LendingPool<T>, c: Coin<T>) {
    let amount = c.value();
    pool.yield_reserve.join(c.into_balance());
    event::emit(YieldFunded { amount, yield_reserve: pool.yield_reserve.value() });
}

/// Supply `c` and receive a Position recording principal + start time.
public fun supply<T>(
    pool: &mut LendingPool<T>,
    c: Coin<T>,
    clock: &Clock,
    ctx: &mut TxContext,
): Position<T> {
    let principal = c.value();
    pool.principal.join(c.into_balance());
    let since_ms = clock.timestamp_ms();
    event::emit(Supplied { principal, since_ms });
    Position { id: object::new(ctx), principal, since_ms }
}

/// Accrued yield for a position as of now: `principal * apy_bps * elapsed / (1e4 * yearMs)`.
public fun accrued<T>(pool: &LendingPool<T>, pos: &Position<T>, clock: &Clock): u64 {
    let elapsed = (clock.timestamp_ms() - pos.since_ms) as u128;
    let yield_u128 =
        (pos.principal as u128) * (pool.apy_bps as u128) * elapsed / (BPS_DENOM * MS_PER_YEAR);
    yield_u128 as u64
}

/// Principal + accrued yield as of now (what the position has earned).
public fun current_value<T>(pool: &LendingPool<T>, pos: &Position<T>, clock: &Clock): u64 {
    pos.principal + accrued(pool, pos, clock)
}

/// Redeem the whole position. Returns principal (always) + accrued yield capped
/// at the available buffer (best-effort). Never aborts for insufficient funds.
public fun redeem<T>(
    pool: &mut LendingPool<T>,
    pos: Position<T>,
    clock: &Clock,
    ctx: &mut TxContext,
): Coin<T> {
    let accrued_yield = accrued(pool, &pos, clock);
    let Position { id, principal, since_ms: _ } = pos;
    id.delete();

    let available = pool.yield_reserve.value();
    let yield_paid = if (accrued_yield <= available) accrued_yield else available;

    let mut out = pool.principal.split(principal); // always covered — held 1:1
    out.join(pool.yield_reserve.split(yield_paid)); // best-effort

    event::emit(Redeemed {
        principal,
        yield_paid,
        yield_shortfall: accrued_yield - yield_paid,
    });
    coin::from_balance(out, ctx)
}

// ─── Views ──────────────────────────────────────────────────────────────────

public fun apy_bps<T>(pool: &LendingPool<T>): u64 {
    pool.apy_bps
}

public fun principal_value<T>(pool: &LendingPool<T>): u64 {
    pool.principal.value()
}

public fun yield_reserve_value<T>(pool: &LendingPool<T>): u64 {
    pool.yield_reserve.value()
}

public fun principal<T>(pos: &Position<T>): u64 {
    pos.principal
}

public fun since_ms<T>(pos: &Position<T>): u64 {
    pos.since_ms
}

#[test_only]
public fun init_for_testing(ctx: &mut TxContext) {
    init(ctx);
}
