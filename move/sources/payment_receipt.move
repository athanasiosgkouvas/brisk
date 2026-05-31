/// Verifiable on-chain payment receipts. When a merchant payment settles, a
/// `Receipt` object is created as immutable proof (payer, payee, amount,
/// currency, memo, invoice id, time) and handed to the payer. A `PaymentMade`
/// event is emitted for off-chain indexing — a merchant lists their sales by
/// querying `PaymentMade` where `payee == <merchant address>`.
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

/// Indexable record of a settled payment. Only `copy` types (no String) so it
/// can live in an event; full detail (memo, invoice) is on the `Receipt`.
public struct PaymentMade has copy, drop {
    receipt: ID,
    payer: address,
    payee: address,
    amount: u64,
    currency: TypeName,
    timestamp_ms: u64,
}

/// Mint a receipt for a settled payment in currency `T`. Emits `PaymentMade`
/// and returns the `Receipt` so the caller (a PTB) can hand it to the payer.
public fun issue<T>(
    payer: address,
    payee: address,
    amount: u64,
    memo: String,
    invoice_id: String,
    timestamp_ms: u64,
    ctx: &mut TxContext,
): Receipt {
    let id = object::new(ctx);
    event::emit(PaymentMade {
        receipt: id.to_inner(),
        payer,
        payee,
        amount,
        currency: type_name::with_defining_ids<T>(),
        timestamp_ms,
    });
    Receipt {
        id,
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

public fun payer(r: &Receipt): address {
    r.payer
}

public fun payee(r: &Receipt): address {
    r.payee
}

public fun invoice_id(r: &Receipt): String {
    r.invoice_id
}
