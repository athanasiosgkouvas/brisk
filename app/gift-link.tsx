import { Text, View } from "react-native";
import Animated, { FadeIn } from "react-native-reanimated";
import { useLocalSearchParams, useRouter } from "expo-router";

import { Screen } from "@/components/ui/Screen";
import { ShareSheet } from "@/components/ui/ShareSheet";
import { PrimaryButton } from "@/components/ui/PrimaryButton";
import { formatUsd } from "@/services/blockchain/paymentTx";

// Show a gift-card claim link (QR + copy + share). Reused for re-sharing an
// issued-but-unclaimed card and for the link produced by re-gifting a card.
export default function GiftLinkScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ url?: string; amount?: string; merchant?: string }>();

  const url = typeof params.url === "string" ? params.url : "";
  const merchant =
    typeof params.merchant === "string" && params.merchant ? params.merchant : "this merchant";
  const amountMicros = Number(params.amount ?? "0");

  return (
    <Screen title="Gift card link" onClose={() => router.back()}>
      <Animated.View entering={FadeIn.duration(300)} className="flex-1 items-center pt-4">
        <Text className="text-center text-2xl font-inter-bold text-brisk-text">
          {amountMicros > 0
            ? `${formatUsd(amountMicros)} at ${merchant}`
            : `Gift card for ${merchant}`}
        </Text>
        <Text className="mt-2 text-center text-sm text-brisk-subtext">
          Send this to a friend — they tap to add it to their account.
        </Text>

        <View className="mt-8 w-full">
          <ShareSheet
            value={url}
            qrSize={180}
            shareMessage={`Here's a ${amountMicros > 0 ? `${formatUsd(amountMicros)} ` : ""}gift card for ${merchant} on Brisk: ${url}`}
            qrAccessibilityLabel="Gift card claim QR code"
          />
        </View>

        <View className="mt-8 w-full max-w-[360px]">
          <PrimaryButton label="Done" variant="secondary" onPress={() => router.back()} />
        </View>
      </Animated.View>
    </Screen>
  );
}
