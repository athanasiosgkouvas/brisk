import { useCallback, useRef, useState } from "react";

import { useAuth } from "@/hooks/useAuth";
import { startEmulatingInvoice, stopEmulating } from "@/services/nfc/hce";
import { getUsdcBalanceMicros, waitForSettlement } from "@/services/blockchain/payments";
import { hapticTxSuccess } from "@/utils/haptics";
import { encodeInvoice, type Invoice } from "@/services/blockchain/paymentTx";

export type ChargeStatus = "idle" | "awaiting" | "paid" | "timeout" | "error";

const MERCHANT_NAME = "Brisk Merchant"; // Phase 2: from merchant_registry

export function useCharge() {
  const { session } = useAuth();
  const [status, setStatus] = useState<ChargeStatus>("idle");
  const [invoice, setInvoice] = useState<Invoice | null>(null);
  const [error, setError] = useState<string | null>(null);
  const activeRef = useRef(false);

  const cancel = useCallback(async () => {
    activeRef.current = false;
    await stopEmulating();
    setStatus("idle");
    setInvoice(null);
    setError(null);
  }, []);

  /** Begin charging: emulate the invoice tag and wait for on-chain settlement. */
  const startCharge = useCallback(
    async (amountMicros: number) => {
      if (!session) return;
      setError(null);
      const inv: Invoice = {
        payee: session.address,
        amountMicros,
        invoiceId: `${Date.now()}-${Math.floor(Math.random() * 1_000_000)}`,
        merchant: MERCHANT_NAME,
      };
      try {
        // Baseline the merchant's balance BEFORE emulating, so we only count
        // funds that arrive for this charge. Settlement keys on the actual money
        // landing (robust even if the best-effort receipt leg never mints).
        const baselineMicros = await getUsdcBalanceMicros(session.address).catch(() => 0);
        await startEmulatingInvoice(encodeInvoice(inv));
        setInvoice(inv);
        setStatus("awaiting");
        activeRef.current = true;

        const settled = await waitForSettlement({
          merchant: session.address,
          baselineMicros,
          expectedMicros: amountMicros,
        });
        if (!activeRef.current) return; // cancelled
        await stopEmulating();
        setStatus(settled ? "paid" : "timeout");
        if (settled) void hapticTxSuccess();
      } catch (e) {
        await stopEmulating();
        setError(e instanceof Error ? e.message : "Charge failed");
        setStatus("error");
      }
    },
    [session],
  );

  return { status, invoice, error, startCharge, cancel };
}
