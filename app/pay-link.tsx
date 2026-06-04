import { useCallback, useEffect, useRef, useState } from "react";
import { ActivityIndicator, Pressable, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import Animated, { FadeIn } from "react-native-reanimated";
import { useRouter } from "expo-router";
import { Link2 as LinkIcon, XCircle } from "lucide-react-native";

import { PrimaryButton } from "@/components/ui/PrimaryButton";
import { AnimatedCheck } from "@/components/ui/AnimatedCheck";
import { AuroraText } from "@/components/ui/AuroraText";
import { AuroraBackground } from "@/components/ui/AuroraBackground";
import { PulseRing } from "@/components/ui/PulseRing";
import { useAuth } from "@/hooks/useAuth";
import { useCountUp } from "@/hooks/useCountUp";
import { payInvoice, type PayResult } from "@/services/blockchain/payments";
import { formatUsd, type Invoice } from "@/services/blockchain/paymentTx";
import { markPaymentLinkPaid, resolvePaymentLink } from "@/services/api/backendApi";
import { usePendingPaymentStore } from "@/store/pendingPaymentStore";
import { hapticError, hapticTxSuccess } from "@/utils/haptics";
import { BRISK } from "@/theme/tokens";

type Status = "resolving" | "review" | "paying" | "done" | "expired" | "notfound" | "error";

// One-tap confirm screen for an incoming payment link (brisk://pay?code=… or a
// self-contained invoice). Resolves the code via the backend, then reuses the
// Pay screen's review → settle → done flow. On success it reports settlement so
// the merchant's link shows as paid.
export default function PayLinkScreen() {
  const router = useRouter();
  const { session } = useAuth();
  const clearPending = usePendingPaymentStore((s) => s.clear);
  // Capture the pending payment once at mount; it doesn't change while we're up.
  const [pending] = useState(() => usePendingPaymentStore.getState().pending);

  const [status, setStatus] = useState<Status>(
    pending?.kind === "invoice" ? "review" : "resolving",
  );
  const [invoice, setInvoice] = useState<Invoice | null>(
    pending?.kind === "invoice" ? pending.invoice : null,
  );
  const [result, setResult] = useState<PayResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [alreadyPaid, setAlreadyPaid] = useState(false);
  const codeRef = useRef<string | null>(null);
  const paidShown = useCountUp(status === "done" && invoice ? invoice.amountMicros : 0, 700);

  const close = useCallback(() => {
    clearPending();
    if (router.canGoBack()) router.back();
    else router.replace("/");
  }, [clearPending, router]);

  // Resolve a pending short-code link into a payable invoice (the self-contained
  // invoice case is already seeded into state above).
  useEffect(() => {
    let active = true;
    if (!pending) {
      // Nothing to pay (e.g. opened directly) — bail back to the wallet.
      router.replace("/");
      return;
    }
    if (pending.kind === "invoice") return;
    codeRef.current = pending.code;
    resolvePaymentLink(pending.code)
      .then((link) => {
        if (!active) return;
        setInvoice({
          payee: link.payee,
          merchantId: link.merchantId,
          amountMicros: link.amountMicros,
          invoiceId: link.invoiceId,
          merchant: link.merchant,
        });
        setAlreadyPaid(link.status === "paid");
        setStatus("review");
      })
      .catch((e: unknown) => {
        if (!active) return;
        const msg = e instanceof Error ? e.message : "";
        if (/expired/i.test(msg)) setStatus("expired");
        else if (/not found/i.test(msg)) setStatus("notfound");
        else {
          setError(msg || "Couldn't load this payment link.");
          setStatus("error");
        }
      });
    return () => {
      active = false;
    };
  }, [pending, router]);

  const confirmAndPay = useCallback(async () => {
    if (!session || !invoice) return;
    setError(null);
    setStatus("paying");
    try {
      const res = await payInvoice(session, invoice);
      setResult(res);
      setStatus("done");
      void hapticTxSuccess();
      // Best-effort: tell the backend so the merchant's link shows as paid.
      if (codeRef.current) void markPaymentLinkPaid(codeRef.current, res.digest).catch(() => {});
    } catch (e) {
      setError(e instanceof Error ? e.message : "Payment failed");
      setStatus("error");
      void hapticError();
    }
  }, [session, invoice]);

  return (
    <View className="flex-1 bg-brisk-bg0">
      <AuroraBackground>
        <SafeAreaView edges={["top", "bottom"]} className="flex-1 px-5 pt-10">
          <View className="flex-1 items-center justify-center">
            {status === "resolving" ? (
              <Animated.View entering={FadeIn.duration(300)} className="items-center">
                <PulseRing size={64}>
                  <LinkIcon color={BRISK.accent} size={56} />
                </PulseRing>
                <Text className="mt-6 text-sm text-brisk-subtext">Loading payment request…</Text>
              </Animated.View>
            ) : null}

            {status === "review" && invoice ? (
              <Animated.View
                entering={FadeIn.duration(300)}
                className="w-full max-w-[360px] items-center"
              >
                <Text className="text-sm uppercase tracking-[2px] text-brisk-subtext">Pay</Text>
                <AuroraText className="mt-2 text-5xl font-inter-extrabold">
                  {formatUsd(invoice.amountMicros)}
                </AuroraText>
                <Text className="mt-2 text-base text-brisk-subtext">to {invoice.merchant}</Text>
                {alreadyPaid ? (
                  <Text className="mt-3 text-center text-xs text-brisk-subtext">
                    This request was already marked paid. Paying again will send another payment.
                  </Text>
                ) : null}
                <View className="mt-8 w-full">
                  <PrimaryButton label="Confirm & Pay" onPress={() => void confirmAndPay()} />
                  <Pressable className="mt-3 py-3" onPress={close}>
                    <Text className="text-center text-sm text-brisk-subtext">Cancel</Text>
                  </Pressable>
                </View>
              </Animated.View>
            ) : null}

            {status === "paying" ? (
              <Animated.View entering={FadeIn.duration(300)} className="items-center">
                <ActivityIndicator color={BRISK.accent} size="large" />
                <Text className="mt-4 text-sm text-brisk-subtext">Settling on Sui…</Text>
              </Animated.View>
            ) : null}

            {status === "done" && result && invoice ? (
              <Animated.View entering={FadeIn.duration(300)} className="items-center">
                <AnimatedCheck size={72} />
                <Text className="mt-5 text-2xl font-inter-bold text-brisk-text">Paid</Text>
                <AuroraText className="mt-1 text-3xl font-inter-extrabold">
                  {formatUsd(Math.round(paidShown))}
                </AuroraText>
                <Text className="mt-1 text-base text-brisk-subtext">to {invoice.merchant}</Text>
                <Text className="mt-2 text-center text-xs text-brisk-subtext">
                  {result.receiptIssued
                    ? "Settled on Sui in seconds — on-chain receipt minted, zero gas."
                    : "Settled on Sui in seconds — zero gas."}
                </Text>
                <View className="mt-8 w-full max-w-[360px]">
                  <PrimaryButton label="Done" onPress={close} />
                </View>
              </Animated.View>
            ) : null}

            {status === "expired" || status === "notfound" ? (
              <Animated.View entering={FadeIn.duration(300)} className="items-center">
                <XCircle color={BRISK.subtext} size={64} />
                <Text className="mt-4 text-lg font-inter-semibold text-brisk-text">
                  {status === "expired" ? "This link has expired" : "Link not found"}
                </Text>
                <Text className="mt-1 text-center text-sm text-brisk-subtext">
                  Ask the merchant to send you a fresh payment link.
                </Text>
                <View className="mt-8 w-full max-w-[360px]">
                  <PrimaryButton label="Close" onPress={close} />
                </View>
              </Animated.View>
            ) : null}

            {status === "error" ? (
              <Animated.View entering={FadeIn.duration(300)} className="items-center">
                <XCircle color={BRISK.danger} size={64} />
                <Text className="mt-4 text-lg font-inter-semibold text-brisk-text">
                  That didn&apos;t go through
                </Text>
                <Text className="mt-1 text-center text-sm text-brisk-subtext">{error}</Text>
                <Text className="mt-1 text-center text-xs text-brisk-subtext">
                  Nothing was charged — you can try again.
                </Text>
                <View className="mt-8 w-full max-w-[360px]">
                  <PrimaryButton
                    label="Try again"
                    onPress={() => (invoice ? void confirmAndPay() : close())}
                  />
                  <Pressable className="mt-3 py-3" onPress={close}>
                    <Text className="text-center text-sm text-brisk-subtext">Close</Text>
                  </Pressable>
                </View>
              </Animated.View>
            ) : null}
          </View>
        </SafeAreaView>
      </AuroraBackground>
    </View>
  );
}
