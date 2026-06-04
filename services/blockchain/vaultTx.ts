import { Transaction, coinWithBalance } from "@mysten/sui/transactions";

import { CLOCK_OBJECT_ID, ENV } from "@/utils/constants";

/**
 * PTB builders for the Save vault (spending_vault + mock_lender). All run as
 * Enoki-sponsored txs (object creation / Move calls aren't native-gasless), so
 * the user pays no gas. The shared LendingPool id comes from ENV.briskPoolId.
 *
 * Deposit sources USDC via the CoinWithBalance helper, which pulls from the
 * Address Balance accumulator (emitting `CallArg::FundsWithdrawal`) and falls
 * back to owned coins. Enoki's gas station now sponsors that withdrawal, so we
 * no longer have to pre-resolve explicit Coin objects.
 */

const PKG = ENV.briskPackageId;
const USDC = ENV.usdcType;

/** Coin type of a user's Save vault — used to find their Vault object. */
export const VAULT_TYPE = `${PKG}::spending_vault::Vault<${USDC}>`;

/** Open an empty Save vault for the caller (first-time activation). */
export function buildOpenVaultTx(sender: string): Transaction {
  const tx = new Transaction();
  tx.setSender(sender);
  tx.moveCall({ target: `${PKG}::spending_vault::open`, typeArguments: [USDC], arguments: [] });
  return tx;
}

/**
 * Deposit `amountMicros` USDC into Save. The exact amount is sourced via the
 * CoinWithBalance helper (Address Balance first, owned coins as fallback); any
 * remainder stays in the user's wallet.
 */
export function buildDepositTx(input: {
  sender: string;
  vaultId: string;
  amountMicros: number | bigint;
}): Transaction {
  const tx = new Transaction();
  tx.setSender(input.sender);

  const depositCoin = tx.add(coinWithBalance({ type: USDC, balance: BigInt(input.amountMicros) }));

  tx.moveCall({
    target: `${PKG}::spending_vault::deposit`,
    typeArguments: [USDC],
    arguments: [
      tx.object(input.vaultId),
      depositCoin,
      tx.object(ENV.briskPoolId),
      tx.object(CLOCK_OBJECT_ID),
    ],
  });
  return tx;
}

/** Withdraw `amountMicros` from Save back to the user's wallet (as a Coin). */
export function buildWithdrawTx(input: {
  sender: string;
  vaultId: string;
  amountMicros: number | bigint;
}): Transaction {
  const tx = new Transaction();
  tx.setSender(input.sender);
  const out = tx.moveCall({
    target: `${PKG}::spending_vault::withdraw`,
    typeArguments: [USDC],
    arguments: [
      tx.object(input.vaultId),
      tx.pure.u64(BigInt(input.amountMicros)),
      tx.object(ENV.briskPoolId),
      tx.object(CLOCK_OBJECT_ID),
    ],
  });
  tx.transferObjects([out], tx.pure.address(input.sender));
  return tx;
}

// Enoki sponsorship allowlists. `open`/`withdraw` carry only the vault entry
// function (withdraw mints a fresh Coin — it never sources the Address Balance).
// `deposit` also carries the framework coin ops the CoinWithBalance resolver
// injects to source the deposit coin from the Address Balance / owned coins.
const SUI_FW = "0x0000000000000000000000000000000000000000000000000000000000000002";
export const OPEN_VAULT_TARGETS = [`${PKG}::spending_vault::open`];
export const DEPOSIT_TARGETS = [
  `${PKG}::spending_vault::deposit`,
  `${SUI_FW}::coin::redeem_funds`,
  `${SUI_FW}::coin::into_balance`,
  `${SUI_FW}::coin::send_funds`,
  `${SUI_FW}::coin::destroy_zero`,
];
export const WITHDRAW_TARGETS = [`${PKG}::spending_vault::withdraw`];
