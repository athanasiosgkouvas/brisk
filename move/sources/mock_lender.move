/// Testnet money market behind the adapter seam (see `lender_adapter`), modeled
/// on real Sui blue-chip lenders (Suilend / Scallop) and Compound/Aave before
/// them — NOT a bespoke toy. Suppliers receive yield-bearing SHARES (the cToken /
/// sCoin model): you supply USDC and get shares priced by a global
/// `exchange_rate` that compounds over time; redeem burns shares at the current
/// rate. The protocol skims a `reserve_factor` of the accrued interest into
/// `reserves` (claimable to the Brisk treasury) — the on-chain implementation of
/// Brisk's yield-spread revenue, exactly like a real reserve factor.
///
/// The ONE testnet concession: real markets pay supplier interest out of
/// *borrower* repayments; with no borrow side here, the interest is funded from a
/// pre-seeded `backing` balance (admin `fund`). Everything else — share pricing,
/// compounding exchange rate, reserve factor, graceful redemption — mirrors a
/// real money market. On mainnet, swap this module for a Suilend/Scallop adapter
/// behind `lender_adapter` with no vault/app changes.
///
/// Solvency / graceful redemption: `redeem` pays `min(owed, backing)` and never
/// aborts; any shortfall (if the seeded backing is ever exhausted) is surfaced in
/// the `Redeemed` event. The exchange rate is time/index-driven, never derived
/// from `backing / total_shares`, so funding `backing` cannot move the share
/// price — structurally immune to the classic first-depositor inflation attack.
module brisk::mock_lender;

use sui::balance::{Self, Balance};
use sui::clock::Clock;
use sui::coin::{Self, Coin};
use sui::event;

/// Exchange-rate fixed-point scale: rate is `shares→underlying` × 1e12, starting
/// at 1.0 (1e12). Shares are minted as `amount * SCALE / rate`.
const INDEX_SCALE: u128 = 1_000_000_000_000;
const BPS_DENOM: u128 = 10_000;
const MS_PER_YEAR: u128 = 31_536_000_000;
/// Max configurable APY: 1000% (100_000 bps). Bounds the u128 intermediates.
const MAX_APY_BPS: u64 = 100_000;

const EApyTooHigh: u64 = 0;
const EReserveFactorTooHigh: u64 = 1;

/// Held by the publisher; gates pool creation/config, funding, and reserve claims.
public struct AdminCap has key, store {
    id: UID,
}

/// Shared lending pool for coin type `T` (one per asset, like a Suilend reserve).
public struct LendingPool<phantom T> has key {
    id: UID,
    /// Redeemable liquidity backing every supplier's shares. On a real market this
    /// is funded by borrower repayments; on testnet it is admin-seeded (`fund`).
    backing: Balance<T>,
    /// Protocol's accrued cut (reserve factor × interest), claimable to treasury.
    reserves: Balance<T>,
    /// Total shares outstanding across all suppliers.
    total_shares: u128,
    /// shares→underlying price × 1e12. Monotonically increases as interest accrues.
    exchange_rate: u128,
    /// Last time interest was folded into `exchange_rate`.
    last_accrual_ms: u64,
    /// Gross supply APY in basis points (10% = 1000).
    apy_bps: u64,
    /// Share of accrued interest routed to `reserves` (10% = 1000).
    reserve_factor_bps: u64,
}

/// A supplier's position: `shares` of the pool + the `principal_basis` (USDC cost
/// basis) kept only so the app can show "principal vs earned". `store` so the
/// spending_vault can custody it.
public struct Position<phantom T> has key, store {
    id: UID,
    shares: u128,
    principal_basis: u64,
}

// ─── Events (auditable trail) ───────────────────────────────────────────────

public struct PoolCreated has copy, drop { pool: ID, apy_bps: u64, reserve_factor_bps: u64 }
public struct Funded has copy, drop { amount: u64, backing: u64 }
public struct ApySet has copy, drop { apy_bps: u64 }
public struct Supplied has copy, drop { amount: u64, shares: u128 }
public struct Redeemed has copy, drop {
    shares: u128,
    /// Underlying owed at the current exchange rate.
    owed: u64,
    /// Underlying actually paid (== owed unless backing was exhausted).
    paid: u64,
    /// Owed − paid (0 when fully backed).
    shortfall: u64,
}
public struct ReservesClaimed has copy, drop { amount: u64 }

fun init(ctx: &mut TxContext) {
    transfer::transfer(AdminCap { id: object::new(ctx) }, ctx.sender());
}

/// Create a shared, empty pool for coin type `T` at a fixed gross APY (<= 1000%)
/// and reserve factor (<= 100%). The exchange rate starts at 1.0.
public fun create_pool<T>(
    _admin: &AdminCap,
    apy_bps: u64,
    reserve_factor_bps: u64,
    clock: &Clock,
    ctx: &mut TxContext,
) {
    assert!(apy_bps <= MAX_APY_BPS, EApyTooHigh);
    assert!(reserve_factor_bps <= (BPS_DENOM as u64), EReserveFactorTooHigh);
    let pool = LendingPool<T> {
        id: object::new(ctx),
        backing: balance::zero<T>(),
        reserves: balance::zero<T>(),
        total_shares: 0,
        exchange_rate: INDEX_SCALE,
        last_accrual_ms: clock.timestamp_ms(),
        apy_bps,
        reserve_factor_bps,
    };
    event::emit(PoolCreated {
        pool: object::id(&pool),
        apy_bps,
        reserve_factor_bps,
    });
    transfer::share_object(pool);
}

/// Seed/top-up the backing liquidity (stands in for borrower repayments).
public fun fund<T>(_admin: &AdminCap, pool: &mut LendingPool<T>, c: Coin<T>) {
    let amount = c.value();
    pool.backing.join(c.into_balance());
    event::emit(Funded { amount, backing: pool.backing.value() });
}

/// Update the gross APY. Accrues at the OLD rate first so the change is forward-only.
public fun set_apy<T>(_admin: &AdminCap, pool: &mut LendingPool<T>, apy_bps: u64, clock: &Clock) {
    assert!(apy_bps <= MAX_APY_BPS, EApyTooHigh);
    accrue_interest(pool, clock);
    pool.apy_bps = apy_bps;
    event::emit(ApySet { apy_bps });
}

/// Fold simple interest since `last_accrual_ms` into the exchange rate (so it
/// compounds across interactions, Compound-style), and move the reserve cut from
/// `backing` into `reserves`. Called at the start of every supply/redeem/set_apy.
public fun accrue_interest<T>(pool: &mut LendingPool<T>, clock: &Clock) {
    let now = clock.timestamp_ms();
    let elapsed = (if (now > pool.last_accrual_ms) now - pool.last_accrual_ms else 0) as u128;
    pool.last_accrual_ms = now;
    if (elapsed == 0 || pool.total_shares == 0) return;

    let rate = pool.exchange_rate;
    let apy = pool.apy_bps as u128;
    let rf = pool.reserve_factor_bps as u128;
    let denom = BPS_DENOM * MS_PER_YEAR;

    // Supplier-net portion raises the exchange rate: Δrate = rate * apy * elapsed
    // * (1 − rf) / year. Reserve portion is taken in underlying terms below.
    let rate_delta = rate * apy * elapsed * (BPS_DENOM - rf) / denom / BPS_DENOM;
    pool.exchange_rate = rate + rate_delta;

    // Reserve cut in underlying micros = totalValue * apy * elapsed * rf / year,
    // moved out of backing (clamped to what's available).
    let value = pool.total_shares * rate / INDEX_SCALE;
    let reserve_micros = (value * apy * elapsed * rf / denom / BPS_DENOM) as u64;
    let take = if (reserve_micros <= pool.backing.value()) reserve_micros else pool.backing.value();
    pool.reserves.join(pool.backing.split(take));
}

/// Supply `c` and receive a fresh Position (shares minted at the current rate).
public fun supply<T>(
    pool: &mut LendingPool<T>,
    c: Coin<T>,
    clock: &Clock,
    ctx: &mut TxContext,
): Position<T> {
    accrue_interest(pool, clock);
    let amount = c.value();
    let shares = (amount as u128) * INDEX_SCALE / pool.exchange_rate;
    pool.backing.join(c.into_balance());
    pool.total_shares = pool.total_shares + shares;
    event::emit(Supplied { amount, shares });
    Position { id: object::new(ctx), shares, principal_basis: amount }
}

/// Add `c` to an existing position (mints more shares at the current rate).
public fun supply_into<T>(
    pool: &mut LendingPool<T>,
    pos: &mut Position<T>,
    c: Coin<T>,
    clock: &Clock,
) {
    accrue_interest(pool, clock);
    let amount = c.value();
    let shares = (amount as u128) * INDEX_SCALE / pool.exchange_rate;
    pool.backing.join(c.into_balance());
    pool.total_shares = pool.total_shares + shares;
    pos.shares = pos.shares + shares;
    pos.principal_basis = pos.principal_basis + amount;
    event::emit(Supplied { amount, shares });
}

/// Redeem the whole position: burns its shares and pays `shares × rate` in
/// underlying, clamped to available backing (graceful — never aborts).
public fun redeem<T>(
    pool: &mut LendingPool<T>,
    pos: Position<T>,
    clock: &Clock,
    ctx: &mut TxContext,
): Coin<T> {
    accrue_interest(pool, clock);
    let Position { id, shares, principal_basis: _ } = pos;
    id.delete();

    let owed = (shares * pool.exchange_rate / INDEX_SCALE) as u64;
    pool.total_shares = pool.total_shares - shares;

    let available = pool.backing.value();
    let paid = if (owed <= available) owed else available;
    event::emit(Redeemed { shares, owed, paid, shortfall: owed - paid });
    coin::from_balance(pool.backing.split(paid), ctx)
}

/// Claim the protocol's accrued reserves (yield spread) to the caller (treasury).
public fun claim_reserves<T>(_admin: &AdminCap, pool: &mut LendingPool<T>, ctx: &mut TxContext): Coin<T> {
    let amount = pool.reserves.value();
    event::emit(ReservesClaimed { amount });
    coin::from_balance(pool.reserves.withdraw_all(), ctx)
}

// ─── Views ──────────────────────────────────────────────────────────────────

/// Exchange rate as of `now` WITHOUT mutating (for devInspect / value reads):
/// folds interest forward from `last_accrual_ms` the same way `accrue_interest` does.
public fun live_exchange_rate<T>(pool: &LendingPool<T>, clock: &Clock): u128 {
    let now = clock.timestamp_ms();
    let elapsed = (if (now > pool.last_accrual_ms) now - pool.last_accrual_ms else 0) as u128;
    if (elapsed == 0 || pool.total_shares == 0) return pool.exchange_rate;
    let rate = pool.exchange_rate;
    let rf = pool.reserve_factor_bps as u128;
    let rate_delta =
        rate * (pool.apy_bps as u128) * elapsed * (BPS_DENOM - rf) / (BPS_DENOM * MS_PER_YEAR) / BPS_DENOM;
    rate + rate_delta
}

/// Current redeemable value of a position (shares × live exchange rate).
public fun current_value<T>(pool: &LendingPool<T>, pos: &Position<T>, clock: &Clock): u64 {
    (pos.shares * live_exchange_rate(pool, clock) / INDEX_SCALE) as u64
}

/// Principal (USDC cost basis) of a position — excludes accrued yield.
public fun principal<T>(pos: &Position<T>): u64 {
    pos.principal_basis
}

public fun shares<T>(pos: &Position<T>): u128 {
    pos.shares
}

public fun exchange_rate<T>(pool: &LendingPool<T>): u128 {
    pool.exchange_rate
}

public fun apy_bps<T>(pool: &LendingPool<T>): u64 {
    pool.apy_bps
}

public fun reserve_factor_bps<T>(pool: &LendingPool<T>): u64 {
    pool.reserve_factor_bps
}

public fun backing_value<T>(pool: &LendingPool<T>): u64 {
    pool.backing.value()
}

public fun reserves_value<T>(pool: &LendingPool<T>): u64 {
    pool.reserves.value()
}

public fun total_shares<T>(pool: &LendingPool<T>): u128 {
    pool.total_shares
}

#[test_only]
public fun init_for_testing(ctx: &mut TxContext) {
    init(ctx);
}
