import { useCallback, useRef, useState } from "react";

import { useAuth } from "@/hooks/useAuth";
import { useUsername } from "@/hooks/useUsername";
import { startEmulatingInvoice, stopEmulating } from "@/services/nfc/hce";
import { isNfcEnabled } from "@/services/nfc/reader";
import { getUsdcBalanceMicros, waitForSettlement } from "@/services/blockchain/payments";
import { encodeInvoice } from "@/services/blockchain/paymentTx";

// Personal "receive by tap": present a merchant-less P2P invoice (payee = the
// user's own wallet, amount set by the receiver) over Android HCE and watch the
// user's own USDC balance for the incoming credit. A trimmed useCharge — no
// merchant, no till, no receipt leg.
export type ReceiveTapStatus = "idle" | "awaiting" | "paid" | "timeout" | "error" | "nfc_off";

export function useReceiveTap() {
  const { session } = useAuth();
  const { alias } = useUsername();
  const [status, setStatus] = useState<ReceiveTapStatus>("idle");
  const [amountMicros, setAmountMicros] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const activeRef = useRef(false);

  const cancel = useCallback(async () => {
    activeRef.current = false;
    await stopEmulating();
    setStatus("idle");
    setAmountMicros(0);
    setError(null);
  }, []);

  const startReceive = useCallback(
    async (micros: number) => {
      if (!session || micros <= 0) return;
      setError(null);
      // HCE can't present with the radio off — prompt instead of silently failing.
      if (!(await isNfcEnabled())) {
        setStatus("nfc_off");
        return;
      }
      try {
        // Baseline the user's own balance before presenting, so we only count the
        // funds that arrive for this request.
        const baselineMicros = await getUsdcBalanceMicros(session.address).catch(() => 0);
        await startEmulatingInvoice(
          encodeInvoice({
            payee: session.address,
            amountMicros: micros,
            invoiceId: `${Date.now()}-${Math.floor(Math.random() * 1_000_000)}`,
            merchant: alias ?? "Brisk user",
            kind: "p2p",
          }),
        );
        setAmountMicros(micros);
        setStatus("awaiting");
        activeRef.current = true;
        const settled = await waitForSettlement({
          merchant: session.address,
          baselineMicros,
          expectedMicros: micros,
          readBalance: getUsdcBalanceMicros,
        });
        if (!activeRef.current) return; // cancelled
        await stopEmulating();
        setStatus(settled ? "paid" : "timeout");
      } catch (e) {
        await stopEmulating();
        setError(e instanceof Error ? e.message : "Couldn't present the tag");
        setStatus("error");
      }
    },
    [session, alias],
  );

  return { status, amountMicros, error, startReceive, cancel };
}
