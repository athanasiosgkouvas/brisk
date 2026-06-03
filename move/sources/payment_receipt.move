/// Verifiable on-chain payment receipts. A `Receipt` can ONLY be created by
/// `pay`, which itself moves the funds — so a receipt (and its `PaymentMade`
/// event) is unforgeable proof that the payment actually happened: the `amount`
/// is split from the transferred coin, the `payee`/`merchant` come from the
/// referenced `Merchant` profile (never a caller-supplied address), and the
/// `timestamp_ms` from the on-chain `Clock`. The `Receipt` is soulbound
/// (`key`-only) to the payer.
module brisk::payment_receipt;

use brisk::merchant_registry::{Self, Merchant, MerchantCap};
use std::string::String;
use std::type_name::{Self, TypeName};
use sui::clock::Clock;
use sui::coin::{Self, Coin};
use sui::event;

/// Caller passed a coin worth less than the requested `amount`.
const EInsufficientFunds: u64 = 0;
/// The supplied `MerchantCap` does not control the supplied `Merchant`.
const ENotMerchantCap: u64 = 1;

/// Soulbound proof of a settled payment, held by the payer. `key`-only (no
/// `store`) so it can never be transferred or wrapped after issuance.
public struct Receipt has key {
    id: UID,
    payer: address,
    payee: address,
    merchant: ID,
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
    merchant: ID,
    amount: u64,
    currency: TypeName,
    timestamp_ms: u64,
}

/// Indexable record of a merchant-issued refund.
public struct RefundMade has copy, drop {
    merchant: ID,
    /// The original `Receipt` this refund references (informational).
    receipt: ID,
    payer: address,
    amount: u64,
    currency: TypeName,
    timestamp_ms: u64,
}

/// Settle a payment to `merchant`: split exactly `amount` from `funds`, transfer
/// it to the merchant's payout address, return any change to the payer, mint a
/// soulbound `Receipt` to the payer, and emit `PaymentMade`. `amount` is asserted
/// against the coin value (no silent over-payment), `payee`/`merchant` are read
/// from the `Merchant` profile, and `timestamp_ms` is the on-chain clock — none
/// are forgeable by the caller. The change coin and soulbound receipt both go
/// to the payer (ctx.sender) by design, hence the self-transfer allow.
#[allow(lint(self_transfer))]
public fun pay<T>(
    merchant: &Merchant,
    mut funds: Coin<T>,
    amount: u64,
    memo: String,
    invoice_id: String,
    clock: &Clock,
    ctx: &mut TxContext,
) {
    let payer = ctx.sender();
    assert!(coin::value(&funds) >= amount, EInsufficientFunds);

    // Take exactly the invoiced amount; return any change to the payer so an
    // over-funded coin can't quietly pay the merchant more than the receipt says.
    let payment = coin::split(&mut funds, amount, ctx);
    if (coin::value(&funds) == 0) {
        coin::destroy_zero(funds);
    } else {
        transfer::public_transfer(funds, payer);
    };

    let payee = merchant_registry::owner(merchant);
    let merchant_id = object::id(merchant);
    let timestamp_ms = clock.timestamp_ms();
    transfer::public_transfer(payment, payee);

    let id = object::new(ctx);
    event::emit(PaymentMade {
        receipt: id.to_inner(),
        payer,
        payee,
        merchant: merchant_id,
        amount,
        currency: type_name::with_defining_ids<T>(),
        timestamp_ms,
    });
    transfer::transfer(
        Receipt {
            id,
            payer,
            payee,
            merchant: merchant_id,
            amount,
            currency: type_name::with_defining_ids<T>(),
            memo,
            invoice_id,
            timestamp_ms,
        },
        payer,
    );
}

/// Refund a customer. Capability-gated: the caller must present the `MerchantCap`
/// that controls `merchant`, so one merchant can never refund "as" another. The
/// merchant funds the refund itself (`funds`), it is sent to `to` (the original
/// payer), and a `RefundMade` event records the link to `original_receipt`.
public fun refund<T>(
    cap: &MerchantCap,
    merchant: &Merchant,
    to: address,
    original_receipt: ID,
    funds: Coin<T>,
    clock: &Clock,
) {
    assert!(merchant_registry::controls(cap, merchant), ENotMerchantCap);
    let amount = coin::value(&funds);
    transfer::public_transfer(funds, to);
    event::emit(RefundMade {
        merchant: object::id(merchant),
        receipt: original_receipt,
        payer: to,
        amount,
        currency: type_name::with_defining_ids<T>(),
        timestamp_ms: clock.timestamp_ms(),
    });
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

public fun merchant(r: &Receipt): ID {
    r.merchant
}

public fun invoice_id(r: &Receipt): String {
    r.invoice_id
}
