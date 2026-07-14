import { useCallback, useEffect, useRef, useState } from "react";
import { Pressable, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import Animated, { FadeIn } from "react-native-reanimated";
import { useRouter } from "expo-router";
import { Gift, Link2 as LinkIcon, XCircle } from "lucide-react-native";

import { PrimaryButton } from "@/components/ui/PrimaryButton";
import { AuroraBackground } from "@/components/ui/AuroraBackground";
import { PulseRing } from "@/components/ui/PulseRing";
import { PayConfirm } from "@/components/pay/PayConfirm";
import { useAuth } from "@/hooks/useAuth";
import { usePayFlow, type SettleOutcome } from "@/hooks/usePayFlow";
import { payInvoice, type PayResult } from "@/services/blockchain/payments";
import { ensureSpendable } from "@/services/blockchain/coverFromSave";
import { formatUsd, type Invoice } from "@/services/blockchain/paymentTx";
import { markPaymentLinkPaid, resolvePaymentLink } from "@/services/api/backendApi";
import { redeemGiftCard } from "@/services/blockchain/giftCard";
import { usePayDiscounts } from "@/hooks/usePayDiscounts";
import { usePendingPaymentStore } from "@/store/pendingPaymentStore";
import { useTheme } from "@/hooks/useTheme";

// Head/terminal statuses only — the review → settle → done/error tail is the
// shared usePayFlow / PayConfirm.
type Status = "resolving" | "review" | "expired" | "canceled" | "consumed" | "notfound";

// One-tap confirm screen for an incoming payment link (brisk://pay?code=… or a
// self-contained invoice). Resolves the code via the backend, then hands off to
// the shared pay tail. On success it reports settlement so the merchant's link
// shows as paid.
export default function PayLinkScreen() {
  const theme = useTheme();
  const router = useRouter();
  const { session } = useAuth();
  const flow = usePayFlow();
  const clearPending = usePendingPaymentStore((s) => s.clear);
  // Capture the pending payment once at mount; it doesn't change while we're up.
  const [pending] = useState(() => usePendingPaymentStore.getState().pending);

  const [status, setStatus] = useState<Status>(
    pending?.kind === "invoice" ? "review" : "resolving",
  );
  const [invoice, setInvoice] = useState<Invoice | null>(
    pending?.kind === "invoice" ? pending.invoice : null,
  );
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
          setStatus("notfound");
        }
      });
    return () => {
      active = false;
    };
  }, [pending, router]);

  // Confirm & settle: draw down the gift-card promise (if applied), then settle
  // any remaining cash. Runs through the shared usePayFlow tail.
  const onConfirm = useCallback(() => {
    if (!session || !invoice) return;
    const plan = disc.buildDiscountPlan();
    // A resolved payment link always carries a merchant id.
    const merchantId = invoice.merchantId ?? "";
    void flow.confirm({
      settle: async (): Promise<SettleOutcome> => {
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
            return "cancelled";
          }
          return payInvoice(session, { ...invoice, amountMicros: plan.payableMicros });
        }
        // Fully covered by the prepaid gift card — nothing left to settle.
        const giftResult: PayResult = {
          digest: digest || `gift-${Date.now()}`,
          method: "gasless",
          receiptIssued: false,
        };
        return giftResult;
      },
      // Best-effort: tell the backend so the merchant's link shows as paid.
      onSettled: (res) => {
        if (codeRef.current) {
          void markPaymentLinkPaid(codeRef.current, res.digest).catch(() => {});
        }
      },
    });
  }, [session, invoice, disc, flow]);

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
              <PayConfirm
                state={flow.state}
                amountMicros={invoice.amountMicros}
                eyebrow="Pay"
                payeeLabel={`to ${invoice.merchant}`}
                reviewNote={
                  alreadyPaid ? (
                    <Text className="mt-3 text-center text-xs text-brisk-subtext">
                      This request was already marked paid. Paying again will send another payment.
                    </Text>
                  ) : null
                }
                reviewSlot={
                  disc.hasAnyDiscount ? (
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
                          className={`text-sm font-inter-semibold ${
                            disc.applyGift ? "text-brisk-accent" : "text-brisk-subtext"
                          }`}
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
                  ) : null
                }
                confirmLabel={
                  disc.payableMicros === 0
                    ? "Confirm — covered by gift card"
                    : disc.giftAppliedMicros > 0
                      ? `Pay ${formatUsd(disc.payableMicros)}`
                      : "Confirm & Pay"
                }
                onConfirm={onConfirm}
                onCancel={close}
                success={{
                  subtitle: `to ${invoice.merchant}`,
                  caption: flow.result?.receiptIssued
                    ? "Settled on Sui in seconds — on-chain receipt minted, zero gas."
                    : "Settled on Sui in seconds — zero gas.",
                  footer: (
                    <>
                      <PrimaryButton label="Done" onPress={close} />
                      <Pressable
                        className="mt-3 py-3"
                        onPress={() => {
                          clearPending();
                          router.replace(
                            `/buy-gift-card?merchantId=${encodeURIComponent(
                              invoice.merchantId ?? "",
                            )}&name=${encodeURIComponent(invoice.merchant)}`,
                          );
                        }}
                      >
                        <Text className="text-center text-sm font-inter-semibold text-brisk-accent">
                          🎁 Buy a gift card for {invoice.merchant}
                        </Text>
                      </Pressable>
                    </>
                  ),
                }}
                errorMessage={flow.error}
                errorHint="Nothing was charged — you can try again."
                onRetry={onConfirm}
                onErrorClose={close}
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
                    : error || "Ask the merchant to send you a fresh payment link."}
                </Text>
                <View className="mt-8 w-full max-w-[360px]">
                  <PrimaryButton label="Close" onPress={close} />
                </View>
              </Animated.View>
            ) : null}
          </View>
        </SafeAreaView>
      </AuroraBackground>
    </View>
  );
}
