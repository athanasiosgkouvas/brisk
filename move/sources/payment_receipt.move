/// Verifiable on-chain payment receipts. A `Receipt` can ONLY be created by
/// `pay`, which itself moves the funds — so a receipt (and its `PaymentMade`
/// event) is unforgeable proof that the payment actually happened: the `amount`
/// is taken from the transferred coin and the `timestamp_ms` from the on-chain
/// `Clock`, never from caller-supplied args. The `Receipt` is soulbound
/// (`key`-only) to the payer.
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
/// the payer, and emit `PaymentMade`. `amount` is the coin's value and
/// `timestamp_ms` is the on-chain clock — both authentic, neither caller-supplied.
public fun pay<T>(
    funds: Coin<T>,
    payee: address,
    memo: String,
    invoice_id: String,
    clock: &Clock,
    ctx: &mut TxContext,
) {
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
