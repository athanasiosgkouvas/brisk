/// Adapter interface (the only seam between testnet and mainnet). The
/// `spending_vault` deposits/withdraws idle stablecoin through an adapter so
/// the lender can be swapped — `mock_lender` on testnet, a real Suilend/Scallop
/// adapter on mainnet — without touching the vault or the app.
///
/// Implemented in Phase 3.
module brisk::lender_adapter;
