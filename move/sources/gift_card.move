/// On-chain, closed-loop gift cards — a merchant-prepaid promise model. A
/// customer buys a card for a specific merchant: the protocol fee is skimmed to
/// the treasury and the REMAINDER (net) is paid to the merchant IMMEDIATELY, at
/// issuance. The merchant gives up the fee in exchange for being funded upfront
/// (working capital + breakage), exactly like a real gift-card program. The
/// `GiftCard` object therefore holds NO escrowed USDC — it is purely a
/// redeemable promise of `face` spending power at that merchant. The buyer
/// shares a claim link whose secret only they hold; the recipient `claim`s the
/// card to their address (zkSend-style hashed secret), then `redeem`s it to draw
/// down the promise when buying goods (no funds move — the merchant was already
/// paid). Fee % + destination live in a shared `GiftCardConfig` (admin-set) so
/// the fee is enforced on-chain, never supplied by the buyer. Mint is
/// permissionless (it's the buyer's own funds); claim is secret-gated; redeem is
/// recipient-gated and merchant-locked.
///
/// Storage note: the shared object keeps the original `Balance<T>` field (frozen
/// by Sui's upgrade-compatibility rules) but it is always EMPTY in this model;
/// the live, decrementing remaining-spend is tracked in the `face_value` field.
module brisk::gift_card;

use brisk::merchant_registry::{Self, Merchant};
use sui::balance::{Self, Balance};
use sui::clock::Clock;
use sui::coin;
use sui::event;
use sui::hash;

/// Supplied funds don't equal the stated face value.
const EWrongFunds: u64 = 0;
/// The card has already been claimed by a recipient.
const EAlreadyClaimed: u64 = 1;
/// blake2b256(secret) doesn't match the card's claim hash.
const EBadSecret: u64 = 2;
/// Caller is not the card's claimed recipient.
const ENotRecipient: u64 = 3;
/// The card is not redeemable at the supplied merchant.
const EWrongMerchant: u64 = 4;
/// Requested amount exceeds the escrowed balance.
const EInsufficient: u64 = 5;
/// Fee basis points exceed 100%.
const EFeeTooHigh: u64 = 6;

/// Protocol config — fee + destination, enforced on-chain. Shared at init.
public struct GiftCardConfig has key {
    id: UID,
    fee_bps: u64,
    treasury: address,
}

/// Admin authority to update the config. Held by the deployer.
public struct GiftCardAdminCap has key, store {
    id: UID,
}

/// A closed-loop gift card: a redeemable promise of value at `merchant`. Shared
/// so the (initially unknown) recipient's claim and the redeem PTB can both
/// reference it. `key`-only so it stays in shared state.
public struct GiftCard<phantom T> has key {
    id: UID,
    merchant: ID,
    buyer: address,
    recipient: Option<address>,
    claim_hash: vector<u8>,
    /// Always EMPTY in the prepaid model (the merchant is paid at mint). Kept
    /// only because Sui upgrades can't drop a struct field.
    balance: Balance<T>,
    /// The REMAINING redeemable spend (micros). Starts at the purchased face
    /// value and is drawn down by `redeem`. (Field name is frozen by upgrade
    /// rules; it now means "remaining", not the immutable original face.)
    face_value: u64,
    created_ms: u64,
    /// Forward-compat for a future buyer-reclaim-after-expiry path (0 = none).
    expires_ms: u64,
}

public struct GiftCardMinted has copy, drop {
    card: ID,
    merchant: ID,
    buyer: address,
    face_value: u64,
    fee: u64,
}

public struct GiftCardClaimed has copy, drop {
    card: ID,
    recipient: address,
}

public struct GiftCardRedeemed has copy, drop {
    card: ID,
    merchant: ID,
    amount: u64,
    remaining: u64,
}

public struct GiftCardRegifted has copy, drop {
    card: ID,
    by: address,
}

/// One-time setup, called by the deployer right after the package upgrade.
/// (Sui doesn't auto-run a module's `init` for modules ADDED via an upgrade on
/// this network, so config creation is an explicit call instead.) Shares the
/// `GiftCardConfig` and hands the caller a `GiftCardAdminCap`. The app uses the
/// specific config id recorded at deploy; any extra configs others might create
/// are inert.
public fun create_config(fee_bps: u64, treasury: address, ctx: &mut TxContext) {
    assert!(fee_bps <= 10000, EFeeTooHigh);
    transfer::share_object(GiftCardConfig {
        id: object::new(ctx),
        fee_bps,
        treasury,
    });
    transfer::transfer(GiftCardAdminCap { id: object::new(ctx) }, ctx.sender());
}

/// Buy a gift card for `merchant`. `funds` must equal `face`. The fee
/// (`face * config.fee_bps`) goes to the treasury and the NET (`face - fee`) is
/// paid to the merchant immediately — the card holds no escrow, it is a promise
/// of `face` spending power. `claim_hash` = blake2b256(secret); the secret
/// travels only in the share link and is never stored on-chain.
public fun mint<T>(
    config: &GiftCardConfig,
    merchant: &Merchant,
    mut funds: Balance<T>,
    face: u64,
    claim_hash: vector<u8>,
    clock: &Clock,
    ctx: &mut TxContext,
) {
    assert!(balance::value(&funds) == face, EWrongFunds);
    let fee = (((face as u128) * (config.fee_bps as u128)) / 10000) as u64;
    if (fee > 0) {
        let fee_coin = coin::from_balance(balance::split(&mut funds, fee), ctx);
        transfer::public_transfer(fee_coin, config.treasury);
    };
    // Pay the merchant their net UP FRONT; `funds` now holds exactly `face - fee`.
    let net_coin = coin::from_balance(funds, ctx);
    transfer::public_transfer(net_coin, merchant_registry::owner(merchant));
    let card = GiftCard<T> {
        id: object::new(ctx),
        merchant: object::id(merchant),
        buyer: ctx.sender(),
        recipient: option::none(),
        claim_hash,
        // No escrow — the merchant was just paid. `face_value` carries the
        // redeemable promise (full face: the recipient can spend the whole $X,
        // and the merchant — already net-funded — absorbs the fee).
        balance: balance::zero<T>(),
        face_value: face,
        created_ms: clock.timestamp_ms(),
        expires_ms: 0,
    };
    event::emit(GiftCardMinted {
        card: object::id(&card),
        merchant: object::id(merchant),
        buyer: ctx.sender(),
        face_value: face,
        fee,
    });
    transfer::share_object(card);
}

/// Claim a card to the caller's address by presenting the secret. First valid
/// claimer wins; a claimed card can't be re-claimed.
public fun claim<T>(card: &mut GiftCard<T>, secret: vector<u8>, ctx: &mut TxContext) {
    assert!(card.recipient.is_none(), EAlreadyClaimed);
    assert!(hash::blake2b256(&secret) == card.claim_hash, EBadSecret);
    card.recipient = option::some(ctx.sender());
    event::emit(GiftCardClaimed { card: object::id(card), recipient: ctx.sender() });
}

/// Redeem `amount` of the promise toward a purchase at the issuing merchant.
/// Only the claimed recipient may redeem, and only at the merchant the card was
/// minted for. No funds move — the merchant was paid at issuance; this just
/// draws down the remaining redeemable balance (preventing double-spend).
public fun redeem<T>(card: &mut GiftCard<T>, merchant: &Merchant, amount: u64, ctx: &mut TxContext) {
    assert!(card.recipient.contains(&ctx.sender()), ENotRecipient);
    assert!(card.merchant == object::id(merchant), EWrongMerchant);
    assert!(card.face_value >= amount, EInsufficient);
    card.face_value = card.face_value - amount;
    event::emit(GiftCardRedeemed {
        card: object::id(card),
        merchant: object::id(merchant),
        amount,
        remaining: card.face_value,
    });
}

/// Re-gift a claimed card onward. The current recipient resets the card so a
/// fresh claim link (with a NEW secret) can be handed to someone else: recipient
/// is cleared and `new_claim_hash` installed. Only the current recipient may
/// re-gift, and only while value remains. The merchant binding and remaining
/// value are untouched (the merchant was already paid at issuance).
public fun regift<T>(card: &mut GiftCard<T>, new_claim_hash: vector<u8>, ctx: &mut TxContext) {
    assert!(card.recipient.contains(&ctx.sender()), ENotRecipient);
    assert!(card.face_value > 0, EInsufficient);
    card.recipient = option::none();
    card.claim_hash = new_claim_hash;
    event::emit(GiftCardRegifted { card: object::id(card), by: ctx.sender() });
}

/// Update the protocol fee (bps, <= 100%). Cap-gated.
public fun set_fee(_admin: &GiftCardAdminCap, config: &mut GiftCardConfig, fee_bps: u64) {
    assert!(fee_bps <= 10000, EFeeTooHigh);
    config.fee_bps = fee_bps;
}

/// Update the fee destination. Cap-gated.
public fun set_treasury(_admin: &GiftCardAdminCap, config: &mut GiftCardConfig, treasury: address) {
    config.treasury = treasury;
}

// --- views ---
/// Remaining redeemable spend (the on-chain escrow is always empty in the
/// prepaid model, so this reports `face_value`, which `redeem` draws down).
public fun balance_of<T>(card: &GiftCard<T>): u64 { card.face_value }

public fun merchant_of<T>(card: &GiftCard<T>): ID { card.merchant }

public fun recipient_of<T>(card: &GiftCard<T>): Option<address> { card.recipient }

/// Remaining redeemable spend (same as `balance_of`; the field name is frozen).
public fun face_value_of<T>(card: &GiftCard<T>): u64 { card.face_value }

public fun fee_bps(config: &GiftCardConfig): u64 { config.fee_bps }

public fun treasury(config: &GiftCardConfig): address { config.treasury }

#[test_only]
public fun init_for_testing(ctx: &mut TxContext) {
    create_config(300, ctx.sender(), ctx);
}
