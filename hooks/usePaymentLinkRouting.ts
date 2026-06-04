import { useEffect, useRef } from "react";
import * as Linking from "expo-linking";
import { useRouter } from "expo-router";

import { parsePayDeepLink } from "@/services/blockchain/paymentTx";
import { useAuthStore } from "@/store/authStore";
import { usePendingPaymentStore, type PendingPayment } from "@/store/pendingPaymentStore";

/**
 * Capture incoming `brisk://pay?…` deep links (payment links) and route to the
 * one-tap confirm screen. Handles cold start (getInitialURL) and warm start
 * (url event). If the user isn't signed in yet, the pending payment is held and
 * resumes after auth — the root navigator sends them through /welcome first.
 *
 * Non-pay links (e.g. brisk://oauth, handled by expo-web-browser) are ignored.
 */
export function usePaymentLinkRouting() {
  const router = useRouter();
  const session = useAuthStore((s) => s.session);
  const hydrated = useAuthStore((s) => s.hydrated);
  const pending = usePendingPaymentStore((s) => s.pending);
  const setPending = usePendingPaymentStore((s) => s.setPending);
  const navigatedFor = useRef<PendingPayment | null>(null);

  // Capture links into the pending store.
  useEffect(() => {
    const handle = (url: string | null) => {
      if (!url) return;
      const parsed = parsePayDeepLink(url);
      if (parsed) setPending(parsed);
    };
    Linking.getInitialURL()
      .then(handle)
      .catch(() => {});
    const sub = Linking.addEventListener("url", (e) => handle(e.url));
    return () => sub.remove();
  }, [setPending]);

  // Once signed in and hydrated, open the confirm screen for the pending link.
  useEffect(() => {
    if (!hydrated || !pending || !session) return;
    if (navigatedFor.current === pending) return; // already routed this one
    navigatedFor.current = pending;
    router.push("/pay-link");
  }, [hydrated, pending, session, router]);
}
