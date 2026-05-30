/// Merchant identity for Brisk. A merchant registers once and receives a
/// `Merchant` object (their on-chain profile) plus a `MerchantCap` proving
/// control. Receipts and settlements reference the `Merchant` id.
module brisk::merchant_registry;

use std::string::String;

public struct Merchant has key, store {
    id: UID,
    owner: address,
    name: String,
}

/// Capability proving control of a `Merchant`. Held by the merchant; required
/// for privileged actions (e.g. refunds) added in later phases.
public struct MerchantCap has key, store {
    id: UID,
    merchant: ID,
}

public fun merchant_id(cap: &MerchantCap): ID {
    cap.merchant
}

public fun owner(m: &Merchant): address {
    m.owner
}

/// Register a new merchant. Transfers the profile and its cap to the caller.
public fun register(name: String, ctx: &mut TxContext) {
    let owner = ctx.sender();
    let merchant = Merchant { id: object::new(ctx), owner, name };
    let cap = MerchantCap { id: object::new(ctx), merchant: object::id(&merchant) };
    transfer::transfer(merchant, owner);
    transfer::transfer(cap, owner);
}
