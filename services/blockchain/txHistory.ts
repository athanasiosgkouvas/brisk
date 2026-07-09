import { getSuiClientForBuild } from "@/services/blockchain/suiClient";

/**
 * Address-filtered transaction history via the Sui GraphQL `transactions`
 * connection. The unified client interface has NO transaction-listing method
 * (JSON-RPC's `queryTransactionBlocks` has no drop-in), so history reads —
 * the Activity feed and Save history — go through a raw GraphQL query here.
 *
 * `sentAddress` = txs the address signed (its own moves). `affectedAddress` =
 * every tx that touched the address (sent OR received) — used for the feed.
 */

export type TxBalanceChange = { coinType: string; address: string | null; amount: string };
export type TxMoveCall = { module: string; function: string };
export type TxHistoryNode = {
  digest: string;
  timestampMs: number;
  balanceChanges: TxBalanceChange[];
  moveCalls: TxMoveCall[];
};

const TX_HISTORY_QUERY = `
query TxHistory($filter: TransactionFilter!, $last: Int!) {
  transactions(last: $last, filter: $filter) {
    nodes {
      digest
      effects {
        timestamp
        balanceChanges { nodes { amount coinType { repr } owner { address } } }
      }
      kind {
        __typename
        ... on ProgrammableTransaction {
          commands {
            nodes {
              __typename
              ... on MoveCallCommand { function { name module { name } } }
            }
          }
        }
      }
    }
  }
}`;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function normalize(n: any): TxHistoryNode {
  const ts = n?.effects?.timestamp;
  return {
    digest: n?.digest ?? "",
    // GraphQL DateTime is an ISO-8601 string.
    timestampMs: ts ? Date.parse(ts) : 0,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    balanceChanges: (n?.effects?.balanceChanges?.nodes ?? []).map((b: any) => ({
      coinType: b?.coinType?.repr ?? "",
      address: b?.owner?.address ?? null,
      amount: String(b?.amount ?? "0"),
    })),
    moveCalls: (n?.kind?.commands?.nodes ?? [])
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .filter((c: any) => c?.__typename === "MoveCallCommand")
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .map((c: any) => ({
        module: c?.function?.module?.name ?? "",
        function: c?.function?.name ?? "",
      })),
  };
}

/** Recent transactions for an address, newest-first. `sent` = signed by the
 *  address; `affected` = touched the address either way. */
export async function fetchAddressTransactions(
  address: string,
  opts: { direction: "sent" | "affected"; last?: number },
): Promise<TxHistoryNode[]> {
  const client = await getSuiClientForBuild();
  const filter =
    opts.direction === "sent" ? { sentAddress: address } : { affectedAddress: address };
  const res = await client.query({
    query: TX_HISTORY_QUERY,
    variables: { filter, last: opts.last ?? 30 },
  });
  if (res?.errors?.length) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    throw new Error(res.errors.map((e: any) => e.message).join("; "));
  }
  const nodes = res?.data?.transactions?.nodes ?? [];
  // `last` returns the most-recent N in ascending order; reverse to newest-first.
  return nodes.map(normalize).reverse();
}
