import { Transaction } from "@mysten/sui/transactions";
import { SuiGraphQLClient } from "@mysten/sui/graphql";

import { CONFIG } from "./config";
import { getSigner, type WebSession } from "./auth";
import { markPaid, type ResolvedLink } from "./api";

function suiClient(): SuiGraphQLClient {
  // JSON-RPC is deactivated on testnet; use the GraphQL transport like the app
  // (services/blockchain/suiClient.ts). `url` must agree with `network`.
  const url = CONFIG.rpcUrl || `https://graphql.${CONFIG.suiNetwork}.sui.io/graphql`;
  return new SuiGraphQLClient({ network: CONFIG.suiNetwork, url });
}

/**
 * Native-gasless USDC transfer — the settlement leg (services/blockchain/
 * paymentTx.ts:buildGaslessTransferTx). A bare `0x2::balance::send_funds<USDC>`
 * with gas set to 0; USDC is allowlisted for gasless send_funds.
 */
function buildGaslessTransferTx(input: {
  sender: string;
  payee: string;
  amountMicros: number;
}): Transaction {
  const tx = new Transaction();
  const balance = tx.balance({ type: CONFIG.usdcType, balance: BigInt(input.amountMicros) });
  tx.moveCall({
    target: "0x2::balance::send_funds",
    typeArguments: [CONFIG.usdcType],
    arguments: [balance, tx.pure.address(input.payee)],
  });
  tx.setSender(input.sender);
  tx.setGasPrice(0);
  tx.setGasBudget(0);
  return tx;
}

type ExecResult = {
  $kind?: string;
  Transaction?: { digest: string; effects?: { status?: { error?: { message?: string } } } };
  FailedTransaction?: { digest?: string; effects?: { status?: { error?: { message?: string } } } };
};

/**
 * Sign + submit the gasless transfer straight to the fullnode (no sponsor), then
 * best-effort notify the backend. Mirrors services/blockchain/payments.ts:payGasless,
 * including the $kind check (executeTransaction does NOT throw on an on-chain abort).
 * Returns the settlement digest.
 */
export async function payLink(
  session: WebSession,
  invoice: ResolvedLink,
  code: string,
): Promise<string> {
  const client = suiClient();
  const tx = buildGaslessTransferTx({
    sender: session.address,
    payee: invoice.payee,
    amountMicros: invoice.amountMicros,
  });
  const bytes = await tx.build({ client });
  const signer = getSigner(session);
  const { signature } = await signer.signTransaction(bytes);

  const res = (await client.executeTransaction({
    transaction: bytes,
    signatures: [signature],
    include: { effects: true },
  })) as ExecResult;

  // executeTransaction does NOT throw on an on-chain abort — it returns
  // $kind:"FailedTransaction". Surface that rather than reporting a false success.
  if (res.$kind !== "Transaction" || !res.Transaction) {
    const failed = res.FailedTransaction;
    const reason = failed?.effects?.status?.error?.message ?? failed?.digest ?? "unknown";
    throw new Error(`Payment failed to settle (${reason})`);
  }

  const digest = res.Transaction.digest;
  await markPaid(code, digest);
  return digest;
}
