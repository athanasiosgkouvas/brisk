import { useCallback, useEffect, useRef, useState } from "react";
import * as Haptics from "expo-haptics";

import { useAuth } from "@/hooks/useAuth";
import { useCharge } from "@/hooks/useCharge";
import { registerTerminal, reportSaleResult } from "@/services/api/backendApi";
import { findIncomingDigest } from "@/services/blockchain/payments";
import {
  getOrCreateDeviceId,
  loadTerminalId,
  saveTerminalId,
  saveTerminalToken,
} from "@/services/storage/prefsStorage";
import {
  TerminalSocket,
  type ConnectionState,
  type SaleMessage,
} from "@/services/pos/terminalSocket";

export type TerminalResult = { sessionId: string; ok: boolean; digest?: string };

/**
 * Drives POS "terminal mode": registers this device as a terminal, holds the
 * backend WebSocket open, and on each pushed SALE runs the NFC charge, resolves
 * the on-chain settlement digest, and reports it back to the backend (which the
 * ERP polls). Reuses `useCharge` for the NFC + settlement leg.
 */
export function usePosTerminal(opts: {
  enabled: boolean;
  tillId: string | null;
  merchantId: string | null;
  merchantName: string;
  // How the customer pays an incoming sale: "tap" emulates the NFC tag; "qr"
  // mints a payment link and shows its QR (scannable by any phone → app or web).
  // Settlement is detected the same way (the till balance) either way.
  mode: "tap" | "qr";
}) {
  const { session } = useAuth();
  const charge = useCharge();
  // Read the live mode inside pump() (a stable useCallback) without re-creating it.
  const modeRef = useRef(opts.mode);
  useEffect(() => {
    modeRef.current = opts.mode;
  });

  const [deviceId, setDeviceId] = useState<string | null>(null);
  const [terminalId, setTerminalId] = useState<string | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [connection, setConnection] = useState<ConnectionState>("disconnected");
  const [currentSale, setCurrentSale] = useState<SaleMessage | null>(null);
  const [lastResult, setLastResult] = useState<TerminalResult | null>(null);

  const socketRef = useRef<TerminalSocket | null>(null);
  const tokenRef = useRef<string | null>(null);
  const chargeRef = useRef(charge);
  // Keep the charge ref current for use inside socket callbacks / timers.
  useEffect(() => {
    chargeRef.current = charge;
  });
  // Sales received but not yet processed (FIFO), and the set of sessionIds we've
  // already accepted — so a redelivery (reconnect) is ACKed but not re-charged.
  const queueRef = useRef<SaleMessage[]>([]);
  const seenRef = useRef<Set<string>>(new Set());
  // The sale currently being fulfilled + when it started (for the digest lookup).
  const saleRef = useRef<{
    sessionId: string;
    startMs: number;
    tillId: string;
    amountMicros: number;
  } | null>(null);
  // Guards double-reporting: the sessionId we've already begun finalizing.
  const finalizingRef = useRef<string | null>(null);
  // The post-result reset timer, tracked so it can be cancelled on unmount.
  const resetTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    void getOrCreateDeviceId().then(setDeviceId);
    // Show any cached SHORT code instantly while (re-)registration runs. Guard on
    // the short-code format so a value cached by an older build (e.g. a long UUID)
    // is ignored rather than displayed until the backend assigns the real code.
    void loadTerminalId().then((id) => {
      if (id && /^[2-9A-HJ-NP-Z]{8}$/.test(id)) setTerminalId(id);
    });
  }, []);

  // Start the next queued sale if the terminal is idle (no sale in flight). We
  // ACK a sale only when we START it (not on receipt): a sale still queued when
  // the app is killed stays un-ACKed and is redelivered on the next reconnect,
  // rather than being lost.
  const pump = useCallback(() => {
    if (saleRef.current) return; // busy with a sale
    const next = queueRef.current.shift();
    if (!next) return;
    saleRef.current = {
      sessionId: next.sessionId,
      startMs: Date.now(),
      tillId: next.tillId,
      amountMicros: next.amountMicros,
    };
    setCurrentSale(next);
    socketRef.current?.send({ type: "ACK", sessionId: next.sessionId });
    if (modeRef.current === "qr") {
      // Mint a one-time payment link + show its QR; settlement into the till is
      // watched exactly as the tap flow (charge.status → "paid").
      void chargeRef.current.createLink(next.amountMicros, next.tillId);
    } else {
      void chargeRef.current.startCharge(next.amountMicros, next.tillId);
    }
  }, []);
  const pumpRef = useRef(pump);
  useEffect(() => {
    pumpRef.current = pump;
  });

  // A pushed SALE → buzz so the merchant notices, then queue it (de-duped so a
  // redelivery isn't charged twice). Sales are processed one at a time; extras
  // wait rather than being dropped.
  const onSale = useCallback((sale: SaleMessage) => {
    if (seenRef.current.has(sale.sessionId)) return; // redelivery — already queued/handled
    seenRef.current.add(sale.sessionId);
    void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    queueRef.current.push(sale);
    pumpRef.current();
  }, []);
  const onSaleRef = useRef(onSale);
  useEffect(() => {
    onSaleRef.current = onSale;
  });

  // Cancel the pending reset timer on unmount so it never fires post-unmount.
  useEffect(
    () => () => {
      if (resetTimerRef.current) clearTimeout(resetTimerRef.current);
    },
    [],
  );

  // Register the device (→ short terminal code + token) and open the socket
  // whenever the binding is ready.
  useEffect(() => {
    let cancelled = false;
    async function setup() {
      if (!opts.enabled || !deviceId || !opts.tillId || !opts.merchantId || !session?.address) {
        return;
      }
      try {
        const res = await registerTerminal({
          deviceId,
          sender: session.address,
          merchantId: opts.merchantId,
          tillId: opts.tillId,
          name: opts.merchantName || "Brisk terminal",
        });
        if (cancelled) return;
        tokenRef.current = res.token;
        setToken(res.token);
        setTerminalId(res.terminalId);
        await saveTerminalId(res.terminalId);
        await saveTerminalToken(res.token);
        const sock = new TerminalSocket(res.terminalId, res.token, {
          onSale: (s) => onSaleRef.current(s),
          onState: setConnection,
        });
        socketRef.current = sock;
        sock.start();
      } catch (e) {
        console.warn("[pos] terminal setup failed", e instanceof Error ? e.message : e);
      }
    }
    void setup();
    return () => {
      cancelled = true;
      socketRef.current?.stop();
      socketRef.current = null;
    };
  }, [opts.enabled, deviceId, opts.tillId, opts.merchantId, opts.merchantName, session?.address]);

  // When the charge resolves, report the outcome to the backend.
  useEffect(() => {
    const sale = saleRef.current;
    const tok = tokenRef.current;
    if (!sale || !tok) return;
    const status = charge.status;
    if (status !== "paid" && status !== "timeout" && status !== "error" && status !== "nfc_off") {
      return;
    }
    if (finalizingRef.current === sale.sessionId) return;
    finalizingRef.current = sale.sessionId;

    void (async () => {
      try {
        if (status === "paid") {
          const digest = await findIncomingDigest({
            till: sale.tillId,
            amountMicros: sale.amountMicros,
            sinceMs: sale.startMs,
          });
          if (digest) {
            await reportSaleResult(sale.sessionId, tok, { digest });
            setLastResult({ sessionId: sale.sessionId, ok: true, digest });
          } else {
            // Settlement was seen but we couldn't resolve the digest — fail the
            // session rather than report a fabricated one.
            console.warn("[pos] settled but no digest found", sale.sessionId);
            await reportSaleResult(sale.sessionId, tok, { state: "FAILED" });
            setLastResult({ sessionId: sale.sessionId, ok: false });
          }
        } else {
          await reportSaleResult(sale.sessionId, tok, {
            state: status === "timeout" ? "TIMEOUT" : "FAILED",
          });
          setLastResult({ sessionId: sale.sessionId, ok: false });
        }
      } catch (e) {
        console.warn("[pos] report result failed", e instanceof Error ? e.message : e);
      } finally {
        // Leave the result on screen briefly, then reset the charge to idle and
        // start the next queued sale (if any).
        setCurrentSale(null);
        resetTimerRef.current = setTimeout(() => {
          saleRef.current = null;
          finalizingRef.current = null;
          void chargeRef.current.cancel();
          pumpRef.current();
        }, 2_500);
      }
    })();
  }, [charge.status]);

  // Merchant tapped Cancel on the device: stop the charge and report the sale as
  // CANCELED so the ERP's poll returns state=FAILURE / sessionType=CANCEL (rather
  // than leaving it PROCESSING until the TTL times it out).
  const cancelSale = useCallback(async () => {
    const sale = saleRef.current;
    const tok = tokenRef.current;
    // Block the finalize effect from also reporting, and stop the NFC charge.
    if (sale) finalizingRef.current = sale.sessionId;
    if (resetTimerRef.current) clearTimeout(resetTimerRef.current);
    void chargeRef.current.cancel();
    saleRef.current = null;
    setCurrentSale(null);
    if (sale && tok) {
      try {
        await reportSaleResult(sale.sessionId, tok, { state: "CANCELED" });
      } catch (e) {
        console.warn("[pos] cancel report failed", e instanceof Error ? e.message : e);
      }
      setLastResult({ sessionId: sale.sessionId, ok: false });
    }
    finalizingRef.current = null;
    pumpRef.current(); // process the next queued sale, if any
  }, []);

  return {
    terminalId,
    token,
    connection,
    currentSale,
    chargeStatus: charge.status,
    chargeInvoice: charge.invoice,
    chargeLinkUrl: charge.linkUrl,
    chargeError: charge.error,
    lastResult,
    cancel: charge.cancel,
    cancelSale,
  };
}
