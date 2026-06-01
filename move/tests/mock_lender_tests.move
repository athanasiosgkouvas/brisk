#[test_only]
module brisk::mock_lender_tests;

use brisk::mock_lender::{Self, AdminCap, LendingPool};
use sui::clock;
use sui::coin;
use sui::sui::SUI;
use sui::test_scenario as ts;

const YEAR_MS: u64 = 31_536_000_000;

fun new_pool(admin: address, apy_bps: u64, buffer: u64): ts::Scenario {
    let mut sc = ts::begin(admin);
    mock_lender::init_for_testing(ts::ctx(&mut sc));
    ts::next_tx(&mut sc, admin);
    let cap = ts::take_from_sender<AdminCap>(&sc);
    mock_lender::create_pool<SUI>(&cap, apy_bps, ts::ctx(&mut sc));
    ts::next_tx(&mut sc, admin);
    let mut pool = ts::take_shared<LendingPool<SUI>>(&sc);
    mock_lender::fund_yield(&cap, &mut pool, coin::mint_for_testing<SUI>(buffer, ts::ctx(&mut sc)));
    ts::return_shared(pool);
    ts::return_to_sender(&sc, cap);
    ts::next_tx(&mut sc, admin);
    sc
}

// Yield comes only from the funded buffer; principal is held 1:1 and untouched.
#[test]
fun redeem_pays_principal_from_principal_pool_yield_from_buffer() {
    let admin = @0xA;
    let mut sc = new_pool(admin, 1000, 50_000);
    let mut pool = ts::take_shared<LendingPool<SUI>>(&sc);
    let mut clk = clock::create_for_testing(ts::ctx(&mut sc));

    let pos = mock_lender::supply(&mut pool, coin::mint_for_testing<SUI>(100_000, ts::ctx(&mut sc)), &clk, ts::ctx(&mut sc));
    assert!(mock_lender::principal_value(&pool) == 100_000, 0);
    assert!(mock_lender::yield_reserve_value(&pool) == 50_000, 1);

    clk.increment_for_testing(YEAR_MS); // accrued = 10_000
    let out = mock_lender::redeem(&mut pool, pos, &clk, ts::ctx(&mut sc));
    assert!(out.value() == 110_000, 2);
    assert!(mock_lender::principal_value(&pool) == 0, 3); // principal fully returned
    assert!(mock_lender::yield_reserve_value(&pool) == 40_000, 4); // only yield drawn from buffer

    coin::burn_for_testing(out);
    clk.destroy_for_testing();
    ts::return_shared(pool);
    ts::end(sc);
}

// Underfunded buffer: redeem still returns ALL principal + whatever yield is
// left, and never aborts (this is the bug the old commingled design had).
#[test]
fun redeem_is_graceful_when_yield_buffer_is_short() {
    let admin = @0xA;
    let mut sc = new_pool(admin, 1000, 3_000); // buffer < accrued
    let mut pool = ts::take_shared<LendingPool<SUI>>(&sc);
    let mut clk = clock::create_for_testing(ts::ctx(&mut sc));

    let pos = mock_lender::supply(&mut pool, coin::mint_for_testing<SUI>(100_000, ts::ctx(&mut sc)), &clk, ts::ctx(&mut sc));
    clk.increment_for_testing(YEAR_MS); // accrued = 10_000, buffer only 3_000

    let out = mock_lender::redeem(&mut pool, pos, &clk, ts::ctx(&mut sc));
    // Principal (100_000) + capped yield (3_000) = 103_000. No abort.
    assert!(out.value() == 103_000, 0);
    assert!(mock_lender::yield_reserve_value(&pool) == 0, 1);
    assert!(mock_lender::principal_value(&pool) == 0, 2);

    coin::burn_for_testing(out);
    clk.destroy_for_testing();
    ts::return_shared(pool);
    ts::end(sc);
}

// current_value/accrued track the linear APY schedule.
#[test]
fun accrual_is_linear_in_time() {
    let admin = @0xA;
    let mut sc = new_pool(admin, 1000, 1_000_000);
    let mut pool = ts::take_shared<LendingPool<SUI>>(&sc);
    let mut clk = clock::create_for_testing(ts::ctx(&mut sc));

    let pos = mock_lender::supply(&mut pool, coin::mint_for_testing<SUI>(100_000, ts::ctx(&mut sc)), &clk, ts::ctx(&mut sc));
    assert!(mock_lender::accrued(&pool, &pos, &clk) == 0, 0);

    clk.increment_for_testing(YEAR_MS / 2); // half a year -> ~5%
    assert!(mock_lender::accrued(&pool, &pos, &clk) == 5_000, 1);
    assert!(mock_lender::current_value(&pool, &pos, &clk) == 105_000, 2);

    let out = mock_lender::redeem(&mut pool, pos, &clk, ts::ctx(&mut sc));
    coin::burn_for_testing(out);
    clk.destroy_for_testing();
    ts::return_shared(pool);
    ts::end(sc);
}

// APY is bounded so the yield-formula u128 intermediate can't overflow.
#[test, expected_failure(abort_code = brisk::mock_lender::EApyTooHigh)]
fun create_pool_rejects_excessive_apy() {
    let admin = @0xA;
    let mut sc = ts::begin(admin);
    mock_lender::init_for_testing(ts::ctx(&mut sc));
    ts::next_tx(&mut sc, admin);
    let cap = ts::take_from_sender<AdminCap>(&sc);
    mock_lender::create_pool<SUI>(&cap, 100_001, ts::ctx(&mut sc)); // > 1000% → abort
    ts::return_to_sender(&sc, cap);
    ts::end(sc);
}
