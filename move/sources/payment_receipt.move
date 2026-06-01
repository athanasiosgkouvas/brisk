/// Verifiable on-chain payment receipts. A `Receipt` can ONLY be created by
/// `pay`, which itself moves the funds — so a receipt (and its `PaymentMade`
/// event) is unforgeable proof that the payment actually happened: the `amount`
/// is taken from the transferred coin and the `timestamp_ms` from the on-chain
/// `Clock`, never from caller-supplied args. The `Receipt` is soulbound
/// (`key`-only) to the payer. `pay` also returns a `PaymentProof` hot-potato
/// that `loyalty::earn` must consume in the same transaction — that's how
/// cashback is bound to a real, single payment (no forgery, no replay).
module brisk::payment_receipt;

use std::string::String;
use std::type_name::{Self, TypeName};
use sui::clock::Clock;
use sui::coin::Coin;
use sui::event;

/// Soulbound proof of a settled payment, held by the payer. `key`-only (no
/// `store`) so it can never be transferred or wrapped after issuance.
public struct Receipt has key {
    id: UID,
    payer: address,
    payee: address,
    amount: u64,
    currency: TypeName,
    memo: String,
    invoice_id: String,
    timestamp_ms: u64,
}

/// Hot potato proving a payment of `amount` by `payer` just settled. Has NO
/// abilities, so it cannot be stored, copied, dropped, or transferred — it MUST
/// be consumed in the same tx (by `loyalty::earn`, or discarded via
/// `discard_proof`). Only `pay` can mint one, so cashback can't be faked.
public struct PaymentProof {
    payer: address,
    amount: u64,
}

/// Indexable record of a settled payment. `copy + drop` (no String) so it can
/// live in an event; full detail (memo, invoice) is on the `Receipt`.
public struct PaymentMade has copy, drop {
    receipt: ID,
    payer: address,
    payee: address,
    amount: u64,
    currency: TypeName,
    timestamp_ms: u64,
}

/// Settle a payment: transfer `funds` to `payee`, mint a soulbound `Receipt` to
/// the payer, emit `PaymentMade`, and return a `PaymentProof` for cashback.
/// `amount` is the coin's value and `timestamp_ms` is the on-chain clock — both
/// authentic, neither caller-supplied.
public fun pay<T>(
    funds: Coin<T>,
    payee: address,
    memo: String,
    invoice_id: String,
    clock: &Clock,
    ctx: &mut TxContext,
): PaymentProof {
    let payer = ctx.sender();
    let amount = funds.value();
    let timestamp_ms = clock.timestamp_ms();
    transfer::public_transfer(funds, payee);

    let id = object::new(ctx);
    event::emit(PaymentMade {
        receipt: id.to_inner(),
        payer,
        payee,
        amount,
        currency: type_name::with_defining_ids<T>(),
        timestamp_ms,
    });
    transfer::transfer(
        Receipt {
            id,
            payer,
            payee,
            amount,
            currency: type_name::with_defining_ids<T>(),
            memo,
            invoice_id,
            timestamp_ms,
        },
        payer,
    );

    PaymentProof { payer, amount }
}

/// Consume a `PaymentProof`, returning (payer, amount). Used by `loyalty::earn`
/// to mint cashback bound to this exact payment.
public fun consume_proof(proof: PaymentProof): (address, u64) {
    let PaymentProof { payer, amount } = proof;
    (payer, amount)
}

/// Discard a `PaymentProof` without earning cashback (keeps `pay` usable in
/// flows that don't mint points).
public fun discard_proof(proof: PaymentProof) {
    let PaymentProof { payer: _, amount: _ } = proof;
}

public fun amount(r: &Receipt): u64 {
    r.amount
}

public fun payer(r: &Receipt): address {
    r.payer
}

public fun payee(r: &Receipt): address {
    r.payee
}

public fun invoice_id(r: &Receipt): String {
    r.invoice_id
}
