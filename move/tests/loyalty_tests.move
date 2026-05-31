#[test_only]
module brisk::loyalty_tests;

use brisk::loyalty::{Self, Points};
use sui::test_scenario as ts;

#[test]
fun earn_mints_one_percent_then_redeem_burns() {
    let user = @0xA;
    let mut sc = ts::begin(user);

    // 1% of 4_500_000 = 45_000.
    loyalty::earn(user, 4_500_000, ts::ctx(&mut sc));
    ts::next_tx(&mut sc, user);

    let pts = ts::take_from_sender<Points>(&sc);
    assert!(loyalty::amount(&pts) == 45_000, 0);

    loyalty::redeem(pts, ts::ctx(&mut sc));
    ts::next_tx(&mut sc, user);
    assert!(!ts::has_most_recent_for_sender<Points>(&sc), 1);

    ts::end(sc);
}
