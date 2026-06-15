import { useCallback, useEffect, useRef, useState } from "react";
import { ActivityIndicator, Pressable, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import Animated, { FadeIn } from "react-native-reanimated";
import { useRouter } from "expo-router";
import { Gift, Link2 as LinkIcon, XCircle } from "lucide-react-native";

import { PrimaryButton } from "@/components/ui/PrimaryButton";
import { HeroAmount } from "@/components/ui/HeroAmount";
import { SuccessSheet } from "@/components/ui/SuccessSheet";
import { AuroraBackground } from "@/components/ui/AuroraBackground";
import { PulseRing } from "@/components/ui/PulseRing";
import { useAuth } from "@/hooks/useAuth";
import { payInvoice, type PayResult } from "@/services/blockchain/payments";
import { ensureSpendable } from "@/services/blockchain/coverFromSave";
import { formatUsd, type Invoice } from "@/services/blockchain/paymentTx";
import { markPaymentLinkPaid, resolvePaymentLink } from "@/services/api/backendApi";
import { redeemGiftCard } from "@/services/blockchain/giftCard";
import { usePayDiscounts } from "@/hooks/usePayDiscounts";
import { usePendingPaymentStore } from "@/store/pendingPaymentStore";
import { hapticError } from "@/utils/haptics";
import { useTheme } from "@/hooks/useTheme";

type Status =
  | "resolving"
  | "review"
  | "paying"
  | "done"
  | "expired"
  | "canceled"
  | "consumed"
  | "notfound"
  | "error";

// One-tap confirm screen for an incoming payment link (brisk://pay?code=… or a
// self-contained invoice). Resolves the code via the backend, then reuses the
// Pay screen's review → settle → done flow. On success it reports settlement so
// the merchant's link shows as paid.
export default function PayLinkScreen() {
  const theme = useTheme();
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

  // Gift-card credit available for this merchant.
  const disc = usePayDiscounts(invoice?.merchantId, invoice?.amountMicros ?? 0);

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
    if (pending.kind !== "code") return; // claim links route to /claim, not here
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
        // Single-use links that are already paid can't be paid again.
        if (link.status === "paid" && !link.reusable) {
          setStatus("consumed");
          return;
        }
        setAlreadyPaid(link.status === "paid");
        setStatus("review");
      })
      .catch((e: unknown) => {
        if (!active) return;
        const msg = e instanceof Error ? e.message : "";
        if (/expired/i.test(msg)) setStatus("expired");
        else if (/canceled/i.test(msg)) setStatus("canceled");
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
    const plan = disc.buildDiscountPlan();
    const merchantId = invoice.merchantId;
    setError(null);
    setStatus("paying");
    try {
      let digest = "";
      // 1) Draw down the gift-card promise on-chain (if applied). No funds move
      //    here — the merchant was already prepaid when the card was issued.
      if (plan.card && plan.giftAppliedMicros > 0) {
        digest = await redeemGiftCard(session, {
          cardId: plan.card.objectId,
          merchantId,
          amountMicros: plan.giftAppliedMicros,
        });
      }
      // 2) Settle any remaining cash to the till.
      if (plan.payableMicros > 0) {
        if ((await ensureSpendable(session, plan.payableMicros)) === "cancelled") {
          setStatus("review");
          return;
        }
        const res = await payInvoice(session, { ...invoice, amountMicros: plan.payableMicros });
        setResult(res);
        digest = res.digest;
      } else {
        // Fully covered by the prepaid gift card — nothing left to settle.
        setResult({
          digest: digest || `gift-${Date.now()}`,
          method: "gasless",
          receiptIssued: false,
        });
      }
      setStatus("done");
      // Best-effort: tell the backend so the merchant's link shows as paid.
      if (codeRef.current) {
        void markPaymentLinkPaid(codeRef.current, digest || `gift-${Date.now()}`).catch(() => {});
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Payment failed");
      setStatus("error");
      void hapticError();
    }
  }, [session, invoice, disc]);

  return (
    <View className="flex-1 bg-brisk-bg0">
      <AuroraBackground>
        <SafeAreaView edges={["top", "bottom"]} className="flex-1 px-5 pt-10">
          <View className="flex-1 items-center justify-center">
            {status === "resolving" ? (
              <Animated.View entering={FadeIn.duration(300)} className="items-center">
                <PulseRing size={64}>
                  <LinkIcon color={theme.accent} size={56} />
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
                <HeroAmount
                  micros={invoice.amountMicros}
                  tier="focused"
                  countUp={false}
                  className="mt-2"
                />
                <Text className="mt-2 text-base text-brisk-subtext">to {invoice.merchant}</Text>
                {alreadyPaid ? (
                  <Text className="mt-3 text-center text-xs text-brisk-subtext">
                    This request was already marked paid. Paying again will send another payment.
                  </Text>
                ) : null}

                {/* Gift-card credit for this merchant. */}
                {disc.hasAnyDiscount ? (
                  <View className="mt-6 w-full">
                    <Pressable
                      onPress={() => disc.setApplyGift(!disc.applyGift)}
                      className={`flex-row items-center justify-between rounded-2xl border px-4 py-3 ${
                        disc.applyGift
                          ? "border-brisk-accent bg-brisk-accent/10"
                          : "border-brisk-border bg-brisk-bg1/60"
                      }`}
                      accessibilityRole="switch"
                      accessibilityState={{ checked: disc.applyGift }}
                    >
                      <View className="flex-row items-center">
                        <Gift color={theme.accent} size={18} />
                        <Text className="ml-2 text-sm text-brisk-text">Gift card credit</Text>
                      </View>
                      <Text
                        className={`text-sm font-inter-semibold ${disc.applyGift ? "text-brisk-accent" : "text-brisk-subtext"}`}
                      >
                        {disc.applyGift
                          ? `−${formatUsd(disc.giftAppliedMicros)}`
                          : formatUsd(disc.giftAvailable)}
                      </Text>
                    </Pressable>
                    {disc.giftAppliedMicros > 0 ? (
                      <View className="mt-3 flex-row items-center justify-between border-t border-brisk-border pt-3">
                        <Text className="text-sm text-brisk-subtext">You pay</Text>
                        <Text className="text-lg font-inter-bold text-brisk-text">
                          {formatUsd(disc.payableMicros)}
                        </Text>
                      </View>
                    ) : null}
                  </View>
                ) : null}

                <View className="mt-8 w-full">
                  <PrimaryButton
                    label={
                      disc.payableMicros === 0
                        ? "Confirm — covered by gift card"
                        : disc.giftAppliedMicros > 0
                          ? `Pay ${formatUsd(disc.payableMicros)}`
                          : "Confirm & Pay"
                    }
                    onPress={() => void confirmAndPay()}
                  />
                  <Pressable className="mt-3 py-3" onPress={close}>
                    <Text className="text-center text-sm text-brisk-subtext">Cancel</Text>
                  </Pressable>
                </View>
              </Animated.View>
            ) : null}

            {status === "paying" ? (
              <Animated.View entering={FadeIn.duration(300)} className="items-center">
                <ActivityIndicator color={theme.accent} size="large" />
                <Text className="mt-4 text-sm text-brisk-subtext">Settling on Sui…</Text>
              </Animated.View>
            ) : null}

            {status === "done" && result && invoice ? (
              <SuccessSheet
                amountMicros={invoice.amountMicros}
                subtitle={`to ${invoice.merchant}`}
                caption={
                  result.receiptIssued
                    ? "Settled on Sui in seconds — on-chain receipt minted, zero gas."
                    : "Settled on Sui in seconds — zero gas."
                }
                footer={
                  <>
                    <PrimaryButton label="Done" onPress={close} />
                    <Pressable
                      className="mt-3 py-3"
                      onPress={() => {
                        clearPending();
                        router.replace(
                          `/buy-gift-card?merchantId=${encodeURIComponent(invoice.merchantId)}&name=${encodeURIComponent(invoice.merchant)}`,
                        );
                      }}
                    >
                      <Text className="text-center text-sm font-inter-semibold text-brisk-accent">
                        🎁 Buy a gift card for {invoice.merchant}
                      </Text>
                    </Pressable>
                  </>
                }
              />
            ) : null}

            {status === "expired" ||
            status === "notfound" ||
            status === "canceled" ||
            status === "consumed" ? (
              <Animated.View entering={FadeIn.duration(300)} className="items-center">
                <XCircle color={theme.subtext} size={64} />
                <Text className="mt-4 text-lg font-inter-semibold text-brisk-text">
                  {status === "expired"
                    ? "This link has expired"
                    : status === "canceled"
                      ? "This link was canceled"
                      : status === "consumed"
                        ? "This link is already paid"
                        : "Link not found"}
                </Text>
                <Text className="mt-1 text-center text-sm text-brisk-subtext">
                  {status === "consumed"
                    ? "This was a one-time payment link and has already been used."
                    : "Ask the merchant to send you a fresh payment link."}
                </Text>
                <View className="mt-8 w-full max-w-[360px]">
                  <PrimaryButton label="Close" onPress={close} />
                </View>
              </Animated.View>
            ) : null}

            {status === "error" ? (
              <Animated.View entering={FadeIn.duration(300)} className="items-center">
                <XCircle color={theme.danger} size={64} />
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
