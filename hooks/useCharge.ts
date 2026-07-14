import { useCallback, useRef, useState } from "react";

import { useAuth } from "@/hooks/useAuth";
import { useMerchantProfile } from "@/hooks/useMerchantProfile";
import { startEmulatingInvoice, stopEmulating } from "@/services/nfc/hce";
import { isNfcEnabled } from "@/services/nfc/reader";
import { waitForSettlement } from "@/services/blockchain/payments";
import { ensureMerchant } from "@/services/blockchain/merchant";
import { getTillBalanceMicros } from "@/services/blockchain/till";
import { createPaymentLink } from "@/services/api/backendApi";
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

const FALLBACK_MERCHANT_NAME = "Brisk Merchant";

export function useCharge() {
  const { session } = useAuth();
  const { name: businessName } = useMerchantProfile();
  const merchantName = businessName?.trim() || FALLBACK_MERCHANT_NAME;
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

  /**
   * Build the invoice for a fresh charge. The customer pays into the merchant's
   * TILL (`payee` = the till's receiving address), so the merchant's private
   * treasury is never embedded in the tag/link. The receipt is still bound to the
   * Merchant id (lazily registered if somehow missing).
   */
  const buildInvoice = useCallback(
    async (
      amountMicros: number,
      tillId: string,
    ): Promise<{ invoice: Invoice; merchantId: string }> => {
      if (!session) throw new Error("Not signed in");
      const merchantId = await ensureMerchant(session, merchantName);
      return {
        merchantId,
        invoice: {
          payee: tillId, // funds land in the till's address accumulator
          merchantId,
          tillId,
          amountMicros,
          invoiceId: `${Date.now()}-${Math.floor(Math.random() * 1_000_000)}`,
          merchant: merchantName,
        },
      };
    },
    [session, merchantName],
  );

  /** Watch the TILL's balance and flip to paid once this charge lands. */
  const awaitSettlement = useCallback(
    async (amountMicros: number, baselineMicros: number, tillId: string) => {
      const settled = await waitForSettlement({
        merchant: tillId,
        baselineMicros,
        expectedMicros: amountMicros,
        // Till funds arrive in the address-balance accumulator — read accordingly.
        readBalance: getTillBalanceMicros,
      });
      if (!activeRef.current) return; // cancelled
      await stopEmulating();
      setStatus(settled ? "paid" : "timeout");
      // The success haptic fires from the SuccessSheet on the paid screen.
    },
    [],
  );

  /** Begin charging: emulate the invoice tag and wait for on-chain settlement. */
  const startCharge = useCallback(
    async (amountMicros: number, tillId: string) => {
      if (!session) return;
      setError(null);
      // The HCE tag can't be presented while the radio is off — guard up front
      // so the merchant gets a clear prompt instead of a silent timeout.
      if (!(await isNfcEnabled())) {
        setStatus("nfc_off");
        return;
      }
      try {
        setStatus("preparing");
        const { invoice: inv } = await buildInvoice(amountMicros, tillId);
        // Baseline the TILL's balance BEFORE emulating, so we only count funds
        // that arrive for this charge. Settlement keys on the money landing in
        // the till (robust even if the best-effort receipt leg never mints).
        const baselineMicros = await getTillBalanceMicros(tillId).catch(() => 0);
        await startEmulatingInvoice(encodeInvoice(inv));
        setInvoice(inv);
        setStatus("awaiting");
        activeRef.current = true;
        await awaitSettlement(amountMicros, baselineMicros, tillId);
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
    async (amountMicros: number, tillId: string, expiresInSec?: number, reusable?: boolean) => {
      if (!session) return;
      setError(null);
      try {
        setStatus("preparing");
        const { invoice: inv } = await buildInvoice(amountMicros, tillId);
        const baselineMicros = await getTillBalanceMicros(tillId).catch(() => 0);
        const { url } = await createPaymentLink({
          sender: session.address,
          merchantId: inv.merchantId,
          payee: inv.payee,
          tillId,
          amountMicros: inv.amountMicros,
          invoiceId: inv.invoiceId,
          merchant: inv.merchant,
          expiresInSec,
          reusable,
        });
        setInvoice(inv);
        setLinkUrl(url);
        setStatus("link");
        activeRef.current = true;
        await awaitSettlement(amountMicros, baselineMicros, tillId);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Couldn't create payment link");
        setStatus("error");
      }
    },
    [session, buildInvoice, awaitSettlement],
  );

  return { status, invoice, linkUrl, error, startCharge, createLink, cancel };
}
