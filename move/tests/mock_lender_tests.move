#[test_only]
module brisk::mock_lender_tests;

use brisk::mock_lender::{Self, AdminCap, LendingPool};
use sui::clock::{Self, Clock};
use sui::coin;
use sui::sui::SUI;
use sui::test_scenario as ts;

const YEAR_MS: u64 = 31_536_000_000;

// Admin-owned pool at `apy`/`reserve_factor`, backing seeded with `backing`.
// Returns the scenario (at `admin`) and a fresh Clock at t=0.
fun setup(admin: address, apy: u64, rf: u64, backing: u64): (ts::Scenario, Clock) {
    let mut sc = ts::begin(admin);
    mock_lender::init_for_testing(ts::ctx(&mut sc));
    ts::next_tx(&mut sc, admin);

    let cap = ts::take_from_sender<AdminCap>(&sc);
    let clk = clock::create_for_testing(ts::ctx(&mut sc));
    mock_lender::create_pool<SUI>(&cap, apy, rf, &clk, ts::ctx(&mut sc));
    ts::next_tx(&mut sc, admin);

    let mut pool = ts::take_shared<LendingPool<SUI>>(&sc);
    mock_lender::fund(&cap, &mut pool, coin::mint_for_testing<SUI>(backing, ts::ctx(&mut sc)));
    ts::return_shared(pool);
    ts::return_to_sender(&sc, cap);
    ts::next_tx(&mut sc, admin);
    (sc, clk)
}

#[test]
fun supply_mints_shares_and_value_compounds() {
    let admin = @0xA;
    let (mut sc, mut clk) = setup(admin, 1000, 0, 1_000_000); // 10% APY, 0% reserve
    let mut pool = ts::take_shared<LendingPool<SUI>>(&sc);

    let pos = mock_lender::supply(&mut pool, coin::mint_for_testing<SUI>(100_000, ts::ctx(&mut sc)), &clk, ts::ctx(&mut sc));
    // rate starts at 1.0 → shares == amount.
    assert!(mock_lender::shares(&pos) == 100_000, 0);
    assert!(mock_lender::current_value(&pool, &pos, &clk) == 100_000, 1);
    assert!(mock_lender::principal(&pos) == 100_000, 2);

    clk.increment_for_testing(YEAR_MS); // +1y at 10% → 110_000
    assert!(mock_lender::current_value(&pool, &pos, &clk) == 110_000, 3);

    let out = mock_lender::redeem(&mut pool, pos, &clk, ts::ctx(&mut sc));
    assert!(out.value() == 110_000, 4);

    coin::burn_for_testing(out);
    clk.destroy_for_testing();
    ts::return_shared(pool);
    ts::end(sc);
}

#[test]
fun reserve_factor_routes_cut_to_reserves() {
    let admin = @0xA;
    let (mut sc, mut clk) = setup(admin, 1000, 1000, 1_000_000); // 10% APY, 10% reserve factor
    let mut pool = ts::take_shared<LendingPool<SUI>>(&sc);

    let pos = mock_lender::supply(&mut pool, coin::mint_for_testing<SUI>(100_000, ts::ctx(&mut sc)), &clk, ts::ctx(&mut sc));
    clk.increment_for_testing(YEAR_MS);
    // Supplier nets 90% of the 10% gross → 9% = 109_000; protocol keeps 1% = 1_000.
    assert!(mock_lender::current_value(&pool, &pos, &clk) == 109_000, 0);

    // redeem triggers accrue, which moves the reserve cut out of backing.
    let out = mock_lender::redeem(&mut pool, pos, &clk, ts::ctx(&mut sc));
    assert!(out.value() == 109_000, 1);
    assert!(mock_lender::reserves_value(&pool) == 1_000, 2);

    ts::next_tx(&mut sc, admin);
    let cap = ts::take_from_sender<AdminCap>(&sc);
    let claimed = mock_lender::claim_reserves(&cap, &mut pool, ts::ctx(&mut sc));
    assert!(claimed.value() == 1_000, 3);
    assert!(mock_lender::reserves_value(&pool) == 0, 4);

    coin::burn_for_testing(out);
    coin::burn_for_testing(claimed);
    ts::return_to_sender(&sc, cap);
    clk.destroy_for_testing();
    ts::return_shared(pool);
    ts::end(sc);
}

#[test]
fun redeem_clamps_gracefully_when_backing_short() {
    let admin = @0xA;
    // Seed only 3_000 backing; supplying 100k makes backing 103_000 < 110k owed.
    let (mut sc, mut clk) = setup(admin, 1000, 0, 3_000);
    let mut pool = ts::take_shared<LendingPool<SUI>>(&sc);

    let pos = mock_lender::supply(&mut pool, coin::mint_for_testing<SUI>(100_000, ts::ctx(&mut sc)), &clk, ts::ctx(&mut sc));
    clk.increment_for_testing(YEAR_MS);
    assert!(mock_lender::current_value(&pool, &pos, &clk) == 110_000, 0); // optimistic view

    let out = mock_lender::redeem(&mut pool, pos, &clk, ts::ctx(&mut sc));
    assert!(out.value() == 103_000, 1); // clamped to backing, no abort

    coin::burn_for_testing(out);
    clk.destroy_for_testing();
    ts::return_shared(pool);
    ts::end(sc);
}

#[test]
fun multi_user_shares_are_isolated() {
    let admin = @0xA;
    let (mut sc, mut clk) = setup(admin, 1000, 0, 1_000_000);
    let mut pool = ts::take_shared<LendingPool<SUI>>(&sc);

    let pa = mock_lender::supply(&mut pool, coin::mint_for_testing<SUI>(100_000, ts::ctx(&mut sc)), &clk, ts::ctx(&mut sc));
    let pb = mock_lender::supply(&mut pool, coin::mint_for_testing<SUI>(100_000, ts::ctx(&mut sc)), &clk, ts::ctx(&mut sc));
    clk.increment_for_testing(YEAR_MS);

    let oa = mock_lender::redeem(&mut pool, pa, &clk, ts::ctx(&mut sc));
    assert!(oa.value() == 110_000, 0);
    // Bob's position still redeems in full from the shared backing.
    let ob = mock_lender::redeem(&mut pool, pb, &clk, ts::ctx(&mut sc));
    assert!(ob.value() == 110_000, 1);

    coin::burn_for_testing(oa);
    coin::burn_for_testing(ob);
    clk.destroy_for_testing();
    ts::return_shared(pool);
    ts::end(sc);
}

#[test]
fun supply_into_adds_shares_at_current_rate() {
    let admin = @0xA;
    let (mut sc, mut clk) = setup(admin, 1000, 0, 1_000_000);
    let mut pool = ts::take_shared<LendingPool<SUI>>(&sc);

    let mut pos = mock_lender::supply(&mut pool, coin::mint_for_testing<SUI>(100_000, ts::ctx(&mut sc)), &clk, ts::ctx(&mut sc));
    clk.increment_for_testing(YEAR_MS); // rate → 1.1
    // Add 110_000 → mints 110_000 / 1.1 = 100_000 shares; total 200_000 shares.
    mock_lender::supply_into(&mut pool, &mut pos, coin::mint_for_testing<SUI>(110_000, ts::ctx(&mut sc)), &clk);
    assert!(mock_lender::shares(&pos) == 200_000, 0);
    assert!(mock_lender::principal(&pos) == 210_000, 1);
    assert!(mock_lender::current_value(&pool, &pos, &clk) == 220_000, 2); // 200_000 × 1.1

    let out = mock_lender::redeem(&mut pool, pos, &clk, ts::ctx(&mut sc));
    assert!(out.value() == 220_000, 3);

    coin::burn_for_testing(out);
    clk.destroy_for_testing();
    ts::return_shared(pool);
    ts::end(sc);
}

#[test]
fun set_apy_is_forward_only() {
    let admin = @0xA;
    let (mut sc, mut clk) = setup(admin, 1000, 0, 1_000_000);
    let mut pool = ts::take_shared<LendingPool<SUI>>(&sc);

    let pos = mock_lender::supply(&mut pool, coin::mint_for_testing<SUI>(100_000, ts::ctx(&mut sc)), &clk, ts::ctx(&mut sc));
    clk.increment_for_testing(YEAR_MS); // accrued to 110_000

    ts::next_tx(&mut sc, admin);
    let cap = ts::take_from_sender<AdminCap>(&sc);
    mock_lender::set_apy(&cap, &mut pool, 0, &clk); // settle at 10%, then 0% going forward
    assert!(mock_lender::current_value(&pool, &pos, &clk) == 110_000, 0);

    clk.increment_for_testing(YEAR_MS); // 0% APY → no further growth
    assert!(mock_lender::current_value(&pool, &pos, &clk) == 110_000, 1);

    let out = mock_lender::redeem(&mut pool, pos, &clk, ts::ctx(&mut sc));
    assert!(out.value() == 110_000, 2);

    coin::burn_for_testing(out);
    ts::return_to_sender(&sc, cap);
    clk.destroy_for_testing();
    ts::return_shared(pool);
    ts::end(sc);
}

#[test, expected_failure(abort_code = mock_lender::EApyTooHigh)]
fun create_pool_rejects_excessive_apy() {
    let admin = @0xA;
    let mut sc = ts::begin(admin);
    mock_lender::init_for_testing(ts::ctx(&mut sc));
    ts::next_tx(&mut sc, admin);
    let cap = ts::take_from_sender<AdminCap>(&sc);
    let clk = clock::create_for_testing(ts::ctx(&mut sc));
    mock_lender::create_pool<SUI>(&cap, 100_001, 0, &clk, ts::ctx(&mut sc)); // > MAX_APY_BPS
    abort 42
}
