import { useState } from "react";
import { Pressable, Share, Text, TextInput, View } from "react-native";
import Animated, { FadeInDown } from "react-native-reanimated";
import { useRouter } from "expo-router";
import { Check, Gift, Pencil, Share2 } from "lucide-react-native";

import { Screen } from "@/components/ui/Screen";
import { SectionLabel } from "@/components/ui/SectionLabel";
import { GlassCard } from "@/components/ui/GlassCard";
import { useMerchantProfile } from "@/hooks/useMerchantProfile";
import { BRISK_REVENUE, ENV } from "@/utils/constants";
import { ICON } from "@/theme/scale";
import { useTheme } from "@/hooks/useTheme";

// Pro "Business" hub: identity + gift-card info + protocol-fee transparency.
// Reached from the dashboard.
export default function BusinessScreen() {
  const theme = useTheme();
  const router = useRouter();
  const { name, merchantId, rename } = useMerchantProfile();

  const [editingName, setEditingName] = useState(false);
  const [nameDraft, setNameDraft] = useState("");

  const commitRename = async () => {
    const next = nameDraft.trim();
    if (next.length >= 2) await rename(next).catch(() => undefined);
    setEditingName(false);
  };

  const shareGiftCardLink = async () => {
    if (!merchantId) return;
    const url = `${ENV.backendUrl}/gc/${merchantId}`;
    await Share.share({
      message: `Buy a gift card for ${name ?? "my business"} on Brisk: ${url}`,
    }).catch(() => {});
  };

  return (
    <Screen title="Business" onClose={() => router.back()} scroll bottomInset={48}>
      {/* Identity */}
      <Animated.View entering={FadeInDown.duration(400).springify()}>
        <SectionLabel className="mb-2 mt-2">Business name</SectionLabel>
        <GlassCard className="flex-row items-center px-4 py-4" blur={false}>
          {editingName ? (
            <>
              <TextInput
                className="flex-1 text-base font-inter-semibold text-brisk-text"
                style={{ padding: 0 }}
                value={nameDraft}
                onChangeText={setNameDraft}
                autoFocus
                maxLength={40}
                placeholder="Business name"
                placeholderTextColor={theme.placeholder}
                onSubmitEditing={() => void commitRename()}
              />
              <Pressable onPress={() => void commitRename()} hitSlop={10}>
                <Check color={theme.accent} size={ICON.inlineAction} />
              </Pressable>
            </>
          ) : (
            <>
              <Text className="flex-1 text-base font-inter-semibold text-brisk-text">
                {name ?? "Your business"}
              </Text>
              <Pressable
                onPress={() => {
                  setNameDraft(name ?? "");
                  setEditingName(true);
                }}
                hitSlop={10}
                accessibilityLabel="Rename business"
              >
                <Pencil color={theme.subtext} size={ICON.inlineAction} />
              </Pressable>
            </>
          )}
        </GlassCard>
      </Animated.View>

      {/* Gift cards (informational — customer-initiated, on-chain) */}
      <Animated.View entering={FadeInDown.duration(400).delay(80).springify()}>
        <SectionLabel className="mb-2 mt-6">Gift cards</SectionLabel>
        <GlassCard className="px-4 py-4" blur={false}>
          <View className="flex-row items-center">
            <Gift color={theme.accent} size={ICON.row} />
            <Text className="ml-3 flex-1 text-sm text-brisk-subtext">
              Customers can buy gift cards for your business and you&apos;re paid right away — the
              full sale, minus Brisk&apos;s fee, lands in your treasury at purchase. Recipients
              later redeem the card toward what they buy.
            </Text>
          </View>
          <Pressable
            onPress={() => void shareGiftCardLink()}
            className="mt-3 flex-row items-center justify-center rounded-2xl border border-brisk-borderStrong bg-brisk-bg1/70 px-4 py-3"
            accessibilityRole="button"
            accessibilityLabel="Share your gift-card link"
            disabled={!merchantId}
          >
            <Share2 color={theme.accent} size={ICON.inlineAction} />
            <Text className="ml-2 font-inter-semibold text-brisk-accent">Share gift-card link</Text>
          </Pressable>
        </GlassCard>
      </Animated.View>

      {/* Fee transparency */}
      <Animated.View entering={FadeInDown.duration(400).delay(140).springify()}>
        <SectionLabel className="mb-2 mt-6">Brisk fees</SectionLabel>
        <GlassCard className="px-4 py-4" blur={false}>
          <Text className="text-xs text-brisk-subtext">
            Brisk takes {(BRISK_REVENUE.giftCardFeeBps / 100).toFixed(1)}% of each gift-card sale,
            deducted from your payout at issuance — you receive the rest immediately. There are no
            fees on regular payments.
          </Text>
        </GlassCard>
      </Animated.View>
    </Screen>
  );
}
