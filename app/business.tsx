import { useState } from "react";
import { Pressable, Share, Text, TextInput, View } from "react-native";
import Animated, { FadeInDown } from "react-native-reanimated";
import { useRouter } from "expo-router";
import { Check, Gift, Pencil, Share2 } from "lucide-react-native";

import { Screen } from "@/components/ui/Screen";
import { SectionLabel } from "@/components/ui/SectionLabel";
import { GlassCard } from "@/components/ui/GlassCard";
import {
  BusinessProfileForm,
  EMPTY_BUSINESS_PROFILE,
  type BusinessProfileValue,
} from "@/components/ui/BusinessProfileForm";
import { PrimaryButton } from "@/components/ui/PrimaryButton";
import { BusinessAvatar } from "@/components/ui/BusinessAvatar";
import { useMerchantProfile } from "@/hooks/useMerchantProfile";
import { BRISK_REVENUE, ENV } from "@/utils/constants";
import { ICON } from "@/theme/scale";
import { useTheme } from "@/hooks/useTheme";

// Pro "Business" hub: identity + gift-card info + protocol-fee transparency.
// Reached from the dashboard.
export default function BusinessScreen() {
  const theme = useTheme();
  const router = useRouter();
  const { name, merchantId, profile, rename, update } = useMerchantProfile();

  const [editingName, setEditingName] = useState(false);
  const [nameDraft, setNameDraft] = useState("");

  // Editable business details (VAT + optional metadata). The business name is
  // edited separately via the identity rename above, so the shared form runs
  // with nameEditable off.
  const [editingDetails, setEditingDetails] = useState(false);
  const [savingDetails, setSavingDetails] = useState(false);
  const [details, setDetails] = useState<BusinessProfileValue>(EMPTY_BUSINESS_PROFILE);

  const startEditDetails = () => {
    setDetails({
      businessName: name ?? "",
      vatId: profile?.vatId ?? "",
      category: profile?.category ?? "",
      city: profile?.city ?? "",
      country: profile?.country ?? "",
      phone: profile?.phone ?? "",
      email: profile?.email ?? "",
      logoUrl: profile?.logoUrl ?? "",
    });
    setEditingDetails(true);
  };

  const commitDetails = async () => {
    setSavingDetails(true);
    try {
      // Name is preserved server-side; send only the editable metadata fields.
      await update({
        vatId: details.vatId,
        category: details.category,
        city: details.city,
        country: details.country,
        phone: details.phone,
        email: details.email,
        logoUrl: details.logoUrl,
      });
      setEditingDetails(false);
    } catch {
      // keep the form open on failure
    } finally {
      setSavingDetails(false);
    }
  };

  const detailRows: { label: string; value: string | null }[] = [
    { label: "VAT / Tax ID", value: profile?.vatId ?? null },
    { label: "Category", value: profile?.category ?? null },
    { label: "City", value: profile?.city ?? null },
    { label: "Country", value: profile?.country ?? null },
    { label: "Phone", value: profile?.phone ?? null },
    { label: "Email", value: profile?.email ?? null },
    { label: "Logo URL", value: profile?.logoUrl ?? null },
  ];

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
              <BusinessAvatar
                logoUrl={profile?.logoUrl}
                seed={merchantId ?? name ?? "business"}
                size={40}
                label={name?.trim()?.[0]}
              />
              <Text className="ml-3 flex-1 text-base font-inter-semibold text-brisk-text">
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

      {/* Business details (VAT + optional metadata) */}
      <Animated.View entering={FadeInDown.duration(400).delay(60).springify()}>
        <View className="mb-2 mt-6 flex-row items-center justify-between">
          <SectionLabel>Business details</SectionLabel>
          {!editingDetails ? (
            <Pressable onPress={startEditDetails} hitSlop={10} accessibilityLabel="Edit details">
              <Pencil color={theme.subtext} size={ICON.inlineAction} />
            </Pressable>
          ) : null}
        </View>
        <GlassCard className="px-4 py-4" blur={false}>
          {editingDetails ? (
            <View className="gap-3">
              <BusinessProfileForm value={details} onChange={setDetails} />
              <View className="mt-1 flex-row gap-3">
                <View className="flex-1">
                  <PrimaryButton
                    label="Cancel"
                    variant="secondary"
                    onPress={() => setEditingDetails(false)}
                  />
                </View>
                <View className="flex-1">
                  <PrimaryButton
                    label="Save"
                    onPress={() => void commitDetails()}
                    loading={savingDetails}
                    disabled={details.vatId.trim().length < 1}
                  />
                </View>
              </View>
            </View>
          ) : (
            detailRows.map((row, i) => (
              <View
                key={row.label}
                className={`flex-row items-center justify-between py-2 ${
                  i < detailRows.length - 1 ? "border-b border-brisk-border" : ""
                }`}
              >
                <Text className="text-sm text-brisk-subtext">{row.label}</Text>
                <Text className="ml-3 flex-1 text-right text-sm font-inter-semibold text-brisk-text">
                  {row.value ?? "—"}
                </Text>
              </View>
            ))
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
