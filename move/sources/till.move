/// Merchant receiving accounts ("tills"). A `Till` is the customer-facing
/// destination for payments — its own object id/address is what goes into a
/// payment link / NFC tag, so the merchant's private treasury (the zkLogin
/// address that holds their capital + Save yield) is NEVER exposed to a paying
/// customer. Funds collected in a till are swept to the recorded `treasury`.
///
/// Customers pay into a till the same feeless way they pay anyone: a native
/// gasless `0x2::balance::send_funds<T>(balance, till_address)`, which lands in
/// the till object's *funds accumulator* (no coin object, no gas). `sweep` then
/// drains that accumulator to `treasury` via `balance::withdraw_funds_from_object`
/// — authorized purely by holding the till's `&mut UID`, which the shared
/// `&mut Till` provides. `sweep` is therefore **permissionless** and the
/// destination is read from on-chain state (never a caller argument), so a
/// server cron can sweep on the merchant's behalf without their signature while
/// funds can only ever reach the recorded treasury. Privileged ops (creating a
/// till, changing its treasury/name/active state) are `MerchantCap`-gated.
module brisk::till;

use brisk::merchant_registry::{Self, Merchant, MerchantCap};
use std::string::String;
use std::type_name::{Self, TypeName};
use sui::accumulator::AccumulatorRoot;
use sui::balance;
use sui::coin;
use sui::event;

/// The supplied `MerchantCap` does not control the supplied `Merchant`.
const ENotMerchantCap: u64 = 0;
/// The till does not belong to the supplied `Merchant`.
const EWrongMerchant: u64 = 1;

/// A customer-facing receiving account. Shared so a customer's payment PTB and
/// the permissionless `sweep` can both reference it. `key`-only (no `store`) so
/// it can't be wrapped or transferred away from the shared state.
public struct Till has key {
    id: UID,
    /// The `Merchant` this till collects for (binds privileged ops to the cap).
    merchant: ID,
    /// Sweep destination — the merchant's private treasury. Changeable ONLY via
    /// `set_treasury` (MerchantCap-gated); `sweep` reads it, never a caller arg.
    treasury: address,
    name: String,
    active: bool,
}

public struct TillCreated has copy, drop {
    till: ID,
    merchant: ID,
    treasury: address,
    name: String,
}

public struct Swept has copy, drop {
    till: ID,
    treasury: address,
    amount: u64,
    currency: TypeName,
}

public struct TreasuryChanged has copy, drop {
    till: ID,
    old_treasury: address,
    new_treasury: address,
}

/// Create a named receiving account for `merchant` and share it. Cap-gated so a
/// till can only be minted by the merchant that controls it. `treasury` is the
/// sweep destination (typically the merchant's own zkLogin address).
public fun create_till(
    cap: &MerchantCap,
    merchant: &Merchant,
    name: String,
    treasury: address,
    ctx: &mut TxContext,
) {
    assert!(merchant_registry::controls(cap, merchant), ENotMerchantCap);
    let till = Till {
        id: object::new(ctx),
        merchant: object::id(merchant),
        treasury,
        name,
        active: true,
    };
    event::emit(TillCreated {
        till: object::id(&till),
        merchant: object::id(merchant),
        treasury,
        name,
    });
    transfer::share_object(till);
}

/// Drain all settled `T` funds at the till's address to the recorded treasury.
/// PERMISSIONLESS by design — anyone (the merchant tapping "Move to treasury",
/// or the daily server cron) may call it, because funds can only ever go to
/// `till.treasury`. No-op when there is nothing to sweep, so a cron iterating
/// every till never aborts the batch on an empty one. The amount is read on-chain
/// from the accumulator root (`settled_funds_value`) so concurrent sweeps are
/// safe: the second sees 0 and returns.
public fun sweep<T>(till: &mut Till, root: &AccumulatorRoot, ctx: &mut TxContext) {
    let till_addr = object::uid_to_address(&till.id);
    let amount = balance::settled_funds_value<T>(root, till_addr);
    if (amount == 0) return;

    let withdrawal = balance::withdraw_funds_from_object<T>(&mut till.id, amount);
    let bal = balance::redeem_funds(withdrawal);
    let payout = coin::from_balance(bal, ctx);

    let treasury = till.treasury;
    event::emit(Swept {
        till: object::id(till),
        treasury,
        amount,
        currency: type_name::with_defining_ids<T>(),
    });
    transfer::public_transfer(payout, treasury);
}

/// Repoint the till's sweep destination. The only way to change where funds go —
/// cap-gated and bound to this till's merchant, so a stolen-but-capless party
/// can't redirect a merchant's collections.
public fun set_treasury(
    cap: &MerchantCap,
    merchant: &Merchant,
    till: &mut Till,
    new_treasury: address,
) {
    assert!(merchant_registry::controls(cap, merchant), ENotMerchantCap);
    assert!(till.merchant == object::id(merchant), EWrongMerchant);
    let old_treasury = till.treasury;
    till.treasury = new_treasury;
    event::emit(TreasuryChanged { till: object::id(till), old_treasury, new_treasury });
}

/// Rename a till (display only). Cap-gated.
public fun rename(cap: &MerchantCap, merchant: &Merchant, till: &mut Till, name: String) {
    assert!(merchant_registry::controls(cap, merchant), ENotMerchantCap);
    assert!(till.merchant == object::id(merchant), EWrongMerchant);
    till.name = name;
}

/// Enable/disable a till (e.g. retire a per-client account). Cap-gated. Disabled
/// tills can still be swept (so any straggler funds reach the treasury); the app
/// just stops offering them in the Charge picker.
public fun set_active(cap: &MerchantCap, merchant: &Merchant, till: &mut Till, active: bool) {
    assert!(merchant_registry::controls(cap, merchant), ENotMerchantCap);
    assert!(till.merchant == object::id(merchant), EWrongMerchant);
    till.active = active;
}

/// The address customers pay into (the till object's address).
public fun receiving_address(till: &Till): address {
    object::uid_to_address(&till.id)
}

public fun treasury(till: &Till): address {
    till.treasury
}

public fun merchant(till: &Till): ID {
    till.merchant
}

public fun name(till: &Till): String {
    till.name
}

public fun is_active(till: &Till): bool {
    till.active
}
