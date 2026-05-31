#[test_only]
module brisk::merchant_registry_tests;

use brisk::merchant_registry::{Self, Merchant, MerchantCap};
use std::string;
use sui::test_scenario;

#[test]
fun register_gives_owner_a_merchant_and_cap() {
    let owner = @0xA;
    let mut sc = test_scenario::begin(owner);

    merchant_registry::register(string::utf8(b"Joe's Coffee"), test_scenario::ctx(&mut sc));

    test_scenario::next_tx(&mut sc, owner);
    assert!(test_scenario::has_most_recent_for_sender<Merchant>(&sc), 0);
    assert!(test_scenario::has_most_recent_for_sender<MerchantCap>(&sc), 1);

    let merchant = test_scenario::take_from_sender<Merchant>(&sc);
    assert!(merchant_registry::owner(&merchant) == owner, 2);
    test_scenario::return_to_sender(&sc, merchant);

    test_scenario::end(sc);
}
