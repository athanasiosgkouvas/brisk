#[test_only]
module fathom_router::router_tests;

use fathom_router::router;

// The cross-package `hedged_swap` path needs a live DeepBook `Pool` with maker
// liquidity (and a real `predict::mint` adjacent in the PTB), so it is covered
// by the testnet integration script (`scripts/probe-router.ts`), not here.
// What IS unit-testable is the load-bearing invariant itself.

#[test]
fun assert_floor_passes_when_fill_meets_floor() {
    router::assert_floor(1_000, 1_000);
    router::assert_floor(1_500, 1_000);
    router::assert_floor(1, 0);
}

#[test]
#[expected_failure(abort_code = router::EHedgeBelowFloor)]
fun assert_floor_aborts_below_floor() {
    router::assert_floor(999, 1_000);
}

#[test]
#[expected_failure(abort_code = router::EHedgeBelowFloor)]
fun assert_floor_aborts_on_zero_fill_with_positive_floor() {
    router::assert_floor(0, 1);
}
