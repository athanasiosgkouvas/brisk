/// The yield-bearing spending account ("Save" bucket). Holds a user's idle
/// stablecoin, routes it to a lender through `lender_adapter`, and supports
/// deposit, withdraw, and `withdraw_and_pay` (instant-liquidate at spend time).
/// Value-conservation is the core invariant (Move Prover spec in Phase 3/5).
///
/// Implemented in Phase 3.
module brisk::spending_vault;
