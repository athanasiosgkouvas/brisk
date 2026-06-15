import { executeSponsoredTransaction, sponsorTransaction } from "@/services/api/backendApi";
import { enokiAuthService } from "@/services/auth/enokiAuth";
import type { AuthSession } from "@/types/user";

/**
 * The Enoki two-call dance:
 *   1. Backend (`/api/sponsor`) wraps our PTB into a sponsored tx and returns
 *      the bytes to sign + a digest.
 *   2. App signs locally via `EnokiKeypair` (zkLogin signature) — backend
 *      never sees the ephemeral key.
 *   3. Backend (`/api/execute`) submits the signed sponsored tx.
 *
 * `allowedMoveCallTargets` is mandatory whenever the PTB calls into Move —
 * Enoki refuses any tx that calls a target outside the allowlist.
 */
export async function executeSponsored(input: {
  session: AuthSession;
  txKindBytes: string;
  allowedMoveCallTargets: string[];
  allowedAddresses?: string[];
}): Promise<{ digest: string }> {
  const sponsored = await sponsorTransaction({
    sender: input.session.address,
    transactionKindBytes: input.txKindBytes,
    allowedMoveCallTargets: input.allowedMoveCallTargets,
    allowedAddresses: input.allowedAddresses,
  });
  const signature = await enokiAuthService.signSponsoredTransaction(sponsored.bytes, input.session);
  return executeSponsoredTransaction({ digest: sponsored.digest, signature });
}
