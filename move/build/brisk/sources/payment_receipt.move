/// Verifiable on-chain payment receipts. When a merchant payment settles, a
/// `Receipt` object is created as immutable proof (payer, payee, amount,
/// currency, memo, invoice id, time). A `PaymentMade` event is emitted for
/// off-chain indexing (merchant payment history).
module brisk::payment_receipt;

use std::string::String;
use std::type_name::{Self, TypeName};
use sui::event;

public struct Receipt has key, store {
    id: UID,
    payer: address,
    payee: address,
    amount: u64,
    currency: TypeName,
    memo: String,
    invoice_id: String,
    timestamp_ms: u64,
}

public struct PaymentMade has copy, drop {
    payer: address,
    payee: address,
    amount: u64,
}

/// Mint a receipt for a settled payment in currency `T`. Returns the object so
/// the caller (a PTB) can transfer/freeze it as needed.
public fun issue<T>(
    payer: address,
    payee: address,
    amount: u64,
    memo: String,
    invoice_id: String,
    timestamp_ms: u64,
    ctx: &mut TxContext,
): Receipt {
    event::emit(PaymentMade { payer, payee, amount });
    Receipt {
        id: object::new(ctx),
        payer,
        payee,
        amount,
        currency: type_name::with_defining_ids<T>(),
        memo,
        invoice_id,
        timestamp_ms,
    }
}

public fun amount(r: &Receipt): u64 {
    r.amount
}
