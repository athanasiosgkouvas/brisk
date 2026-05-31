import { Transaction } from "@mysten/sui/transactions";
import { coinWithBalance } from "@mysten/sui/transactions";

import { CLOCK_OBJECT_ID, ENV } from "@/utils/constants";

/**
 * PTB builders for the Save vault (spending_vault + mock_lender). All run as
 * Enoki-sponsored txs (object creation / Move calls aren't native-gasless), so
 * the user pays no gas. The shared LendingPool id comes from ENV.briskPoolId
 * (set after republish + create_pool).
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

/** Deposit `amountMicros` USDC into Save. */
export function buildDepositTx(input: {
  sender: string;
  vaultId: string;
  amountMicros: number | bigint;
}): Transaction {
  const tx = new Transaction();
  tx.setSender(input.sender);
  const coin = tx.add(coinWithBalance({ type: USDC, balance: BigInt(input.amountMicros) }));
  tx.moveCall({
    target: `${PKG}::spending_vault::deposit`,
    typeArguments: [USDC],
    arguments: [
      tx.object(input.vaultId),
      coin,
      tx.object(ENV.briskPoolId),
      tx.object(CLOCK_OBJECT_ID),
    ],
  });
  return tx;
}

/** Withdraw `amountMicros` from Save back to the user's spendable balance. */
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

export const OPEN_VAULT_TARGETS = [`${PKG}::spending_vault::open`];
export const DEPOSIT_TARGETS = [
  `${PKG}::spending_vault::deposit`,
  "0x2::coin::send_funds",
  "0x2::coin::into_balance",
  "0x2::coin::from_balance",
  "0x2::balance::send_funds",
  "0x2::balance::split",
];
export const WITHDRAW_TARGETS = [
  `${PKG}::spending_vault::withdraw`,
  "0x2::coin::send_funds",
  "0x2::balance::send_funds",
];
