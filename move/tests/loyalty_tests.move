#[test_only]
module brisk::loyalty_tests;

use brisk::loyalty::{Self, Points};
use brisk::payment_receipt::{Self, Receipt};
use std::string;
use sui::clock;
use sui::coin;
use sui::sui::SUI;
use sui::test_scenario as ts;

// Settle a real payment and return its cashback proof (the only way to earn).
fun pay_proof(sc: &mut ts::Scenario, amount: u64): payment_receipt::PaymentProof {
    let clk = clock::create_for_testing(ts::ctx(sc));
    let funds = coin::mint_for_testing<SUI>(amount, ts::ctx(sc));
    let proof = payment_receipt::pay<SUI>(
        funds,
        @0xBEEF,
        string::utf8(b"x"),
        string::utf8(b"i"),
        &clk,
        ts::ctx(sc),
    );
    clk.destroy_for_testing();
    proof
}

#[test]
fun earn_from_payment_mints_one_percent_then_redeem_burns() {
    let user = @0xA;
    let mut sc = ts::begin(user);

    let proof = pay_proof(&mut sc, 4_500_000); // 1% = 45_000
    loyalty::earn(proof, ts::ctx(&mut sc));
    ts::next_tx(&mut sc, user);

    let pts = ts::take_from_sender<Points>(&sc);
    assert!(loyalty::amount(&pts) == 45_000, 0);
    loyalty::redeem(pts, ts::ctx(&mut sc));
    ts::next_tx(&mut sc, user);
    assert!(!ts::has_most_recent_for_sender<Points>(&sc), 1);

    // The payment also left a soulbound Receipt with the payer.
    let r = ts::take_from_sender<Receipt>(&sc);
    ts::return_to_sender(&sc, r);
    ts::end(sc);
}

// A payment too small to round to >=1 point mints nothing (proof still consumed).
#[test]
fun earn_below_threshold_mints_no_points() {
    let user = @0xA;
    let mut sc = ts::begin(user);

    let proof = pay_proof(&mut sc, 50); // 1% of 50 = 0
    loyalty::earn(proof, ts::ctx(&mut sc));
    ts::next_tx(&mut sc, user);

    assert!(!ts::has_most_recent_for_sender<Points>(&sc), 0);
    let r = ts::take_from_sender<Receipt>(&sc);
    ts::return_to_sender(&sc, r);
    ts::end(sc);
}
