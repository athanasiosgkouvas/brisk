#[test_only]
module brisk::payment_receipt_tests;

use brisk::merchant_registry;
use brisk::payment_receipt::{Self, Receipt};
use std::string;
use sui::clock;
use sui::coin::{Self, Coin};
use sui::sui::SUI;
use sui::test_scenario as ts;
use sui::test_utils::destroy;

#[test]
fun pay_links_merchant_mints_authentic_receipt_and_returns_change() {
    let merchant_owner = @0xB;
    let payer = @0xA;
    let mut sc = ts::begin(merchant_owner);

    // Merchant registers (profile owned/paid-to @0xB).
    let (merchant, cap) = merchant_registry::register(
        string::utf8(b"Coffee"),
        ts::ctx(&mut sc),
    );

    // Payer over-funds (5.0) but the invoice is 4.5 — the contract must take
    // exactly 4.5 and hand back 0.5 as change.
    ts::next_tx(&mut sc, payer);
    let clk = clock::create_for_testing(ts::ctx(&mut sc));
    let funds = coin::mint_for_testing<SUI>(5_000_000, ts::ctx(&mut sc));

    payment_receipt::pay<SUI>(
        &merchant,
        funds,
        4_500_000,
        string::utf8(b"coffee"),
        string::utf8(b"inv-1"),
        &clk,
        ts::ctx(&mut sc),
    );

    // Receipt is soulbound to the payer with the asserted amount + merchant link.
    ts::next_tx(&mut sc, payer);
    let r = ts::take_from_sender<Receipt>(&sc);
    assert!(payment_receipt::amount(&r) == 4_500_000, 0);
    assert!(payment_receipt::payer(&r) == payer, 1);
    assert!(payment_receipt::payee(&r) == merchant_owner, 2);
    assert!(payment_receipt::merchant(&r) == object::id(&merchant), 3);
    assert!(payment_receipt::invoice_id(&r) == string::utf8(b"inv-1"), 4);
    ts::return_to_sender(&sc, r);

    // Payer got exactly the 0.5 change back.
    let change = ts::take_from_sender<Coin<SUI>>(&sc);
    assert!(change.value() == 500_000, 5);
    ts::return_to_sender(&sc, change);

    // The merchant received exactly the invoiced 4.5.
    ts::next_tx(&mut sc, merchant_owner);
    let got = ts::take_from_sender<Coin<SUI>>(&sc);
    assert!(got.value() == 4_500_000, 6);
    ts::return_to_sender(&sc, got);

    destroy(merchant);
    destroy(cap);
    clk.destroy_for_testing();
    ts::end(sc);
}

#[test]
fun pay_exact_amount_leaves_no_change() {
    let merchant_owner = @0xB;
    let payer = @0xA;
    let mut sc = ts::begin(merchant_owner);
    let (merchant, cap) = merchant_registry::register(string::utf8(b"Shop"), ts::ctx(&mut sc));

    ts::next_tx(&mut sc, payer);
    let clk = clock::create_for_testing(ts::ctx(&mut sc));
    let funds = coin::mint_for_testing<SUI>(1_000_000, ts::ctx(&mut sc));
    payment_receipt::pay<SUI>(
        &merchant,
        funds,
        1_000_000,
        string::utf8(b""),
        string::utf8(b"inv-2"),
        &clk,
        ts::ctx(&mut sc),
    );

    // No change object should have been created for the payer.
    ts::next_tx(&mut sc, payer);
    assert!(!ts::has_most_recent_for_sender<Coin<SUI>>(&sc), 0);

    destroy(merchant);
    destroy(cap);
    clk.destroy_for_testing();
    ts::end(sc);
}

#[test]
#[expected_failure(abort_code = brisk::payment_receipt::EInsufficientFunds)]
fun pay_aborts_when_funds_below_amount() {
    let merchant_owner = @0xB;
    let payer = @0xA;
    let mut sc = ts::begin(merchant_owner);
    let (merchant, cap) = merchant_registry::register(string::utf8(b"Shop"), ts::ctx(&mut sc));

    ts::next_tx(&mut sc, payer);
    let clk = clock::create_for_testing(ts::ctx(&mut sc));
    let funds = coin::mint_for_testing<SUI>(999_999, ts::ctx(&mut sc));
    // Requesting more than the coin holds must abort.
    payment_receipt::pay<SUI>(
        &merchant,
        funds,
        1_000_000,
        string::utf8(b""),
        string::utf8(b"inv-3"),
        &clk,
        ts::ctx(&mut sc),
    );

    destroy(merchant);
    destroy(cap);
    clk.destroy_for_testing();
    ts::end(sc);
}

#[test]
fun refund_with_controlling_cap_pays_the_customer() {
    let merchant_owner = @0xB;
    let customer = @0xA;
    let mut sc = ts::begin(merchant_owner);
    let (merchant, cap) = merchant_registry::register(string::utf8(b"Shop"), ts::ctx(&mut sc));
    let clk = clock::create_for_testing(ts::ctx(&mut sc));
    let refund_coin = coin::mint_for_testing<SUI>(2_000_000, ts::ctx(&mut sc));

    payment_receipt::refund<SUI>(
        &cap,
        &merchant,
        customer,
        object::id_from_address(@0xCAFE), // stand-in for an original receipt id
        refund_coin,
        &clk,
    );

    // The customer received the refund.
    ts::next_tx(&mut sc, customer);
    let got = ts::take_from_sender<Coin<SUI>>(&sc);
    assert!(got.value() == 2_000_000, 0);
    ts::return_to_sender(&sc, got);

    destroy(merchant);
    destroy(cap);
    clk.destroy_for_testing();
    ts::end(sc);
}

#[test]
#[expected_failure(abort_code = brisk::payment_receipt::ENotMerchantCap)]
fun refund_with_foreign_cap_aborts() {
    let merchant_owner = @0xB;
    let customer = @0xA;
    let mut sc = ts::begin(merchant_owner);
    // Two distinct merchants; cap of #2 must not be able to refund "as" #1.
    let (merchant1, cap1) = merchant_registry::register(string::utf8(b"One"), ts::ctx(&mut sc));
    let (merchant2, cap2) = merchant_registry::register(string::utf8(b"Two"), ts::ctx(&mut sc));
    let clk = clock::create_for_testing(ts::ctx(&mut sc));
    let refund_coin = coin::mint_for_testing<SUI>(1_000_000, ts::ctx(&mut sc));

    payment_receipt::refund<SUI>(
        &cap2, // wrong cap for merchant1
        &merchant1,
        customer,
        object::id_from_address(@0xCAFE),
        refund_coin,
        &clk,
    );

    destroy(merchant1);
    destroy(merchant2);
    destroy(cap1);
    destroy(cap2);
    clk.destroy_for_testing();
    ts::end(sc);
}
