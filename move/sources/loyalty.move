/// Cashback loyalty as closed-loop points. `Points` has `key` but NOT `store`,
/// so it can only be moved/destroyed by this module — a regulated, closed-loop
/// credit (no free transfers, no external composition). `earn` mints cashback
/// for the payer of a real payment: it consumes a `payment_receipt::PaymentProof`
/// hot potato, which only `payment_receipt::pay` can mint and which must be
/// consumed in the same tx — so cashback can't be minted without a genuine
/// payment, and never twice for the same one. `redeem` burns points.
module brisk::loyalty;

use brisk::payment_receipt::{Self, PaymentProof};
use sui::event;

/// 1% cashback (basis points of the payment amount).
const CASHBACK_BPS: u128 = 100;
const BPS_DENOM: u128 = 10_000;

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

/// Mint cashback for a real payment by consuming its `PaymentProof`. The proof
/// (from `payment_receipt::pay`) is a hot potato — it can't be forged or reused,
/// so points map 1:1 to genuine payments. Cashback goes to the payer.
public fun earn(proof: PaymentProof, ctx: &mut TxContext) {
    let (recipient, payment_amount) = payment_receipt::consume_proof(proof);
    let amount = ((payment_amount as u128) * CASHBACK_BPS / BPS_DENOM) as u64;
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
    CASHBACK_BPS as u64
}
