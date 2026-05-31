import { useCallback, useRef, useState } from "react";

import { useAuth } from "@/hooks/useAuth";
import { startEmulatingInvoice, stopEmulating } from "@/services/nfc/hce";
import { waitForPaymentEvent } from "@/services/blockchain/receipts";
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
        const sinceMs = Date.now();
        await startEmulatingInvoice(encodeInvoice(inv));
        setInvoice(inv);
        setStatus("awaiting");
        activeRef.current = true;

        const settled = await waitForPaymentEvent({
          merchant: session.address,
          sinceMs,
          expectedMicros: amountMicros,
        });
        if (!activeRef.current) return; // cancelled
        await stopEmulating();
        setStatus(settled ? "paid" : "timeout");
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
