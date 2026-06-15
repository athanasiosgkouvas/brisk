#[test_only]
module brisk::merchant_registry_tests;

use brisk::merchant_registry;
use std::string;
use sui::test_scenario as ts;

#[test]
fun register_returns_bound_merchant_and_cap() {
    let owner = @0xA;
    let mut sc = ts::begin(owner);

    let (merchant, cap) = merchant_registry::register(
        string::utf8(b"Joe's Coffee"),
        ts::ctx(&mut sc),
    );
    assert!(merchant_registry::owner(&merchant) == owner, 0);
    // The cap is bound to this exact merchant.
    assert!(merchant_registry::controls(&cap, &merchant), 1);

    transfer::public_transfer(merchant, owner);
    transfer::public_transfer(cap, owner);
    ts::end(sc);
}
