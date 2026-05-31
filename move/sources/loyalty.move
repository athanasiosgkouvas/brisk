/// Cashback loyalty as closed-loop points. `Points` has `key` but NOT `store`,
/// so it can only be moved/destroyed by this module — a regulated, closed-loop
/// credit (no free transfers, no external composition). `earn` mints cashback
/// (a fraction of a payment) to the customer; `redeem` burns it. On mainnet the
/// mint would be gated behind a verified-payment hook; here it's called inside
/// the same atomic payment PTB that moves the funds.
module brisk::loyalty;

use sui::event;

/// 1% cashback (basis points of the payment amount).
const CASHBACK_BPS: u64 = 100;

const ENotOwner: u64 = 0;

public struct Points has key {
    id: UID,
    owner: address,
    amount: u64,
}

public struct CashbackEarned has copy, drop {
    recipient: address,
    amount: u64,
}

public struct CashbackRedeemed has copy, drop {
    owner: address,
    amount: u64,
}

/// Mint cashback for a payment of `payment_amount` to `recipient`.
public fun earn(recipient: address, payment_amount: u64, ctx: &mut TxContext) {
    let amount = payment_amount * CASHBACK_BPS / 10_000;
    if (amount == 0) return;
    event::emit(CashbackEarned { recipient, amount });
    // `Points` is key-only, so this transfer is the only way it moves — and it
    // can only happen here, inside the defining module.
    transfer::transfer(Points { id: object::new(ctx), owner: recipient, amount }, recipient);
}

/// Redeem (burn) a points object. Only its owner can.
public fun redeem(pts: Points, ctx: &TxContext) {
    assert!(pts.owner == ctx.sender(), ENotOwner);
    let Points { id, owner, amount } = pts;
    event::emit(CashbackRedeemed { owner, amount });
    id.delete();
}

public fun amount(p: &Points): u64 {
    p.amount
}

public fun cashback_bps(): u64 {
    CASHBACK_BPS
}
