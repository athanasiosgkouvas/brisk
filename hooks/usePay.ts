import { useCallback, useRef, useState } from "react";
import { Platform } from "react-native";

import { useAuth } from "@/hooks/useAuth";
import { hapticError, hapticTxSuccess } from "@/utils/haptics";
import { cancelRead, isNfcEnabled, isNfcSupported, readInvoiceTag } from "@/services/nfc/reader";
import { payInvoice, type PayResult } from "@/services/blockchain/payments";
import { parseInvoice, type Invoice } from "@/services/blockchain/paymentTx";

export type PayStatus = "idle" | "reading" | "review" | "paying" | "done" | "error" | "nfc_off";

export function usePay() {
  const { session } = useAuth();
  const [status, setStatus] = useState<PayStatus>("idle");
  const [invoice, setInvoice] = useState<Invoice | null>(null);
  const [result, setResult] = useState<PayResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const cancelledRef = useRef(false);

  const reset = useCallback(() => {
    setStatus("idle");
    setInvoice(null);
    setResult(null);
    setError(null);
  }, []);

  /** Abort an in-flight read and return to idle (no error flash). */
  const cancel = useCallback(() => {
    cancelledRef.current = true;
    cancelRead();
    reset();
  }, [reset]);

  /** Tap to read a terminal's invoice; transitions to the review step. */
  const tapToRead = useCallback(async () => {
    setError(null);
    // NFC must be present and turned on before we attempt a read. On iOS there's
    // no NFC toggle, so the enabled-check only matters on Android.
    if (!(await isNfcSupported())) {
      setError("This device doesn't support NFC.");
      setStatus("error");
      return null;
    }
    if (Platform.OS === "android" && !(await isNfcEnabled())) {
      setStatus("nfc_off");
      return null;
    }
    cancelledRef.current = false;
    setStatus("reading");
    try {
      const raw = await readInvoiceTag();
      const parsed = raw ? parseInvoice(raw) : null;
      if (!parsed) throw new Error("Couldn't read a Brisk invoice from that tap.");
      setInvoice(parsed);
      setStatus("review");
      return parsed;
    } catch (e) {
      // A user-initiated cancel rejects the read too — don't show it as an error.
      if (cancelledRef.current) return null;
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
      const res = await payInvoice(session, invoice);
      setResult(res);
      setStatus("done");
      void hapticTxSuccess();
      return res;
    } catch (e) {
      console.error("[brisk-pay] failed:", e instanceof Error ? e.message : e, e);
      setError(e instanceof Error ? e.message : "Payment failed");
      setStatus("error");
      void hapticError();
      return null;
    }
  }, [session, invoice]);

  return { status, invoice, result, error, tapToRead, confirmAndPay, reset, cancel };
}
