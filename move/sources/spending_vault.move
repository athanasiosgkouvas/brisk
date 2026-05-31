/// The yield-bearing spending account ("Save" bucket). A per-user `Vault<T>`
/// custodies a single lender `Position`, so idle stablecoin earns yield while
/// staying instantly spendable. Funds are routed through the lender
/// (`mock_lender` on testnet; a real Suilend/Scallop adapter on mainnet — the
/// only swap point). Value conservation is the core invariant: withdraw returns
/// exactly principal + accrued, never minting value out of nothing.
module brisk::spending_vault;

use brisk::mock_lender::{Self, LendingPool, Position};
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
/// re-supply) so one position carries the latest accrual basis.
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
        c.join(mock_lender::redeem(pool, old, clock, ctx));
    };
    vault.position.fill(mock_lender::supply(pool, c, clock, ctx));
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
    let mut all = mock_lender::redeem(pool, pos, clock, ctx);
    let out = all.split(amount, ctx);
    if (all.value() > 0) {
        vault.position.fill(mock_lender::supply(pool, all, clock, ctx));
    } else {
        all.destroy_zero();
    };
    out
}

/// Current redeemable value (principal + accrued) of the Save balance.
public fun current_value<T>(vault: &Vault<T>, pool: &LendingPool<T>, clock: &Clock): u64 {
    if (vault.position.is_some()) {
        mock_lender::current_value(pool, vault.position.borrow(), clock)
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
