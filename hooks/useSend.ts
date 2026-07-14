import { useCallback } from "react";
import * as LocalAuthentication from "expo-local-authentication";

import { useAuth } from "@/hooks/useAuth";
import { isValidSuiAddress, sendUsdc } from "@/services/blockchain/wallet";
import { ensureSpendable } from "@/services/blockchain/coverFromSave";
import { formatUsd } from "@/services/blockchain/paymentTx";
import type { SettleOutcome } from "@/hooks/usePayFlow";

// The P2P Send "head": validate + acquire the recipient/amount. The review →
// authorize (Face ID) → settle → done/error tail is the shared usePayFlow,
// driven by the Send screen.
export function useSend() {
  const { session } = useAuth();

  /** Validate before entering review. Returns an error message, or null when ok. */
  const validate = useCallback((to: string, amountMicros: number): string | null => {
    if (!isValidSuiAddress(to)) return "Enter a valid 0x address.";
    if (amountMicros <= 0) return "Enter an amount.";
    return null;
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

  return { validate, authorize, settle };
}
