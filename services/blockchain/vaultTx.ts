import { Transaction } from "@mysten/sui/transactions";

import { CLOCK_OBJECT_ID, ENV } from "@/utils/constants";

/**
 * PTB builders for the Save vault (spending_vault + mock_lender). All run as
 * Enoki-sponsored txs (object creation / Move calls aren't native-gasless), so
 * the user pays no gas. The shared LendingPool id comes from ENV.briskPoolId.
 *
 * Deposit sources USDC from explicit Coin objects (split/merge) rather than the
 * CoinWithBalance helper: the helper prefers the Address Balance and emits a
 * `CallArg::FundsWithdrawal` the Enoki gas station can't deserialize. A plain
 * Coin input is `CallArg::Object`, which sponsors fine.
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
 * Deposit `amountMicros` USDC into Save, sourced from the caller's owned Coin
 * objects (`coinObjectIds`, which must sum to >= the amount). Coins are merged
 * then split to the exact amount; the remainder stays in the user's wallet.
 */
export function buildDepositTx(input: {
  sender: string;
  vaultId: string;
  amountMicros: number | bigint;
  coinObjectIds: string[];
}): Transaction {
  const tx = new Transaction();
  tx.setSender(input.sender);

  const [primary, ...rest] = input.coinObjectIds.map((id) => tx.object(id));
  if (rest.length > 0) tx.mergeCoins(primary, rest);
  const [depositCoin] = tx.splitCoins(primary, [tx.pure.u64(BigInt(input.amountMicros))]);

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

// Enoki sponsorship allowlists. The vault entry functions are the only
// top-level Move-call targets; split/merge/transfer are PTB commands (no
// allowlist), and the lender calls happen inside `deposit`/`withdraw`.
export const OPEN_VAULT_TARGETS = [`${PKG}::spending_vault::open`];
export const DEPOSIT_TARGETS = [`${PKG}::spending_vault::deposit`];
export const WITHDRAW_TARGETS = [`${PKG}::spending_vault::withdraw`];
