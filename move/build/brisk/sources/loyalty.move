/// Cashback loyalty as a Closed-Loop Token (`sui::token`). A small cashback is
/// minted to the customer on each merchant payment; a spend policy restricts
/// redemption (e.g. discounts at participating merchants), demonstrating
/// regulated-flow control.
///
/// Implemented in Phase 4.
module brisk::loyalty;
