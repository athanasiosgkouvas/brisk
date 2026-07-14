import { useCallback } from "react";
import * as LocalAuthentication from "expo-local-authentication";

import { useAuth } from "@/hooks/useAuth";
import { isValidSuiAddress, sendUsdc } from "@/services/blockchain/wallet";
import { ensureSpendable } from "@/services/blockchain/coverFromSave";
import { formatUsd } from "@/services/blockchain/paymentTx";
import { resolveSuiNS } from "@/services/blockchain/suins";
import { resolveUsername } from "@/services/api/backendApi";
import { isBriskHandle, normalizeHandle } from "@/utils/handle";
import type { SettleOutcome } from "@/hooks/usePayFlow";

/** A recipient resolved from free text: the on-chain `address` to send to, and a
 *  friendly `display` (alias / name / the address itself). */
export type ResolvedRecipient = { address: string; display: string } | { error: string };

// The P2P Send "head": resolve + acquire the recipient/amount. The review →
// authorize (Face ID) → settle → done/error tail is the shared usePayFlow,
// driven by the Send screen.
export function useSend() {
  const { session } = useAuth();

  /**
   * Resolve free-text input to an address: a raw 0x address, a Brisk username
   * (`handle` or `handle@brisk`), or a SuiNS `name.sui`. Async (username/SuiNS
   * need a lookup); returns an `error` message on anything unresolvable.
   */
  const resolveRecipient = useCallback(async (raw: string): Promise<ResolvedRecipient> => {
    const text = raw.trim();
    if (!text) return { error: "Enter a recipient." };
    // Raw Sui address — fast path, no network.
    if (text.startsWith("0x")) {
      return isValidSuiAddress(text)
        ? { address: text, display: text }
        : { error: "Enter a valid 0x address." };
    }
    // SuiNS name.
    if (text.toLowerCase().endsWith(".sui")) {
      const addr = await resolveSuiNS(text);
      return addr
        ? { address: addr, display: text.toLowerCase() }
        : { error: `Couldn't resolve ${text.toLowerCase()}` };
    }
    // Brisk username.
    if (isBriskHandle(text)) {
      const user = await resolveUsername(normalizeHandle(text)!);
      return user
        ? { address: user.ownerAddr, display: user.alias }
        : { error: "No Brisk user with that username." };
    }
    return { error: "Enter an address, @brisk username, or name.sui." };
  }, []);

  /** Biometric gate, run as usePayFlow's `authorize` step. */
  const authorize = useCallback(async (amountMicros: number): Promise<boolean> => {
    const auth = await LocalAuthentication.authenticateAsync({
      promptMessage: `Send ${formatUsd(amountMicros)}`,
      cancelLabel: "Cancel",
    });
    return auth.success;
  }, []);

  /** Cover any shortfall from Save, then send. Pure runner for usePayFlow. */
  const settle = useCallback(
    async (to: string, amountMicros: number): Promise<SettleOutcome> => {
      if (!session) throw new Error("Not signed in");
      if ((await ensureSpendable(session, amountMicros)) === "cancelled") return "cancelled";
      return sendUsdc(session, to, amountMicros);
    },
    [session],
  );

  return { resolveRecipient, authorize, settle };
}
