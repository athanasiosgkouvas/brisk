import { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, Pressable, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import Animated, { FadeIn } from "react-native-reanimated";
import { useRouter } from "expo-router";
import { Gift, XCircle } from "lucide-react-native";

import { PrimaryButton } from "@/components/ui/PrimaryButton";
import { HeroAmount } from "@/components/ui/HeroAmount";
import { SuccessSheet } from "@/components/ui/SuccessSheet";
import { AuroraBackground } from "@/components/ui/AuroraBackground";
import { PulseRing } from "@/components/ui/PulseRing";
import { useAuth } from "@/hooks/useAuth";
import { useGiftCards } from "@/hooks/useGiftCards";
import { useMerchantDirectory } from "@/hooks/useMerchantDirectory";
import { readGiftCard } from "@/services/blockchain/giftCard";
import { usePendingPaymentStore } from "@/store/pendingPaymentStore";
import { useTheme } from "@/hooks/useTheme";

type Status = "resolving" | "review" | "claiming" | "done" | "error";

function shortId(a: string): string {
  return a.length > 12 ? `${a.slice(0, 6)}…${a.slice(-4)}` : a;
}

// Gift-card claim screen (deep-linked via brisk://claim?card=…&code=…&s=…).
// Reads the on-chain card for display, then binds it to the recipient.
export default function ClaimScreen() {
  const theme = useTheme();
  const router = useRouter();
  const { session } = useAuth();
  const { claim } = useGiftCards();
  const { nameFor, resolve } = useMerchantDirectory();
  const clearPending = usePendingPaymentStore((s) => s.clear);
  const [pending] = useState(() => usePendingPaymentStore.getState().pending);

  const claimInfo = pending?.kind === "claim" ? pending : null;
  const [status, setStatus] = useState<Status>("resolving");
  const [balanceMicros, setBalanceMicros] = useState(0);
  const [merchantId, setMerchantId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const close = useCallback(() => {
    clearPending();
    if (router.canGoBack()) router.back();
    else router.replace("/");
  }, [clearPending, router]);

  useEffect(() => {
    let active = true;
    if (!claimInfo) {
      router.replace("/");
      return;
    }
    readGiftCard(claimInfo.cardId)
      .then((c) => {
        if (!active) return;
        if (!c) {
          setError("Couldn't load this gift card.");
          setStatus("error");
          return;
        }
        setBalanceMicros(c.balanceMicros);
        setMerchantId(c.merchantId);
        resolve([c.merchantId]);
        setStatus("review");
      })
      .catch(() => {
        if (!active) return;
        setError("Couldn't load this gift card.");
        setStatus("error");
      });
    return () => {
      active = false;
    };
  }, [claimInfo, router, resolve]);

  const onClaim = useCallback(async () => {
    if (!session || !claimInfo) return;
    if (!claimInfo.secret) {
      setError("This gift link is missing its claim code.");
      setStatus("error");
      return;
    }
    setError(null);
    setStatus("claiming");
    try {
      await claim({ cardId: claimInfo.cardId, code: claimInfo.code, secretHex: claimInfo.secret });
      setStatus("done");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't claim this gift card.");
      setStatus("error");
    }
  }, [session, claimInfo, claim]);

  const issuer = merchantId ? (nameFor(merchantId) ?? shortId(merchantId)) : "a Brisk merchant";

  return (
    <View className="flex-1 bg-brisk-bg0">
      <AuroraBackground>
        <SafeAreaView edges={["top", "bottom"]} className="flex-1 px-5 pt-10">
          <View className="flex-1 items-center justify-center">
            {status === "resolving" ? (
              <Animated.View entering={FadeIn.duration(300)} className="items-center">
                <PulseRing size={64}>
                  <Gift color={theme.accent} size={56} />
                </PulseRing>
                <Text className="mt-6 text-sm text-brisk-subtext">Loading your gift…</Text>
              </Animated.View>
            ) : null}

            {status === "review" ? (
              <Animated.View
                entering={FadeIn.duration(300)}
                className="w-full max-w-[360px] items-center"
              >
                <Gift color={theme.accent} size={48} />
                <Text className="mt-4 text-sm uppercase tracking-[2px] text-brisk-subtext">
                  Gift card
                </Text>
                <HeroAmount
                  micros={balanceMicros}
                  tier="focused"
                  countUp={false}
                  className="mt-2"
                />
                <Text className="mt-2 text-base text-brisk-subtext">at {issuer}</Text>
                <View className="mt-8 w-full">
                  <PrimaryButton label="Add to my account" onPress={() => void onClaim()} />
                  <Pressable className="mt-3 py-3" onPress={close}>
                    <Text className="text-center text-sm text-brisk-subtext">Not now</Text>
                  </Pressable>
                </View>
              </Animated.View>
            ) : null}

            {status === "claiming" ? (
              <Animated.View entering={FadeIn.duration(300)} className="items-center">
                <ActivityIndicator color={theme.accent} size="large" />
                <Text className="mt-4 text-sm text-brisk-subtext">Adding to your account…</Text>
              </Animated.View>
            ) : null}

            {status === "done" ? (
              <SuccessSheet
                amountMicros={balanceMicros}
                title="Added"
                subtitle={`at ${issuer}`}
                caption="Use it when you pay this merchant."
                footer={
                  <>
                    <PrimaryButton
                      label="View my gift cards"
                      onPress={() => {
                        clearPending();
                        router.replace("/gift-cards");
                      }}
                    />
                    <Pressable className="mt-3 py-3" onPress={close}>
                      <Text className="text-center text-sm text-brisk-subtext">Done</Text>
                    </Pressable>
                  </>
                }
              />
            ) : null}

            {status === "error" ? (
              <Animated.View entering={FadeIn.duration(300)} className="items-center">
                <XCircle color={theme.danger} size={64} />
                <Text className="mt-4 text-lg font-inter-semibold text-brisk-text">
                  Couldn&apos;t add this gift card
                </Text>
                <Text className="mt-1 text-center text-sm text-brisk-subtext">{error}</Text>
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
