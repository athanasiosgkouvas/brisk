import { useCallback, useState } from "react";
import * as LocalAuthentication from "expo-local-authentication";

import { useAuth } from "@/hooks/useAuth";
import { readInvoiceTag } from "@/services/nfc/reader";
import { payInvoice, type PayResult } from "@/services/blockchain/payments";
import { formatUsd, parseInvoice, type Invoice } from "@/services/blockchain/paymentTx";

export type PayStatus = "idle" | "reading" | "review" | "authorizing" | "paying" | "done" | "error";

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

  /** Biometric gate, then pay the reviewed invoice. */
  const confirmAndPay = useCallback(async () => {
    if (!session || !invoice) return;
    setError(null);
    setStatus("authorizing");
    try {
      const auth = await LocalAuthentication.authenticateAsync({
        promptMessage: `Pay ${formatUsd(invoice.amountMicros)} to ${invoice.merchant}`,
        cancelLabel: "Cancel",
      });
      if (!auth.success) throw new Error("Payment not authorized.");

      setStatus("paying");
      const res = await payInvoice(session, invoice);
      setResult(res);
      setStatus("done");
      return res;
    } catch (e) {
      setError(e instanceof Error ? e.message : "Payment failed");
      setStatus("error");
      return null;
    }
  }, [session, invoice]);

  return { status, invoice, result, error, tapToRead, confirmAndPay, reset };
}
