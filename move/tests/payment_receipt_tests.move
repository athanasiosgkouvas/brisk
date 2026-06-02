#[test_only]
module brisk::payment_receipt_tests;

use brisk::payment_receipt::{Self, Receipt};
use std::string;
use sui::clock;
use sui::coin::{Self, Coin};
use sui::sui::SUI;
use sui::test_scenario as ts;

#[test]
fun pay_moves_funds_and_mints_authentic_receipt() {
    let payer = @0xA;
    let payee = @0xB;
    let mut sc = ts::begin(payer);
    let clk = clock::create_for_testing(ts::ctx(&mut sc));
    let funds = coin::mint_for_testing<SUI>(4_500_000, ts::ctx(&mut sc));

    // amount + timestamp are derived from the coin/clock, not caller args.
    payment_receipt::pay<SUI>(
        funds,
        payee,
        string::utf8(b"coffee"),
        string::utf8(b"inv-1"),
        &clk,
        ts::ctx(&mut sc),
    );

    // Receipt is soulbound to the payer with the real amount.
    ts::next_tx(&mut sc, payer);
    let r = ts::take_from_sender<Receipt>(&sc);
    assert!(payment_receipt::amount(&r) == 4_500_000, 0);
    assert!(payment_receipt::payer(&r) == payer, 1);
    assert!(payment_receipt::payee(&r) == payee, 2);
    assert!(payment_receipt::invoice_id(&r) == string::utf8(b"inv-1"), 3);
    ts::return_to_sender(&sc, r);

    // The merchant actually received the funds.
    ts::next_tx(&mut sc, payee);
    let got = ts::take_from_sender<Coin<SUI>>(&sc);
    assert!(got.value() == 4_500_000, 4);
    ts::return_to_sender(&sc, got);

    clk.destroy_for_testing();
    ts::end(sc);
}
