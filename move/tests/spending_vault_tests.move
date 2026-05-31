#[test_only]
module brisk::spending_vault_tests;

use brisk::mock_lender::{Self, AdminCap, LendingPool};
use brisk::spending_vault::{Self, Vault};
use sui::clock;
use sui::coin;
use sui::sui::SUI;
use sui::test_scenario as ts;

const YEAR_MS: u64 = 31_536_000_000;

#[test]
fun deposit_accrues_yield_and_withdraws_principal_plus_yield() {
    let admin = @0xA;
    let mut sc = ts::begin(admin);

    // Publish-time init gives the admin the AdminCap.
    mock_lender::init_for_testing(ts::ctx(&mut sc));
    ts::next_tx(&mut sc, admin);

    let cap = ts::take_from_sender<AdminCap>(&sc);
    mock_lender::create_pool<SUI>(&cap, 1000, ts::ctx(&mut sc)); // 10% APY
    ts::next_tx(&mut sc, admin);

    let mut pool = ts::take_shared<LendingPool<SUI>>(&sc);
    // Fund the yield reserve.
    mock_lender::fund(&mut pool, coin::mint_for_testing<SUI>(1_000_000, ts::ctx(&mut sc)));

    spending_vault::open<SUI>(ts::ctx(&mut sc));
    ts::next_tx(&mut sc, admin);

    let mut vault = ts::take_from_sender<Vault<SUI>>(&sc);
    let mut clk = clock::create_for_testing(ts::ctx(&mut sc));

    // Deposit 100_000.
    spending_vault::deposit(
        &mut vault,
        coin::mint_for_testing<SUI>(100_000, ts::ctx(&mut sc)),
        &mut pool,
        &clk,
        ts::ctx(&mut sc),
    );
    assert!(spending_vault::current_value(&vault, &pool, &clk) == 100_000, 0);

    // Advance one year -> 10% yield.
    clk.increment_for_testing(YEAR_MS);
    let value = spending_vault::current_value(&vault, &pool, &clk);
    assert!(value == 110_000, 1);

    // Withdraw everything; should be principal + yield.
    let out = spending_vault::withdraw(&mut vault, value, &mut pool, &clk, ts::ctx(&mut sc));
    assert!(out.value() == 110_000, 2);
    assert!(!spending_vault::has_funds(&vault), 3);

    coin::burn_for_testing(out);
    clk.destroy_for_testing();
    ts::return_to_sender(&sc, cap);
    ts::return_to_sender(&sc, vault);
    ts::return_shared(pool);
    ts::end(sc);
}
