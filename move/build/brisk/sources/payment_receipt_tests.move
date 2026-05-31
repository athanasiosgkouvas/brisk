#[test_only]
module brisk::payment_receipt_tests;

use brisk::payment_receipt;
use std::string;
use sui::sui::SUI;

#[test]
fun issues_receipt_with_expected_fields() {
    let mut ctx = tx_context::dummy();
    let payer = @0xA;
    let payee = @0xB;

    let r = payment_receipt::issue<SUI>(
        payer,
        payee,
        4_500_000,
        string::utf8(b"coffee"),
        string::utf8(b"inv-1"),
        1_700_000_000_000,
        &mut ctx,
    );

    assert!(payment_receipt::amount(&r) == 4_500_000, 0);
    assert!(payment_receipt::payer(&r) == payer, 1);
    assert!(payment_receipt::payee(&r) == payee, 2);
    assert!(payment_receipt::invoice_id(&r) == string::utf8(b"inv-1"), 3);

    // Receipt has no `drop`; hand it to the payer to consume it.
    transfer::public_transfer(r, payer);
}
