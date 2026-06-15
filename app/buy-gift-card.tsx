import { useEffect, useState } from "react";
import { ActivityIndicator, ScrollView, Text, TextInput, View } from "react-native";
import Animated, { FadeIn } from "react-native-reanimated";
import { useLocalSearchParams, useRouter } from "expo-router";
import { Search, Store } from "lucide-react-native";

import { Screen } from "@/components/ui/Screen";
import { ListRow } from "@/components/ui/ListRow";
import { ShareSheet } from "@/components/ui/ShareSheet";
import { ErrorText } from "@/components/ui/ErrorText";
import { PrimaryButton } from "@/components/ui/PrimaryButton";
import { PresetAmountRow } from "@/components/ui/PresetAmountRow";
import { useGiftCards } from "@/hooks/useGiftCards";
import { searchMerchants, type MerchantProfile } from "@/services/api/backendApi";
import { formatUsd, usdToMicros } from "@/services/blockchain/paymentTx";
import { ICON } from "@/theme/scale";
import { useTheme } from "@/hooks/useTheme";

const PRESETS = [10, 25, 50, 100];

// Buy a closed-loop gift card for a specific merchant, then share the claim link.
export default function BuyGiftCardScreen() {
  const theme = useTheme();
  const router = useRouter();
  const params = useLocalSearchParams<{ merchantId?: string; name?: string }>();
  const { buy } = useGiftCards();

  // Merchant comes from the route (a "sell gift cards" link / post-payment) or
  // from the in-app search picker below.
  const [picked, setPicked] = useState<{ merchantId: string; name: string } | null>(null);
  const merchantId =
    (typeof params.merchantId === "string" ? params.merchantId : "") || picked?.merchantId || "";
  const merchantName =
    (typeof params.name === "string" && params.name ? params.name : "") ||
    picked?.name ||
    "this merchant";

  const [query, setQuery] = useState("");
  const [results, setResults] = useState<MerchantProfile[]>([]);
  const [searching, setSearching] = useState(false);

  const [amountText, setAmountText] = useState("");
  const [status, setStatus] = useState<"form" | "buying" | "done" | "error">("form");
  const [error, setError] = useState<string | null>(null);
  const [link, setLink] = useState<string | null>(null);

  const micros = usdToMicros(Number(amountText || "0"));
  const canBuy = micros > 0 && !!merchantId;

  // Debounced merchant search (only when no merchant is chosen yet).
  useEffect(() => {
    if (merchantId) return;
    const q = query.trim();
    if (q.length < 2) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setResults([]);
      return;
    }
    let active = true;
    setSearching(true);
    const t = setTimeout(() => {
      searchMerchants(q)
        .then((r) => active && setResults(r))
        .finally(() => active && setSearching(false));
    }, 250);
    return () => {
      active = false;
      clearTimeout(t);
    };
  }, [query, merchantId]);

  const onBuy = async () => {
    if (!canBuy) return;
    setError(null);
    setStatus("buying");
    try {
      const res = await buy({ merchantId, amountMicros: micros });
      setLink(res.url);
      setStatus("done");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't buy gift card");
      setStatus("error");
    }
  };

  return (
    <Screen title="Gift card" onClose={() => router.back()}>
      {!merchantId ? (
        <Animated.View entering={FadeIn.duration(300)} className="flex-1 pt-2">
          <Text className="text-center text-sm text-brisk-subtext">
            Find the business you want to gift store credit for.
          </Text>
          <View className="mt-6 w-full flex-row items-center rounded-2xl border border-brisk-borderStrong bg-brisk-bg1/70 px-4 py-3">
            <Search color={theme.subtext} size={ICON.inlineAction} />
            <TextInput
              className="ml-2 flex-1 text-base text-brisk-text"
              style={{ padding: 0 }}
              placeholder="Search businesses"
              placeholderTextColor={theme.placeholder}
              value={query}
              onChangeText={setQuery}
              autoFocus
              autoCapitalize="none"
              accessibilityLabel="Search businesses"
            />
            {searching ? <ActivityIndicator size="small" color={theme.accent} /> : null}
          </View>
          <ScrollView
            className="mt-3"
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
          >
            {results.map((m) => (
              <View key={m.merchantId} className="mt-2">
                <ListRow
                  icon={Store}
                  title={m.businessName}
                  onPress={() => setPicked({ merchantId: m.merchantId, name: m.businessName })}
                  chevron
                />
              </View>
            ))}
            {query.trim().length >= 2 && !searching && results.length === 0 ? (
              <Text className="mt-6 text-center text-sm text-brisk-subtext">
                No businesses found for “{query.trim()}”.
              </Text>
            ) : null}
          </ScrollView>
        </Animated.View>
      ) : status === "done" && link ? (
        <Animated.View entering={FadeIn.duration(300)} className="flex-1 items-center pt-6">
          <Text className="text-sm uppercase tracking-[2px] text-brisk-subtext">Gift card</Text>
          <Text className="mt-2 text-center text-2xl font-inter-bold text-brisk-text">
            {formatUsd(micros)} at {merchantName}
          </Text>
          <Text className="mt-2 text-center text-sm text-brisk-subtext">
            Send this to a friend — they tap to add it to their account.
          </Text>
          <View className="mt-6 w-full">
            <ShareSheet
              value={link}
              qrSize={180}
              shareMessage={`I sent you a ${formatUsd(micros)} gift card for ${merchantName} on Brisk: ${link}`}
              qrAccessibilityLabel="Gift card claim QR code"
            />
          </View>
          <View className="mt-6 w-full max-w-[360px]">
            <PrimaryButton label="Done" variant="secondary" onPress={() => router.back()} />
          </View>
        </Animated.View>
      ) : (
        <Animated.View entering={FadeIn.duration(300)} className="pt-2">
          <Text className="text-center text-sm text-brisk-subtext">
            Buy store credit for {merchantName} to gift a friend.
          </Text>
          <View className="mt-6 w-full flex-row items-center rounded-2xl border border-brisk-borderStrong bg-brisk-bg1/70 px-5 py-4">
            <Text className="text-3xl font-inter-bold text-brisk-subtext">$</Text>
            <TextInput
              className="ml-2 flex-1 text-3xl font-inter-bold text-brisk-text"
              style={{ padding: 0 }}
              placeholder="0.00"
              placeholderTextColor={theme.placeholder}
              keyboardType="decimal-pad"
              value={amountText}
              onChangeText={setAmountText}
              autoFocus
              accessibilityLabel="Gift card amount in US dollars"
            />
          </View>
          <PresetAmountRow
            options={PRESETS.map((v) => ({ label: `$${v}`, value: v }))}
            onPick={(v) => setAmountText(String(v))}
          />
          <ErrorText className="mt-3">{error}</ErrorText>
          <View className="mt-8">
            <PrimaryButton
              label={micros > 0 ? `Buy · ${formatUsd(micros)}` : "Buy gift card"}
              onPress={() => void onBuy()}
              loading={status === "buying"}
              disabled={!canBuy}
            />
          </View>
          <Text className="mt-3 text-center text-xs text-brisk-subtext">
            Your friend gets a gift card for the full amount to spend at {merchantName}.
            {merchantName} is paid right away (Brisk keeps a 3% fee).
          </Text>
        </Animated.View>
      )}
    </Screen>
  );
}
