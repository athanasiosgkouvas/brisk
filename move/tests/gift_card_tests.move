#[test_only]
module brisk::gift_card_tests;

use brisk::gift_card::{Self, GiftCard, GiftCardConfig};
use brisk::merchant_registry::{Self, Merchant};
use std::string;
use sui::balance;
use sui::clock;
use sui::coin::{Coin};
use sui::hash;
use sui::sui::SUI;
use sui::test_scenario as ts;
use sui::test_utils::destroy;

const DEPLOYER: address = @0xD;
const MERCHANT_OWNER: address = @0xB;
const BUYER: address = @0xA;
const RECIPIENT: address = @0xC;

const SECRET: vector<u8> = b"a-32-byte-or-so-claim-secret-xyz";

// Helper: a registered merchant owned by MERCHANT_OWNER.
fun new_merchant(sc: &mut ts::Scenario): (Merchant, merchant_registry::MerchantCap) {
    ts::next_tx(sc, MERCHANT_OWNER);
    merchant_registry::register(string::utf8(b"Acme"), ts::ctx(sc))
}

#[test]
fun mint_pays_merchant_net_and_treasury_fee_upfront() {
    let mut sc = ts::begin(DEPLOYER);
    gift_card::init_for_testing(ts::ctx(&mut sc));
    let (merchant, cap) = new_merchant(&mut sc);

    ts::next_tx(&mut sc, BUYER);
    let config = ts::take_shared<GiftCardConfig>(&sc);
    let clk = clock::create_for_testing(ts::ctx(&mut sc));
    let funds = balance::create_for_testing<SUI>(1_000_000);
    gift_card::mint<SUI>(
        &config,
        &merchant,
        funds,
        1_000_000,
        hash::blake2b256(&SECRET),
        &clk,
        ts::ctx(&mut sc),
    );
    ts::return_shared(config);

    // Treasury (the deployer) got the 3% fee = 30_000.
    ts::next_tx(&mut sc, DEPLOYER);
    let fee_coin = ts::take_from_sender<Coin<SUI>>(&sc);
    assert!(fee_coin.value() == 30_000, 0);
    ts::return_to_sender(&sc, fee_coin);

    // The merchant was paid the NET (970_000) right at issuance.
    ts::next_tx(&mut sc, MERCHANT_OWNER);
    let net_coin = ts::take_from_sender<Coin<SUI>>(&sc);
    assert!(net_coin.value() == 970_000, 1);
    ts::return_to_sender(&sc, net_coin);

    // The card holds no escrow; its redeemable promise is the full face.
    ts::next_tx(&mut sc, BUYER);
    let card = ts::take_shared<GiftCard<SUI>>(&sc);
    assert!(gift_card::balance_of(&card) == 1_000_000, 2);
    assert!(gift_card::merchant_of(&card) == object::id(&merchant), 3);
    assert!(gift_card::recipient_of(&card).is_none(), 4);
    ts::return_shared(card);

    destroy(merchant);
    destroy(cap);
    clk.destroy_for_testing();
    ts::end(sc);
}

#[test]
fun claim_then_redeem_full_draws_down_promise() {
    let mut sc = ts::begin(DEPLOYER);
    gift_card::init_for_testing(ts::ctx(&mut sc));
    let (merchant, cap) = new_merchant(&mut sc);

    ts::next_tx(&mut sc, BUYER);
    let config = ts::take_shared<GiftCardConfig>(&sc);
    let clk = clock::create_for_testing(ts::ctx(&mut sc));
    gift_card::mint<SUI>(
        &config,
        &merchant,
        balance::create_for_testing<SUI>(1_000_000),
        1_000_000,
        hash::blake2b256(&SECRET),
        &clk,
        ts::ctx(&mut sc),
    );
    ts::return_shared(config);

    // Recipient claims with the secret, then spends the full promise.
    ts::next_tx(&mut sc, RECIPIENT);
    let mut card = ts::take_shared<GiftCard<SUI>>(&sc);
    gift_card::claim<SUI>(&mut card, SECRET, ts::ctx(&mut sc));
    assert!(gift_card::recipient_of(&card).contains(&RECIPIENT), 0);
    // The promise is for the full face (1_000_000), not the net.
    gift_card::redeem<SUI>(&mut card, &merchant, 1_000_000, ts::ctx(&mut sc));
    assert!(gift_card::balance_of(&card) == 0, 1);
    ts::return_shared(card);

    // The merchant's only payout was the net at mint — redeem moved nothing.
    ts::next_tx(&mut sc, MERCHANT_OWNER);
    let got = ts::take_from_sender<Coin<SUI>>(&sc);
    assert!(got.value() == 970_000, 2);
    ts::return_to_sender(&sc, got);

    destroy(merchant);
    destroy(cap);
    clk.destroy_for_testing();
    ts::end(sc);
}

#[test]
fun redeem_partial_leaves_remainder() {
    let mut sc = ts::begin(DEPLOYER);
    gift_card::init_for_testing(ts::ctx(&mut sc));
    let (merchant, cap) = new_merchant(&mut sc);

    ts::next_tx(&mut sc, BUYER);
    let config = ts::take_shared<GiftCardConfig>(&sc);
    let clk = clock::create_for_testing(ts::ctx(&mut sc));
    gift_card::mint<SUI>(
        &config,
        &merchant,
        balance::create_for_testing<SUI>(1_000_000),
        1_000_000,
        hash::blake2b256(&SECRET),
        &clk,
        ts::ctx(&mut sc),
    );
    ts::return_shared(config);

    ts::next_tx(&mut sc, RECIPIENT);
    let mut card = ts::take_shared<GiftCard<SUI>>(&sc);
    gift_card::claim<SUI>(&mut card, SECRET, ts::ctx(&mut sc));
    gift_card::redeem<SUI>(&mut card, &merchant, 400_000, ts::ctx(&mut sc));
    assert!(gift_card::balance_of(&card) == 600_000, 0);
    ts::return_shared(card);

    destroy(merchant);
    destroy(cap);
    clk.destroy_for_testing();
    ts::end(sc);
}

#[test]
#[expected_failure(abort_code = brisk::gift_card::EInsufficient)]
fun redeem_over_remaining_aborts() {
    let mut sc = ts::begin(DEPLOYER);
    gift_card::init_for_testing(ts::ctx(&mut sc));
    let (merchant, cap) = new_merchant(&mut sc);

    ts::next_tx(&mut sc, BUYER);
    let config = ts::take_shared<GiftCardConfig>(&sc);
    let clk = clock::create_for_testing(ts::ctx(&mut sc));
    gift_card::mint<SUI>(
        &config,
        &merchant,
        balance::create_for_testing<SUI>(1_000_000),
        1_000_000,
        hash::blake2b256(&SECRET),
        &clk,
        ts::ctx(&mut sc),
    );
    ts::return_shared(config);

    ts::next_tx(&mut sc, RECIPIENT);
    let mut card = ts::take_shared<GiftCard<SUI>>(&sc);
    gift_card::claim<SUI>(&mut card, SECRET, ts::ctx(&mut sc));
    // Redeeming more than the remaining promise must abort.
    gift_card::redeem<SUI>(&mut card, &merchant, 1_000_001, ts::ctx(&mut sc));
    ts::return_shared(card);

    destroy(merchant);
    destroy(cap);
    clk.destroy_for_testing();
    ts::end(sc);
}

const SECRET2: vector<u8> = b"a-different-32-byte-claim-secret";

#[test]
fun regift_lets_a_new_recipient_claim_and_redeem() {
    let mut sc = ts::begin(DEPLOYER);
    gift_card::init_for_testing(ts::ctx(&mut sc));
    let (merchant, cap) = new_merchant(&mut sc);

    ts::next_tx(&mut sc, BUYER);
    let config = ts::take_shared<GiftCardConfig>(&sc);
    let clk = clock::create_for_testing(ts::ctx(&mut sc));
    gift_card::mint<SUI>(
        &config,
        &merchant,
        balance::create_for_testing<SUI>(1_000_000),
        1_000_000,
        hash::blake2b256(&SECRET),
        &clk,
        ts::ctx(&mut sc),
    );
    ts::return_shared(config);

    // RECIPIENT claims, then re-gifts onward with a fresh secret.
    ts::next_tx(&mut sc, RECIPIENT);
    let mut card = ts::take_shared<GiftCard<SUI>>(&sc);
    gift_card::claim<SUI>(&mut card, SECRET, ts::ctx(&mut sc));
    gift_card::regift<SUI>(&mut card, hash::blake2b256(&SECRET2), ts::ctx(&mut sc));
    assert!(gift_card::recipient_of(&card).is_none(), 0);
    ts::return_shared(card);

    // A new person claims with the new secret and redeems — value is preserved.
    ts::next_tx(&mut sc, @0xF);
    let mut card2 = ts::take_shared<GiftCard<SUI>>(&sc);
    gift_card::claim<SUI>(&mut card2, SECRET2, ts::ctx(&mut sc));
    assert!(gift_card::recipient_of(&card2).contains(&@0xF), 1);
    gift_card::redeem<SUI>(&mut card2, &merchant, 1_000_000, ts::ctx(&mut sc));
    assert!(gift_card::balance_of(&card2) == 0, 2);
    ts::return_shared(card2);

    destroy(merchant);
    destroy(cap);
    clk.destroy_for_testing();
    ts::end(sc);
}

#[test]
#[expected_failure(abort_code = brisk::gift_card::ENotRecipient)]
fun regift_by_non_recipient_aborts() {
    let mut sc = ts::begin(DEPLOYER);
    gift_card::init_for_testing(ts::ctx(&mut sc));
    let (merchant, cap) = new_merchant(&mut sc);

    ts::next_tx(&mut sc, BUYER);
    let config = ts::take_shared<GiftCardConfig>(&sc);
    let clk = clock::create_for_testing(ts::ctx(&mut sc));
    gift_card::mint<SUI>(
        &config,
        &merchant,
        balance::create_for_testing<SUI>(1_000_000),
        1_000_000,
        hash::blake2b256(&SECRET),
        &clk,
        ts::ctx(&mut sc),
    );
    ts::return_shared(config);

    ts::next_tx(&mut sc, RECIPIENT);
    let mut card = ts::take_shared<GiftCard<SUI>>(&sc);
    gift_card::claim<SUI>(&mut card, SECRET, ts::ctx(&mut sc));
    ts::return_shared(card);

    // BUYER (not the recipient) tries to re-gift — must abort.
    ts::next_tx(&mut sc, BUYER);
    let mut card2 = ts::take_shared<GiftCard<SUI>>(&sc);
    gift_card::regift<SUI>(&mut card2, hash::blake2b256(&SECRET2), ts::ctx(&mut sc));
    ts::return_shared(card2);

    destroy(merchant);
    destroy(cap);
    clk.destroy_for_testing();
    ts::end(sc);
}

#[test]
#[expected_failure(abort_code = brisk::gift_card::EBadSecret)]
fun claim_wrong_secret_aborts() {
    let mut sc = ts::begin(DEPLOYER);
    gift_card::init_for_testing(ts::ctx(&mut sc));
    let (merchant, cap) = new_merchant(&mut sc);

    ts::next_tx(&mut sc, BUYER);
    let config = ts::take_shared<GiftCardConfig>(&sc);
    let clk = clock::create_for_testing(ts::ctx(&mut sc));
    gift_card::mint<SUI>(
        &config,
        &merchant,
        balance::create_for_testing<SUI>(1_000_000),
        1_000_000,
        hash::blake2b256(&SECRET),
        &clk,
        ts::ctx(&mut sc),
    );
    ts::return_shared(config);

    ts::next_tx(&mut sc, RECIPIENT);
    let mut card = ts::take_shared<GiftCard<SUI>>(&sc);
    gift_card::claim<SUI>(&mut card, b"wrong-secret", ts::ctx(&mut sc));
    ts::return_shared(card);

    destroy(merchant);
    destroy(cap);
    clk.destroy_for_testing();
    ts::end(sc);
}

#[test]
#[expected_failure(abort_code = brisk::gift_card::EAlreadyClaimed)]
fun double_claim_aborts() {
    let mut sc = ts::begin(DEPLOYER);
    gift_card::init_for_testing(ts::ctx(&mut sc));
    let (merchant, cap) = new_merchant(&mut sc);

    ts::next_tx(&mut sc, BUYER);
    let config = ts::take_shared<GiftCardConfig>(&sc);
    let clk = clock::create_for_testing(ts::ctx(&mut sc));
    gift_card::mint<SUI>(
        &config,
        &merchant,
        balance::create_for_testing<SUI>(1_000_000),
        1_000_000,
        hash::blake2b256(&SECRET),
        &clk,
        ts::ctx(&mut sc),
    );
    ts::return_shared(config);

    ts::next_tx(&mut sc, RECIPIENT);
    let mut card = ts::take_shared<GiftCard<SUI>>(&sc);
    gift_card::claim<SUI>(&mut card, SECRET, ts::ctx(&mut sc));
    // Second claim must abort.
    gift_card::claim<SUI>(&mut card, SECRET, ts::ctx(&mut sc));
    ts::return_shared(card);

    destroy(merchant);
    destroy(cap);
    clk.destroy_for_testing();
    ts::end(sc);
}

#[test]
#[expected_failure(abort_code = brisk::gift_card::ENotRecipient)]
fun redeem_by_non_recipient_aborts() {
    let mut sc = ts::begin(DEPLOYER);
    gift_card::init_for_testing(ts::ctx(&mut sc));
    let (merchant, cap) = new_merchant(&mut sc);

    ts::next_tx(&mut sc, BUYER);
    let config = ts::take_shared<GiftCardConfig>(&sc);
    let clk = clock::create_for_testing(ts::ctx(&mut sc));
    gift_card::mint<SUI>(
        &config,
        &merchant,
        balance::create_for_testing<SUI>(1_000_000),
        1_000_000,
        hash::blake2b256(&SECRET),
        &clk,
        ts::ctx(&mut sc),
    );
    ts::return_shared(config);

    // RECIPIENT claims, but BUYER tries to redeem.
    ts::next_tx(&mut sc, RECIPIENT);
    let mut card = ts::take_shared<GiftCard<SUI>>(&sc);
    gift_card::claim<SUI>(&mut card, SECRET, ts::ctx(&mut sc));
    ts::return_shared(card);

    ts::next_tx(&mut sc, BUYER);
    let mut card2 = ts::take_shared<GiftCard<SUI>>(&sc);
    gift_card::redeem<SUI>(&mut card2, &merchant, 100_000, ts::ctx(&mut sc));
    ts::return_shared(card2);

    destroy(merchant);
    destroy(cap);
    clk.destroy_for_testing();
    ts::end(sc);
}

#[test]
#[expected_failure(abort_code = brisk::gift_card::EWrongMerchant)]
fun redeem_wrong_merchant_aborts() {
    let mut sc = ts::begin(DEPLOYER);
    gift_card::init_for_testing(ts::ctx(&mut sc));
    let (merchant, cap) = new_merchant(&mut sc);
    // A second, unrelated merchant.
    ts::next_tx(&mut sc, @0xE);
    let (other, other_cap) = merchant_registry::register(string::utf8(b"Other"), ts::ctx(&mut sc));

    ts::next_tx(&mut sc, BUYER);
    let config = ts::take_shared<GiftCardConfig>(&sc);
    let clk = clock::create_for_testing(ts::ctx(&mut sc));
    gift_card::mint<SUI>(
        &config,
        &merchant,
        balance::create_for_testing<SUI>(1_000_000),
        1_000_000,
        hash::blake2b256(&SECRET),
        &clk,
        ts::ctx(&mut sc),
    );
    ts::return_shared(config);

    ts::next_tx(&mut sc, RECIPIENT);
    let mut card = ts::take_shared<GiftCard<SUI>>(&sc);
    gift_card::claim<SUI>(&mut card, SECRET, ts::ctx(&mut sc));
    // Redeeming against the wrong merchant must abort.
    gift_card::redeem<SUI>(&mut card, &other, 100_000, ts::ctx(&mut sc));
    ts::return_shared(card);

    destroy(merchant);
    destroy(cap);
    destroy(other);
    destroy(other_cap);
    clk.destroy_for_testing();
    ts::end(sc);
}

#[test]
#[expected_failure(abort_code = brisk::gift_card::EWrongFunds)]
fun mint_wrong_funds_aborts() {
    let mut sc = ts::begin(DEPLOYER);
    gift_card::init_for_testing(ts::ctx(&mut sc));
    let (merchant, cap) = new_merchant(&mut sc);

    ts::next_tx(&mut sc, BUYER);
    let config = ts::take_shared<GiftCardConfig>(&sc);
    let clk = clock::create_for_testing(ts::ctx(&mut sc));
    // funds (999_999) != face (1_000_000) → abort.
    gift_card::mint<SUI>(
        &config,
        &merchant,
        balance::create_for_testing<SUI>(999_999),
        1_000_000,
        hash::blake2b256(&SECRET),
        &clk,
        ts::ctx(&mut sc),
    );
    ts::return_shared(config);

    destroy(merchant);
    destroy(cap);
    clk.destroy_for_testing();
    ts::end(sc);
}
