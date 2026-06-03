import { useCallback, useRef, useState } from "react";

import { useAuth } from "@/hooks/useAuth";
import { startEmulatingInvoice, stopEmulating } from "@/services/nfc/hce";
import { isNfcEnabled } from "@/services/nfc/reader";
import { getUsdcBalanceMicros, waitForSettlement } from "@/services/blockchain/payments";
import { ensureMerchant } from "@/services/blockchain/merchant";
import { hapticTxSuccess } from "@/utils/haptics";
import { encodeInvoice, type Invoice } from "@/services/blockchain/paymentTx";

export type ChargeStatus =
  | "idle"
  | "preparing"
  | "awaiting"
  | "paid"
  | "timeout"
  | "error"
  | "nfc_off";

const MERCHANT_NAME = "Brisk Merchant";

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
      // The HCE tag can't be presented while the radio is off — guard up front
      // so the merchant gets a clear prompt instead of a silent timeout.
      if (!(await isNfcEnabled())) {
        setStatus("nfc_off");
        return;
      }
      try {
        // Ensure this terminal has a shared Merchant object so the customer's
        // payment binds the receipt to a registered merchant (lazily registers
        // on first use). Done before emulating so the invoice can carry its id.
        setStatus("preparing");
        const merchantId = await ensureMerchant(session, MERCHANT_NAME);

        const inv: Invoice = {
          payee: session.address,
          merchantId,
          amountMicros,
          invoiceId: `${Date.now()}-${Math.floor(Math.random() * 1_000_000)}`,
          merchant: MERCHANT_NAME,
        };
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
