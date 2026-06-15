#[test_only]
module brisk::till_tests;

use brisk::merchant_registry::{Self, Merchant, MerchantCap};
use brisk::till::{Self, Till};
use std::string;
use sui::test_scenario as ts;

const OWNER: address = @0xA;
const TREASURY: address = @0xBEEF;

fun new_merchant(name: vector<u8>, sc: &mut ts::Scenario): (Merchant, MerchantCap) {
    merchant_registry::register(string::utf8(name), ts::ctx(sc))
}

#[test]
fun create_till_shares_an_active_account_bound_to_the_merchant() {
    let mut sc = ts::begin(OWNER);
    let (merchant, cap) = new_merchant(b"Joe's Coffee", &mut sc);

    till::create_till(&cap, &merchant, string::utf8(b"Main"), TREASURY, ts::ctx(&mut sc));

    ts::next_tx(&mut sc, OWNER);
    let t = ts::take_shared<Till>(&sc);
    assert!(till::treasury(&t) == TREASURY, 0);
    assert!(till::name(&t) == string::utf8(b"Main"), 1);
    assert!(till::merchant(&t) == object::id(&merchant), 2);
    assert!(till::is_active(&t), 3);
    // The customer-facing address is the till object's own address — never the treasury.
    assert!(till::receiving_address(&t) != TREASURY, 4);
    ts::return_shared(t);

    transfer::public_transfer(merchant, OWNER);
    transfer::public_transfer(cap, OWNER);
    ts::end(sc);
}

#[test]
fun set_treasury_repoints_the_sweep_destination() {
    let mut sc = ts::begin(OWNER);
    let (merchant, cap) = new_merchant(b"Joe's Coffee", &mut sc);
    till::create_till(&cap, &merchant, string::utf8(b"Main"), TREASURY, ts::ctx(&mut sc));

    ts::next_tx(&mut sc, OWNER);
    let mut t = ts::take_shared<Till>(&sc);
    let new_treasury = @0xCAFE;
    till::set_treasury(&cap, &merchant, &mut t, new_treasury);
    assert!(till::treasury(&t) == new_treasury, 0);
    ts::return_shared(t);

    transfer::public_transfer(merchant, OWNER);
    transfer::public_transfer(cap, OWNER);
    ts::end(sc);
}

#[test]
fun rename_and_disable_are_cap_gated_happy_path() {
    let mut sc = ts::begin(OWNER);
    let (merchant, cap) = new_merchant(b"Joe's Coffee", &mut sc);
    till::create_till(&cap, &merchant, string::utf8(b"Main"), TREASURY, ts::ctx(&mut sc));

    ts::next_tx(&mut sc, OWNER);
    let mut t = ts::take_shared<Till>(&sc);
    till::rename(&cap, &merchant, &mut t, string::utf8(b"Acme Corp"));
    assert!(till::name(&t) == string::utf8(b"Acme Corp"), 0);
    till::set_active(&cap, &merchant, &mut t, false);
    assert!(!till::is_active(&t), 1);
    ts::return_shared(t);

    transfer::public_transfer(merchant, OWNER);
    transfer::public_transfer(cap, OWNER);
    ts::end(sc);
}

#[test]
#[expected_failure(abort_code = brisk::till::ENotMerchantCap)]
fun set_treasury_with_a_cap_that_doesnt_control_the_merchant_aborts() {
    let mut sc = ts::begin(OWNER);
    let (merchant_a, cap_a) = new_merchant(b"Merchant A", &mut sc);
    let (merchant_b, cap_b) = new_merchant(b"Merchant B", &mut sc);
    till::create_till(&cap_a, &merchant_a, string::utf8(b"Main"), TREASURY, ts::ctx(&mut sc));

    ts::next_tx(&mut sc, OWNER);
    let mut t = ts::take_shared<Till>(&sc);
    // cap_b does not control merchant_a → ENotMerchantCap.
    till::set_treasury(&cap_b, &merchant_a, &mut t, @0xCAFE);
    ts::return_shared(t);

    transfer::public_transfer(merchant_a, OWNER);
    transfer::public_transfer(cap_a, OWNER);
    transfer::public_transfer(merchant_b, OWNER);
    transfer::public_transfer(cap_b, OWNER);
    ts::end(sc);
}

#[test]
#[expected_failure(abort_code = brisk::till::EWrongMerchant)]
fun set_treasury_on_a_foreign_merchants_till_aborts() {
    let mut sc = ts::begin(OWNER);
    let (merchant_a, cap_a) = new_merchant(b"Merchant A", &mut sc);
    let (merchant_b, cap_b) = new_merchant(b"Merchant B", &mut sc);
    // Till belongs to merchant A.
    till::create_till(&cap_a, &merchant_a, string::utf8(b"Main"), TREASURY, ts::ctx(&mut sc));

    ts::next_tx(&mut sc, OWNER);
    let mut t = ts::take_shared<Till>(&sc);
    // cap_b controls merchant_b, but the till is A's → EWrongMerchant.
    till::set_treasury(&cap_b, &merchant_b, &mut t, @0xCAFE);
    ts::return_shared(t);

    transfer::public_transfer(merchant_a, OWNER);
    transfer::public_transfer(cap_a, OWNER);
    transfer::public_transfer(merchant_b, OWNER);
    transfer::public_transfer(cap_b, OWNER);
    ts::end(sc);
}
