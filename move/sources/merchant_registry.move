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

public fun name(m: &Merchant): String {
    m.name
}

/// True iff `cap` is the capability for `m`. Privileged actions (refunds, etc.)
/// must check this so one merchant's cap can't authorize action on another's.
public fun controls(cap: &MerchantCap, m: &Merchant): bool {
    cap.merchant == object::id(m)
}

/// Register a new merchant, returning the profile and its cap so the caller (a
/// PTB) places them — composable, and avoids the self-transfer lint.
public fun register(name: String, ctx: &mut TxContext): (Merchant, MerchantCap) {
    let merchant = Merchant { id: object::new(ctx), owner: ctx.sender(), name };
    let cap = MerchantCap { id: object::new(ctx), merchant: object::id(&merchant) };
    (merchant, cap)
}

/// Onboarding entrypoint: register, **share** the `Merchant` profile (so a
/// customer's payment PTB can reference it — owned objects can only be used by
/// their owner), and hand the `MerchantCap` to the caller. The profile is a
/// public, read-only shared object; only the cap (kept by the merchant) confers
/// control, so sharing leaks no authority. The cap self-transfer is intentional
/// (the registering merchant should hold it); `register` is the composable,
/// return-the-cap variant for callers that want to place it themselves.
#[allow(lint(self_transfer))]
public fun register_and_share(name: String, ctx: &mut TxContext) {
    let (merchant, cap) = register(name, ctx);
    transfer::share_object(merchant);
    transfer::transfer(cap, ctx.sender());
}
