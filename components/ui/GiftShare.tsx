import { Text, View } from "react-native";
import Animated, { FadeIn } from "react-native-reanimated";

import { ShareSheet } from "@/components/ui/ShareSheet";
import { PrimaryButton } from "@/components/ui/PrimaryButton";
import { formatUsd } from "@/services/blockchain/paymentTx";

/**
 * The single share surface for a gift-card claim link — caption + QR + copy +
 * share + a dismiss button. Used by buy-gift-card (its "done" state) and the
 * My-gift-cards screen (re-gift / re-share an unclaimed link, presented in
 * place), so there is exactly one gift-share UI instead of a duplicate screen.
 * Renders inner content only — the caller provides the surrounding scaffold.
 */
export function GiftShare({
  url,
  amountMicros,
  merchantName,
  onDone,
  doneLabel = "Done",
}: {
  url: string;
  amountMicros: number;
  merchantName: string;
  onDone: () => void;
  doneLabel?: string;
}) {
  const hasAmount = amountMicros > 0;
  return (
    <Animated.View entering={FadeIn.duration(300)} className="w-full items-center">
      <Text className="text-sm uppercase tracking-[2px] text-brisk-subtext">Gift card</Text>
      <Text className="mt-2 text-center text-2xl font-inter-bold text-brisk-text">
        {hasAmount
          ? `${formatUsd(amountMicros)} at ${merchantName}`
          : `Gift card for ${merchantName}`}
      </Text>
      <Text className="mt-2 text-center text-sm text-brisk-subtext">
        Send this to a friend — they tap to add it to their account.
      </Text>

      <View className="mt-6 w-full">
        <ShareSheet
          value={url}
          qrSize={180}
          shareMessage={`Here's a ${
            hasAmount ? `${formatUsd(amountMicros)} ` : ""
          }gift card for ${merchantName} on Brisk: ${url}`}
          qrAccessibilityLabel="Gift card claim QR code"
        />
      </View>

      <View className="mt-6 w-full max-w-[360px]">
        <PrimaryButton label={doneLabel} variant="secondary" onPress={onDone} />
      </View>
    </Animated.View>
  );
}
