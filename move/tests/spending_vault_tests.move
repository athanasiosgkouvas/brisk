#[test_only]
module brisk::spending_vault_tests;

use brisk::mock_lender::{Self, AdminCap, LendingPool};
use brisk::spending_vault::{Self, Vault};
use sui::clock;
use sui::coin;
use sui::sui::SUI;
use sui::test_scenario as ts;

const YEAR_MS: u64 = 31_536_000_000;

// Spin up an admin-owned, funded pool. Returns the funded scenario at `admin`.
fun setup(admin: address, apy_bps: u64, yield_buffer: u64): ts::Scenario {
    let mut sc = ts::begin(admin);
    mock_lender::init_for_testing(ts::ctx(&mut sc));
    ts::next_tx(&mut sc, admin);

    let cap = ts::take_from_sender<AdminCap>(&sc);
    mock_lender::create_pool<SUI>(&cap, apy_bps, ts::ctx(&mut sc));
    ts::next_tx(&mut sc, admin);

    let mut pool = ts::take_shared<LendingPool<SUI>>(&sc);
    mock_lender::fund_yield(&cap, &mut pool, coin::mint_for_testing<SUI>(yield_buffer, ts::ctx(&mut sc)));
    ts::return_shared(pool);
    ts::return_to_sender(&sc, cap);
    ts::next_tx(&mut sc, admin);
    sc
}

#[test]
fun deposit_accrues_yield_and_withdraws_principal_plus_yield() {
    let admin = @0xA;
    let mut sc = setup(admin, 1000, 1_000_000); // 10% APY, generous buffer

    let mut pool = ts::take_shared<LendingPool<SUI>>(&sc);
    spending_vault::open<SUI>(ts::ctx(&mut sc));
    ts::next_tx(&mut sc, admin);

    let mut vault = ts::take_from_sender<Vault<SUI>>(&sc);
    let mut clk = clock::create_for_testing(ts::ctx(&mut sc));

    spending_vault::deposit(
        &mut vault,
        coin::mint_for_testing<SUI>(100_000, ts::ctx(&mut sc)),
        &mut pool,
        &clk,
        ts::ctx(&mut sc),
    );
    assert!(spending_vault::current_value(&vault, &pool, &clk) == 100_000, 0);
    assert!(spending_vault::principal(&vault) == 100_000, 1);

    clk.increment_for_testing(YEAR_MS); // +1 year -> 10%
    let value = spending_vault::current_value(&vault, &pool, &clk);
    assert!(value == 110_000, 2);

    let out = spending_vault::withdraw(&mut vault, value, &mut pool, &clk, ts::ctx(&mut sc));
    assert!(out.value() == 110_000, 3);
    assert!(!spending_vault::has_funds(&vault), 4);

    coin::burn_for_testing(out);
    clk.destroy_for_testing();
    ts::return_to_sender(&sc, vault);
    ts::return_shared(pool);
    ts::end(sc);
}

#[test]
fun partial_withdraw_compounds_remainder() {
    let admin = @0xA;
    let mut sc = setup(admin, 1000, 1_000_000);

    let mut pool = ts::take_shared<LendingPool<SUI>>(&sc);
    spending_vault::open<SUI>(ts::ctx(&mut sc));
    ts::next_tx(&mut sc, admin);

    let mut vault = ts::take_from_sender<Vault<SUI>>(&sc);
    let mut clk = clock::create_for_testing(ts::ctx(&mut sc));

    spending_vault::deposit(
        &mut vault,
        coin::mint_for_testing<SUI>(100_000, ts::ctx(&mut sc)),
        &mut pool,
        &clk,
        ts::ctx(&mut sc),
    );
    clk.increment_for_testing(YEAR_MS); // value now 110_000 (100k principal + 10k yield)

    // Withdraw 40_000; the 70_000 remainder is re-supplied as fresh principal
    // (earned yield compounds into principal — no value lost).
    let out = spending_vault::withdraw(&mut vault, 40_000, &mut pool, &clk, ts::ctx(&mut sc));
    assert!(out.value() == 40_000, 0);
    assert!(spending_vault::principal(&vault) == 70_000, 1); // compounded
    assert!(spending_vault::current_value(&vault, &pool, &clk) == 70_000, 2); // clock reset, basis preserved

    coin::burn_for_testing(out);
    clk.destroy_for_testing();
    ts::return_to_sender(&sc, vault);
    ts::return_shared(pool);
    ts::end(sc);
}

// One supplier's principal stays fully redeemable even after another supplier
// has already drawn principal + yield out of the shared pool.
#[test]
fun multi_user_principal_is_isolated() {
    let admin = @0xA;
    let alice = @0xA11CE;
    let bob = @0xB0B;
    let mut sc = setup(admin, 1000, 1_000_000);

    let mut pool = ts::take_shared<LendingPool<SUI>>(&sc);

    // Alice opens + deposits.
    ts::next_tx(&mut sc, alice);
    spending_vault::open<SUI>(ts::ctx(&mut sc));
    ts::next_tx(&mut sc, alice);
    let mut va = ts::take_from_sender<Vault<SUI>>(&sc);
    let mut clk = clock::create_for_testing(ts::ctx(&mut sc));
    spending_vault::deposit(&mut va, coin::mint_for_testing<SUI>(100_000, ts::ctx(&mut sc)), &mut pool, &clk, ts::ctx(&mut sc));

    // Bob opens + deposits.
    ts::next_tx(&mut sc, bob);
    spending_vault::open<SUI>(ts::ctx(&mut sc));
    ts::next_tx(&mut sc, bob);
    let mut vb = ts::take_from_sender<Vault<SUI>>(&sc);
    spending_vault::deposit(&mut vb, coin::mint_for_testing<SUI>(100_000, ts::ctx(&mut sc)), &mut pool, &clk, ts::ctx(&mut sc));

    clk.increment_for_testing(YEAR_MS);

    // Alice withdraws all (110_000) — draws principal + yield from the pool.
    ts::next_tx(&mut sc, alice);
    let oa = spending_vault::withdraw(&mut va, 110_000, &mut pool, &clk, ts::ctx(&mut sc));
    assert!(oa.value() == 110_000, 0);

    // Bob's principal must still be there — his 110_000 redeems in full.
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

// Withdrawing the optimistic current_value when the yield buffer is short must
// CLAMP to what's redeemable, never abort (the documented UI flow).
#[test]
fun withdraw_over_redeemable_clamps_instead_of_aborting() {
    let admin = @0xA;
    let mut sc = setup(admin, 1000, 3_000); // buffer (3k) < accrued yield (10k)

    let mut pool = ts::take_shared<LendingPool<SUI>>(&sc);
    spending_vault::open<SUI>(ts::ctx(&mut sc));
    ts::next_tx(&mut sc, admin);

    let mut vault = ts::take_from_sender<Vault<SUI>>(&sc);
    let mut clk = clock::create_for_testing(ts::ctx(&mut sc));
    spending_vault::deposit(
        &mut vault,
        coin::mint_for_testing<SUI>(100_000, ts::ctx(&mut sc)),
        &mut pool,
        &clk,
        ts::ctx(&mut sc),
    );
    clk.increment_for_testing(YEAR_MS);

    // current_value is optimistic (110_000); only 103_000 is redeemable.
    let value = spending_vault::current_value(&vault, &pool, &clk);
    assert!(value == 110_000, 0);
    let out = spending_vault::withdraw(&mut vault, value, &mut pool, &clk, ts::ctx(&mut sc));
    assert!(out.value() == 103_000, 1); // clamped, not aborted
    assert!(!spending_vault::has_funds(&vault), 2);

    coin::burn_for_testing(out);
    clk.destroy_for_testing();
    ts::return_to_sender(&sc, vault);
    ts::return_shared(pool);
    ts::end(sc);
}
