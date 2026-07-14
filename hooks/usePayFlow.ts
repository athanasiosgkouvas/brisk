import { useCallback, useState } from "react";

import { hapticError } from "@/utils/haptics";
import type { PayResult } from "@/services/blockchain/payments";

// The shared "tail" of every pay flow: once a normalized invoice exists, the
// review → authorize → settle → done/error steps are identical across Send, the
// NFC Pay tab, and pay-link. Each screen keeps its own bespoke "head" (how the
// invoice is acquired) and drives this runner for the rest.
export type PayFlowState = "review" | "authorizing" | "settling" | "done" | "error";

/**
 * A `settle()` returns the on-chain result, or the `"cancelled"` sentinel when
 * the user backs out mid-settle (e.g. declines the Cover-from-Save prompt) —
 * which returns to review with no error flash, matching the old per-screen
 * `setStatus("review")` behavior.
 */
export type SettleOutcome = PayResult | "cancelled";

export function usePayFlow() {
  const [state, setState] = useState<PayFlowState>("review");
  const [result, setResult] = useState<PayResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const confirm = useCallback(
    async ({
      authorize,
      settle,
      onSettled,
    }: {
      /** Optional gate before settling (e.g. biometric). Falsy → back to review. */
      authorize?: () => Promise<boolean>;
      settle: () => Promise<SettleOutcome>;
      onSettled?: (result: PayResult) => void;
    }) => {
      setError(null);
      try {
        if (authorize) {
          setState("authorizing");
          const ok = await authorize();
          if (!ok) {
            setState("review");
            return;
          }
        }
        setState("settling");
        const outcome = await settle();
        if (outcome === "cancelled") {
          setState("review");
          return;
        }
        setResult(outcome);
        setState("done");
        onSettled?.(outcome);
      } catch (e) {
        console.error("[brisk-pay] failed:", e instanceof Error ? e.message : e, e);
        setError(e instanceof Error ? e.message : "Payment failed");
        setState("error");
        void hapticError();
      }
    },
    [],
  );

  /** Reset the tail back to a fresh review (clears result + error). Call before
   *  (re-)entering the review step so a prior error/done state doesn't leak. */
  const reset = useCallback(() => {
    setResult(null);
    setError(null);
    setState("review");
  }, []);

  return { state, result, error, confirm, reset };
}
