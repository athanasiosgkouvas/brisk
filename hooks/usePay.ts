import { useCallback, useState } from "react";

import { useAuth } from "@/hooks/useAuth";
import { readInvoiceTag } from "@/services/nfc/reader";
import { payInvoice, type PayResult } from "@/services/blockchain/payments";
import { parseInvoice, type Invoice } from "@/services/blockchain/paymentTx";

export type PayStatus = "idle" | "reading" | "review" | "paying" | "done" | "error";

export function usePay() {
  const { session } = useAuth();
  const [status, setStatus] = useState<PayStatus>("idle");
  const [invoice, setInvoice] = useState<Invoice | null>(null);
  const [result, setResult] = useState<PayResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const reset = useCallback(() => {
    setStatus("idle");
    setInvoice(null);
    setResult(null);
    setError(null);
  }, []);

  /** Tap to read a terminal's invoice; transitions to the review step. */
  const tapToRead = useCallback(async () => {
    setError(null);
    setStatus("reading");
    try {
      const raw = await readInvoiceTag();
      const parsed = raw ? parseInvoice(raw) : null;
      if (!parsed) throw new Error("Couldn't read a Brisk invoice from that tap.");
      setInvoice(parsed);
      setStatus("review");
      return parsed;
    } catch (e) {
      setError(e instanceof Error ? e.message : "NFC read failed");
      setStatus("error");
      return null;
    }
  }, []);

  /** Pay the reviewed invoice. The explicit "Confirm & Pay" tap is the
   *  authorization — no separate biometric prompt (one less friction point). */
  const confirmAndPay = useCallback(async () => {
    if (!session || !invoice) return;
    setError(null);
    setStatus("paying");
    try {
      const res = await payInvoice(session, invoice, Date.now());
      setResult(res);
      setStatus("done");
      return res;
    } catch (e) {
      console.error("[brisk-pay] failed:", e instanceof Error ? e.message : e, e);
      setError(e instanceof Error ? e.message : "Payment failed");
      setStatus("error");
      return null;
    }
  }, [session, invoice]);

  return { status, invoice, result, error, tapToRead, confirmAndPay, reset };
}
