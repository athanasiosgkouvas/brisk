/// The yield-bearing spending account ("Save" bucket). A per-user `Vault<T>`
/// custodies a single lender `Position`, so idle stablecoin earns yield while
/// staying instantly spendable. Funds are routed through `lender_adapter` — the
/// single testnet→mainnet swap point (`mock_lender` today, a real
/// Suilend/Scallop adapter on mainnet). Value conservation is the core
/// invariant: withdraw returns exactly principal + accrued, never minting value
/// out of nothing.
module brisk::spending_vault;

use brisk::lender_adapter;
use brisk::mock_lender::{LendingPool, Position};
use sui::clock::Clock;
use sui::coin::Coin;

const ENotOwner: u64 = 0;
const ENoFunds: u64 = 1;

public struct Vault<phantom T> has key {
    id: UID,
    owner: address,
    position: Option<Position<T>>,
}

/// Open an empty Save vault owned by the caller.
public fun open<T>(ctx: &mut TxContext) {
    transfer::transfer(
        Vault<T> { id: object::new(ctx), owner: ctx.sender(), position: option::none() },
        ctx.sender(),
    );
}

/// Deposit into Save. Consolidates with any existing position (redeem + merge +
/// re-supply) so one position carries the latest accrual basis. Folding accrued
/// yield into the re-supplied principal is intentional — yield compounds.
public fun deposit<T>(
    vault: &mut Vault<T>,
    mut c: Coin<T>,
    pool: &mut LendingPool<T>,
    clock: &Clock,
    ctx: &mut TxContext,
) {
    assert!(vault.owner == ctx.sender(), ENotOwner);
    if (vault.position.is_some()) {
        let old = vault.position.extract();
        c.join(lender_adapter::redeem(pool, old, clock, ctx));
    };
    vault.position.fill(lender_adapter::supply(pool, c, clock, ctx));
}

/// Withdraw `amount` (principal + accrued) as a Coin; re-supplies the remainder.
public fun withdraw<T>(
    vault: &mut Vault<T>,
    amount: u64,
    pool: &mut LendingPool<T>,
    clock: &Clock,
    ctx: &mut TxContext,
): Coin<T> {
    assert!(vault.owner == ctx.sender(), ENotOwner);
    assert!(vault.position.is_some(), ENoFunds);

    let pos = vault.position.extract();
    let mut all = lender_adapter::redeem(pool, pos, clock, ctx);
    let out = all.split(amount, ctx);
    if (all.value() > 0) {
        vault.position.fill(lender_adapter::supply(pool, all, clock, ctx));
    } else {
        all.destroy_zero();
    };
    out
}

/// Current redeemable value (principal + accrued) of the Save balance.
public fun current_value<T>(vault: &Vault<T>, pool: &LendingPool<T>, clock: &Clock): u64 {
    if (vault.position.is_some()) {
        lender_adapter::current_value(pool, vault.position.borrow(), clock)
    } else {
        0
    }
}

/// Principal component of the Save balance (excludes accrued yield) — lets the
/// app show "principal vs earned" without a second on-chain shape.
public fun principal<T>(vault: &Vault<T>): u64 {
    if (vault.position.is_some()) {
        lender_adapter::principal(vault.position.borrow())
    } else {
        0
    }
}

public fun owner<T>(vault: &Vault<T>): address {
    vault.owner
}

public fun has_funds<T>(vault: &Vault<T>): bool {
    vault.position.is_some()
}
