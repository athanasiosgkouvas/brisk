import { useCallback, useRef, useState } from "react";

import { useAuth } from "@/hooks/useAuth";
import { startEmulatingInvoice, stopEmulating } from "@/services/nfc/hce";
import { isNfcEnabled } from "@/services/nfc/reader";
import { getUsdcBalanceMicros, waitForSettlement } from "@/services/blockchain/payments";
import { ensureMerchant } from "@/services/blockchain/merchant";
import { createPaymentLink } from "@/services/api/backendApi";
import { hapticTxSuccess } from "@/utils/haptics";
import { encodeInvoice, type Invoice } from "@/services/blockchain/paymentTx";

export type ChargeStatus =
  | "idle"
  | "preparing"
  | "awaiting"
  | "link"
  | "paid"
  | "timeout"
  | "error"
  | "nfc_off";

const MERCHANT_NAME = "Brisk Merchant";

export function useCharge() {
  const { session } = useAuth();
  const [status, setStatus] = useState<ChargeStatus>("idle");
  const [invoice, setInvoice] = useState<Invoice | null>(null);
  const [linkUrl, setLinkUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const activeRef = useRef(false);

  const cancel = useCallback(async () => {
    activeRef.current = false;
    await stopEmulating();
    setStatus("idle");
    setInvoice(null);
    setLinkUrl(null);
    setError(null);
  }, []);

  /** Build the invoice for a fresh charge (lazily registers the merchant). */
  const buildInvoice = useCallback(
    async (amountMicros: number): Promise<{ invoice: Invoice; merchantId: string }> => {
      if (!session) throw new Error("Not signed in");
      const merchantId = await ensureMerchant(session, MERCHANT_NAME);
      return {
        merchantId,
        invoice: {
          payee: session.address,
          merchantId,
          amountMicros,
          invoiceId: `${Date.now()}-${Math.floor(Math.random() * 1_000_000)}`,
          merchant: MERCHANT_NAME,
        },
      };
    },
    [session],
  );

  /** Watch the merchant's balance and flip to paid once this charge lands. */
  const awaitSettlement = useCallback(
    async (amountMicros: number, baselineMicros: number) => {
      const settled = await waitForSettlement({
        merchant: session!.address,
        baselineMicros,
        expectedMicros: amountMicros,
      });
      if (!activeRef.current) return; // cancelled
      await stopEmulating();
      setStatus(settled ? "paid" : "timeout");
      if (settled) void hapticTxSuccess();
    },
    [session],
  );

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
        const { invoice: inv } = await buildInvoice(amountMicros);
        // Baseline the merchant's balance BEFORE emulating, so we only count
        // funds that arrive for this charge. Settlement keys on the actual money
        // landing (robust even if the best-effort receipt leg never mints).
        const baselineMicros = await getUsdcBalanceMicros(session.address).catch(() => 0);
        await startEmulatingInvoice(encodeInvoice(inv));
        setInvoice(inv);
        setStatus("awaiting");
        activeRef.current = true;
        await awaitSettlement(amountMicros, baselineMicros);
      } catch (e) {
        await stopEmulating();
        setError(e instanceof Error ? e.message : "Charge failed");
        setStatus("error");
      }
    },
    [session, buildInvoice, awaitSettlement],
  );

  /**
   * Create a shareable payment link for `amountMicros`: register the merchant if
   * needed, mint the link server-side, and start watching for settlement so the
   * sheet flips to "paid" when the customer pays. Works on every platform (no
   * NFC), so iOS merchants can charge too.
   */
  const createLink = useCallback(
    async (amountMicros: number) => {
      if (!session) return;
      setError(null);
      try {
        setStatus("preparing");
        const { invoice: inv } = await buildInvoice(amountMicros);
        const baselineMicros = await getUsdcBalanceMicros(session.address).catch(() => 0);
        const { url } = await createPaymentLink({
          sender: session.address,
          merchantId: inv.merchantId,
          payee: inv.payee,
          amountMicros: inv.amountMicros,
          invoiceId: inv.invoiceId,
          merchant: inv.merchant,
        });
        setInvoice(inv);
        setLinkUrl(url);
        setStatus("link");
        activeRef.current = true;
        await awaitSettlement(amountMicros, baselineMicros);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Couldn't create payment link");
        setStatus("error");
      }
    },
    [session, buildInvoice, awaitSettlement],
  );

  return { status, invoice, linkUrl, error, startCharge, createLink, cancel };
}
