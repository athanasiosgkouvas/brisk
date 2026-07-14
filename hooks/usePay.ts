import { useCallback, useRef, useState } from "react";
import { Platform } from "react-native";

import { useAuth } from "@/hooks/useAuth";
import { cancelRead, isNfcEnabled, isNfcSupported, readInvoiceTag } from "@/services/nfc/reader";
import { payInvoice } from "@/services/blockchain/payments";
import { ensureSpendable } from "@/services/blockchain/coverFromSave";
import { parseInvoice, type Invoice } from "@/services/blockchain/paymentTx";
import type { SettleOutcome } from "@/hooks/usePayFlow";

// The NFC Pay "head": reading a terminal's invoice tag. The review → settle →
// done/error tail is the shared usePayFlow, driven by the Pay screen. `status`
// covers only the acquisition phase; once `invoice` is set (status "review"),
// the screen hands off to usePayFlow.
export type PayReadStatus = "idle" | "reading" | "review" | "error" | "nfc_off";

export function usePay() {
  const { session } = useAuth();
  const [status, setStatus] = useState<PayReadStatus>("idle");
  const [invoice, setInvoice] = useState<Invoice | null>(null);
  const [error, setError] = useState<string | null>(null);
  const cancelledRef = useRef(false);

  const reset = useCallback(() => {
    setStatus("idle");
    setInvoice(null);
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

  /** Settle the reviewed invoice (feeless), covering any shortfall from Save
   *  first. Pure runner for usePayFlow — sets no local state. */
  const settle = useCallback(async (): Promise<SettleOutcome> => {
    if (!session || !invoice) throw new Error("Nothing to pay");
    if ((await ensureSpendable(session, invoice.amountMicros)) === "cancelled") return "cancelled";
    return payInvoice(session, invoice);
  }, [session, invoice]);

  return { status, invoice, error, tapToRead, settle, reset, cancel };
}
