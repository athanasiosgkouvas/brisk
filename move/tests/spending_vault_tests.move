#[test_only]
module brisk::spending_vault_tests;

use brisk::mock_lender::{Self, AdminCap, LendingPool};
use brisk::spending_vault::{Self, Vault};
use sui::clock::{Self, Clock};
use sui::coin;
use sui::sui::SUI;
use sui::test_scenario as ts;

const YEAR_MS: u64 = 31_536_000_000;

// Admin-owned pool (0% reserve factor for clean numbers), backing seeded.
fun setup(admin: address, apy: u64, backing: u64): (ts::Scenario, Clock) {
    let mut sc = ts::begin(admin);
    mock_lender::init_for_testing(ts::ctx(&mut sc));
    ts::next_tx(&mut sc, admin);

    let cap = ts::take_from_sender<AdminCap>(&sc);
    let clk = clock::create_for_testing(ts::ctx(&mut sc));
    mock_lender::create_pool<SUI>(&cap, apy, 0, &clk, ts::ctx(&mut sc));
    ts::next_tx(&mut sc, admin);

    let mut pool = ts::take_shared<LendingPool<SUI>>(&sc);
    mock_lender::fund(&cap, &mut pool, coin::mint_for_testing<SUI>(backing, ts::ctx(&mut sc)));
    ts::return_shared(pool);
    ts::return_to_sender(&sc, cap);
    ts::next_tx(&mut sc, admin);
    (sc, clk)
}

#[test]
fun deposit_accrues_yield_and_withdraws_principal_plus_yield() {
    let admin = @0xA;
    let (mut sc, mut clk) = setup(admin, 1000, 1_000_000);
    let mut pool = ts::take_shared<LendingPool<SUI>>(&sc);

    spending_vault::open<SUI>(ts::ctx(&mut sc));
    ts::next_tx(&mut sc, admin);
    let mut vault = ts::take_from_sender<Vault<SUI>>(&sc);

    spending_vault::deposit(&mut vault, coin::mint_for_testing<SUI>(100_000, ts::ctx(&mut sc)), &mut pool, &clk, ts::ctx(&mut sc));
    assert!(spending_vault::current_value(&vault, &pool, &clk) == 100_000, 0);
    assert!(spending_vault::principal(&vault) == 100_000, 1);

    clk.increment_for_testing(YEAR_MS); // +1y → 10%
    assert!(spending_vault::current_value(&vault, &pool, &clk) == 110_000, 2);

    let out = spending_vault::withdraw(&mut vault, 110_000, &mut pool, &clk, ts::ctx(&mut sc));
    assert!(out.value() == 110_000, 3);
    assert!(!spending_vault::has_funds(&vault), 4);

    coin::burn_for_testing(out);
    clk.destroy_for_testing();
    ts::return_to_sender(&sc, vault);
    ts::return_shared(pool);
    ts::end(sc);
}

#[test]
fun second_deposit_adds_shares_into_same_position() {
    let admin = @0xA;
    let (mut sc, mut clk) = setup(admin, 1000, 1_000_000);
    let mut pool = ts::take_shared<LendingPool<SUI>>(&sc);

    spending_vault::open<SUI>(ts::ctx(&mut sc));
    ts::next_tx(&mut sc, admin);
    let mut vault = ts::take_from_sender<Vault<SUI>>(&sc);

    spending_vault::deposit(&mut vault, coin::mint_for_testing<SUI>(100_000, ts::ctx(&mut sc)), &mut pool, &clk, ts::ctx(&mut sc));
    clk.increment_for_testing(YEAR_MS); // value → 110_000
    spending_vault::deposit(&mut vault, coin::mint_for_testing<SUI>(110_000, ts::ctx(&mut sc)), &mut pool, &clk, ts::ctx(&mut sc));

    assert!(spending_vault::principal(&vault) == 210_000, 0);
    assert!(spending_vault::current_value(&vault, &pool, &clk) == 220_000, 1);

    let out = spending_vault::withdraw(&mut vault, 220_000, &mut pool, &clk, ts::ctx(&mut sc));
    assert!(out.value() == 220_000, 2);

    coin::burn_for_testing(out);
    clk.destroy_for_testing();
    ts::return_to_sender(&sc, vault);
    ts::return_shared(pool);
    ts::end(sc);
}

#[test]
fun partial_withdraw_re_supplies_remainder() {
    let admin = @0xA;
    let (mut sc, mut clk) = setup(admin, 1000, 1_000_000);
    let mut pool = ts::take_shared<LendingPool<SUI>>(&sc);

    spending_vault::open<SUI>(ts::ctx(&mut sc));
    ts::next_tx(&mut sc, admin);
    let mut vault = ts::take_from_sender<Vault<SUI>>(&sc);

    spending_vault::deposit(&mut vault, coin::mint_for_testing<SUI>(100_000, ts::ctx(&mut sc)), &mut pool, &clk, ts::ctx(&mut sc));
    clk.increment_for_testing(YEAR_MS); // value 110_000

    // Withdraw 40_000; remainder 70_000 is re-supplied as a fresh position.
    let out = spending_vault::withdraw(&mut vault, 40_000, &mut pool, &clk, ts::ctx(&mut sc));
    assert!(out.value() == 40_000, 0);
    assert!(spending_vault::principal(&vault) == 70_000, 1);
    // Re-supplied at rate 1.1 → 63_636 shares → 69_999 value (round-down favors the pool).
    assert!(spending_vault::current_value(&vault, &pool, &clk) == 69_999, 2);

    coin::burn_for_testing(out);
    clk.destroy_for_testing();
    ts::return_to_sender(&sc, vault);
    ts::return_shared(pool);
    ts::end(sc);
}

// One supplier's principal stays fully redeemable after another draws principal+yield.
#[test]
fun multi_user_principal_is_isolated() {
    let admin = @0xA;
    let alice = @0xA11CE;
    let bob = @0xB0B;
    let (mut sc, mut clk) = setup(admin, 1000, 1_000_000);
    let mut pool = ts::take_shared<LendingPool<SUI>>(&sc);

    ts::next_tx(&mut sc, alice);
    spending_vault::open<SUI>(ts::ctx(&mut sc));
    ts::next_tx(&mut sc, alice);
    let mut va = ts::take_from_sender<Vault<SUI>>(&sc);
    spending_vault::deposit(&mut va, coin::mint_for_testing<SUI>(100_000, ts::ctx(&mut sc)), &mut pool, &clk, ts::ctx(&mut sc));

    ts::next_tx(&mut sc, bob);
    spending_vault::open<SUI>(ts::ctx(&mut sc));
    ts::next_tx(&mut sc, bob);
    let mut vb = ts::take_from_sender<Vault<SUI>>(&sc);
    spending_vault::deposit(&mut vb, coin::mint_for_testing<SUI>(100_000, ts::ctx(&mut sc)), &mut pool, &clk, ts::ctx(&mut sc));

    clk.increment_for_testing(YEAR_MS);

    ts::next_tx(&mut sc, alice);
    let oa = spending_vault::withdraw(&mut va, 110_000, &mut pool, &clk, ts::ctx(&mut sc));
    assert!(oa.value() == 110_000, 0);

    ts::next_tx(&mut sc, bob);
    let ob = spending_vault::withdraw(&mut vb, 110_000, &mut pool, &clk, ts::ctx(&mut sc));
    assert!(ob.value() == 110_000, 1);

    coin::burn_for_testing(oa);
    coin::burn_for_testing(ob);
    clk.destroy_for_testing();
    ts::next_tx(&mut sc, alice);
    ts::return_to_address(alice, va);
    ts::next_tx(&mut sc, bob);
    ts::return_to_address(bob, vb);
    ts::return_shared(pool);
    ts::end(sc);
}

// Withdrawing the optimistic current_value when backing is short CLAMPS, never aborts.
#[test]
fun withdraw_over_redeemable_clamps_instead_of_aborting() {
    let admin = @0xA;
    let (mut sc, mut clk) = setup(admin, 1000, 3_000); // backing 3k + 100k principal < 110k owed
    let mut pool = ts::take_shared<LendingPool<SUI>>(&sc);

    spending_vault::open<SUI>(ts::ctx(&mut sc));
    ts::next_tx(&mut sc, admin);
    let mut vault = ts::take_from_sender<Vault<SUI>>(&sc);
    spending_vault::deposit(&mut vault, coin::mint_for_testing<SUI>(100_000, ts::ctx(&mut sc)), &mut pool, &clk, ts::ctx(&mut sc));
    clk.increment_for_testing(YEAR_MS);

    let value = spending_vault::current_value(&vault, &pool, &clk);
    assert!(value == 110_000, 0); // optimistic
    let out = spending_vault::withdraw(&mut vault, value, &mut pool, &clk, ts::ctx(&mut sc));
    assert!(out.value() == 103_000, 1); // clamped to backing
    assert!(!spending_vault::has_funds(&vault), 2);

    coin::burn_for_testing(out);
    clk.destroy_for_testing();
    ts::return_to_sender(&sc, vault);
    ts::return_shared(pool);
    ts::end(sc);
}
