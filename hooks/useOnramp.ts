import { useCallback, useRef, useState } from "react";
import * as WebBrowser from "expo-web-browser";

import { useAuth } from "@/hooks/useAuth";
import { createOnrampSession } from "@/services/api/backendApi";
import { getSpendableUsdcMicros } from "@/services/blockchain/wallet";
import { waitForSettlement } from "@/services/blockchain/payments";

/** Deep link Coinbase returns to; intercepted in-place by openAuthSessionAsync
 *  (the same mechanism as brisk://oauth), so no cold-start link handling needed. */
const ONRAMP_RETURN_URL = "brisk://onramp-return";

// Onramp delivery (fiat clearing + on-chain send) can take a couple of minutes;
// poll a good while, then hand off to the home screen's ambient balance polling.
const CONFIRM_TIMEOUT_MS = 180_000;
const CONFIRM_INTERVAL_MS = 3_000;

export type OnrampStatus =
  | "idle"
  | "starting" // creating the session / opening the browser
  | "confirming" // browser closed on success; watching the balance land
  | "done" // funds detected on-chain
  | "processing" // returned but not yet landed — will update in the background
  | "canceled" // user dismissed the Coinbase sheet
  | "error";

export type UseOnramp = {
  status: OnrampStatus;
  error: string | null;
  /** USDC micros credited this run (balance delta), for the success state. */
  creditedMicros: number;
  /** Kick off a buy. `amountUsd` optionally presets the amount in Coinbase. */
  start: (amountUsd?: number) => Promise<void>;
  reset: () => void;
};

/**
 * Buy USDC via Coinbase's hosted onramp: create a backend session → open the
 * hosted flow in an in-app browser → on return, watch the balance for the funds
 * to land. State machine shaped after usePayFlow (review → authorize → settle).
 */
export function useOnramp(): UseOnramp {
  const { session } = useAuth();
  const [status, setStatus] = useState<OnrampStatus>("idle");
  const [error, setError] = useState<string | null>(null);
  const [creditedMicros, setCreditedMicros] = useState(0);
  const busy = useRef(false);

  const reset = useCallback(() => {
    setStatus("idle");
    setError(null);
    setCreditedMicros(0);
  }, []);

  const start = useCallback(
    async (amountUsd?: number) => {
      if (busy.current) return;
      if (!session?.address) {
        setStatus("error");
        setError("Sign in to add funds.");
        return;
      }
      busy.current = true;
      setError(null);
      setStatus("starting");

      try {
        // Baseline the balance BEFORE opening, so we can detect the increase.
        const baseline = await getSpendableUsdcMicros(session.address).catch(() => 0);
        const { url } = await createOnrampSession(session.address, amountUsd, "app");

        const result = await WebBrowser.openAuthSessionAsync(url, ONRAMP_RETURN_URL);
        if (result.type !== "success") {
          // 'cancel' (iOS) / 'dismiss' (Android) — the user closed the sheet.
          setStatus("canceled");
          return;
        }

        // Returned successfully — watch for ANY increase over baseline (the user
        // may have bought a different amount than the preset, and fees/FX vary).
        setStatus("confirming");
        const landed = await waitForSettlement({
          merchant: session.address,
          baselineMicros: baseline,
          expectedMicros: 1,
          readBalance: getSpendableUsdcMicros,
          timeoutMs: CONFIRM_TIMEOUT_MS,
          intervalMs: CONFIRM_INTERVAL_MS,
        });
        if (landed) {
          const finalMicros = await getSpendableUsdcMicros(session.address).catch(() => baseline);
          setCreditedMicros(Math.max(0, finalMicros - baseline));
          setStatus("done");
        } else {
          setStatus("processing");
        }
      } catch (e) {
        setStatus("error");
        setError(e instanceof Error ? e.message : "Couldn't start the onramp. Try again.");
      } finally {
        busy.current = false;
      }
    },
    [session],
  );

  return { status, error, creditedMicros, start, reset };
}
