import { useEffect, useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, Text, View } from "react-native";
import Animated, { FadeInDown } from "react-native-reanimated";
import { useRouter } from "expo-router";
import { Gift, Send, Share2 } from "lucide-react-native";

import { Screen } from "@/components/ui/Screen";
import { ListRow } from "@/components/ui/ListRow";
import { SectionLabel } from "@/components/ui/SectionLabel";
import { EmptyState } from "@/components/ui/EmptyState";
import { ErrorText } from "@/components/ui/ErrorText";
import { useGiftCards } from "@/hooks/useGiftCards";
import { useMerchantDirectory } from "@/hooks/useMerchantDirectory";
import { formatUsd } from "@/services/blockchain/paymentTx";
import { STAGGER_MS, ICON } from "@/theme/scale";
import { useTheme } from "@/hooks/useTheme";

function shortId(a: string): string {
  return a.length > 12 ? `${a.slice(0, 6)}…${a.slice(-4)}` : a;
}

// The customer's gift cards: cards they hold (redeemable + re-giftable) and links
// they can still hand out (issued / re-gifted but unclaimed).
export default function GiftCardsScreen() {
  const theme = useTheme();
  const router = useRouter();
  const { cards, shareable, loading, regift } = useGiftCards();
  const { nameFor, resolve } = useMerchantDirectory();
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    resolve([...cards.map((c) => c.merchantId), ...shareable.map((c) => c.merchantId)]);
  }, [cards, shareable, resolve]);

  const openLink = (url: string, faceValueMicros: number, merchantId: string) => {
    router.push(
      `/gift-link?url=${encodeURIComponent(url)}&amount=${faceValueMicros}&merchant=${encodeURIComponent(
        nameFor(merchantId) ?? "this merchant",
      )}`,
    );
  };

  const onRegift = async (c: {
    objectId: string;
    merchantId: string;
    claimCode: string;
    balanceMicros: number;
  }) => {
    setError(null);
    setBusyId(c.objectId);
    try {
      const { url } = await regift({
        objectId: c.objectId,
        merchantId: c.merchantId,
        claimCode: c.claimCode,
        faceValueMicros: c.balanceMicros,
      });
      openLink(url, c.balanceMicros, c.merchantId);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't re-gift this card");
    } finally {
      setBusyId(null);
    }
  };

  const empty = !loading && cards.length === 0 && shareable.length === 0;

  return (
    <Screen title="My gift cards" onClose={() => router.back()}>
      {/* Buy a gift card (opens the merchant picker). */}
      <ListRow
        icon={Gift}
        title="Buy a gift card"
        onPress={() => router.push("/buy-gift-card")}
        trailing={<Text className="text-base font-inter-semibold text-brisk-accent">＋</Text>}
      />

      <ErrorText className="mt-3">{error}</ErrorText>

      {loading ? (
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator color={theme.accent} />
        </View>
      ) : empty ? (
        <EmptyState
          icon={Gift}
          subtitle="No gift cards yet. When a friend sends you one, tap their link to add it here."
        />
      ) : (
        <ScrollView
          contentContainerStyle={{ paddingBottom: 40 }}
          showsVerticalScrollIndicator={false}
        >
          {/* Cards you hold — redeemable at the merchant, and re-giftable. */}
          {cards.length > 0 ? <SectionLabel className="mb-1 mt-5">Your cards</SectionLabel> : null}
          {cards.map((c, i) => (
            <Animated.View
              key={c.objectId}
              entering={FadeInDown.duration(400).delay(Math.min(i, 8) * STAGGER_MS)}
              className="mt-3"
            >
              <ListRow
                icon={Gift}
                title={nameFor(c.merchantId) ?? shortId(c.merchantId)}
                subtitle={`Gift card · of ${formatUsd(c.faceValueMicros)}`}
                value={formatUsd(c.balanceMicros)}
                valueClassName="text-brisk-accent"
              >
                {/* Re-gift: pass it on to someone else with a fresh link. */}
                <Pressable
                  onPress={() => void onRegift(c)}
                  disabled={busyId === c.objectId}
                  className="mt-3 flex-row items-center justify-center rounded-2xl border border-brisk-borderStrong bg-brisk-bg1/70 px-4 py-3"
                  accessibilityRole="button"
                  accessibilityLabel={`Re-gift this ${nameFor(c.merchantId) ?? ""} card`}
                >
                  {busyId === c.objectId ? (
                    <ActivityIndicator size="small" color={theme.accent} />
                  ) : (
                    <>
                      <Send color={theme.accent} size={ICON.inlineAction} />
                      <Text className="ml-2 text-sm font-inter-semibold text-brisk-accent">
                        Send to someone else
                      </Text>
                    </>
                  )}
                </Pressable>
              </ListRow>
            </Animated.View>
          ))}

          {/* Links you've sent that nobody has claimed yet — re-share anytime. */}
          {shareable.length > 0 ? (
            <SectionLabel className="mb-1 mt-7">Sent · awaiting claim</SectionLabel>
          ) : null}
          {shareable.map((c, i) => (
            <Animated.View
              key={c.objectId}
              entering={FadeInDown.duration(400).delay(Math.min(i, 8) * STAGGER_MS)}
              className="mt-3"
            >
              <ListRow
                icon={Share2}
                title={nameFor(c.merchantId) ?? shortId(c.merchantId)}
                subtitle={`${formatUsd(c.faceValueMicros)} · tap to share the link`}
                onPress={() => openLink(c.url, c.faceValueMicros, c.merchantId)}
                trailing={
                  <Text className="text-xs font-inter-semibold text-brisk-accent">Share</Text>
                }
              />
            </Animated.View>
          ))}

          {cards.length > 0 ? (
            <Text className="mt-5 text-center text-xs text-brisk-subtext">
              Gift-card credit is applied automatically when you pay the merchant.
            </Text>
          ) : null}
        </ScrollView>
      )}
    </Screen>
  );
}
