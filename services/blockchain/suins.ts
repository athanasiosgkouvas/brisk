import { getSuiClientForBuild } from "@/services/blockchain/suiClient";

/**
 * SuiNS forward resolution (name → address) over the app's GraphQL transport.
 * The `address(name:)` root field returns the resolved address (verified against
 * the testnet endpoint). Fail-closed: returns null on an unregistered name or any
 * error, so the caller treats it as "not found" rather than sending blindly.
 */
const SUINS_QUERY = `query ResolveSuiNS($name: String!) { address(name: $name) { address } }`;

export async function resolveSuiNS(name: string): Promise<string | null> {
  const n = name.trim().toLowerCase();
  if (!n.endsWith(".sui")) return null;
  try {
    const client = await getSuiClientForBuild();
    const res = await client.query({ query: SUINS_QUERY, variables: { name: n } });
    if (res?.errors?.length) return null;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const addr = (res?.data as any)?.address?.address;
    return typeof addr === "string" && addr.startsWith("0x") ? addr : null;
  } catch {
    return null;
  }
}
