import { useState } from "react";
import { Pressable, Share, Text, View } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import QRCode from "react-native-qrcode-svg";
import * as Clipboard from "expo-clipboard";
import { Check, Copy, Share2 } from "lucide-react-native";

import { useTheme } from "@/hooks/useTheme";
import { ICON } from "@/theme/scale";
import { hapticSwipeSuccess } from "@/utils/haptics";

/**
 * The aurora-framed white QR + Copy (+ optional Share) action row. One component
 * for every "share this link/address" surface (receive, payment link, gift-card
 * link) so the QR frame, copy state, and pills are identical. `value` is what's
 * encoded + copied; pass `shareMessage` to also show a Share button.
 */
export function ShareSheet({
  value,
  qrSize = 200,
  copyLabel = "Copy",
  shareMessage,
  qrAccessibilityLabel,
}: {
  value: string;
  qrSize?: number;
  copyLabel?: string;
  shareMessage?: string;
  qrAccessibilityLabel?: string;
}) {
  const theme = useTheme();
  const [copied, setCopied] = useState(false);

  const copy = async () => {
    if (!value) return;
    await Clipboard.setStringAsync(value);
    setCopied(true);
    void hapticSwipeSuccess();
    setTimeout(() => setCopied(false), 1500);
  };
  const share = async () => {
    if (!value) return;
    await Share.share({ message: shareMessage ?? value }).catch(() => {});
  };

  return (
    <View className="items-center">
      <LinearGradient
        colors={theme.aurora}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={{ borderRadius: 28, padding: 3 }}
      >
        <View
          className="rounded-3xl bg-white p-5"
          accessible
          accessibilityRole="image"
          accessibilityLabel={qrAccessibilityLabel}
        >
          {value ? <QRCode value={value} size={qrSize} /> : null}
        </View>
      </LinearGradient>

      <View className="mt-6 w-full max-w-[360px] flex-row gap-3">
        <View className="flex-1">
          <Pressable
            onPress={copy}
            className="flex-row items-center justify-center rounded-2xl border border-brisk-borderStrong bg-brisk-bg1/70 px-4 py-3"
            accessibilityRole="button"
            accessibilityLabel={copied ? "Copied" : copyLabel}
          >
            {copied ? (
              <Check color={theme.accent} size={ICON.inlineAction} />
            ) : (
              <Copy color={theme.text} size={ICON.inlineAction} />
            )}
            <Text className="ml-2 font-inter-semibold text-brisk-text">
              {copied ? "Copied" : copyLabel}
            </Text>
          </Pressable>
        </View>
        {shareMessage != null ? (
          <View className="flex-1">
            <Pressable
              onPress={share}
              className="flex-row items-center justify-center rounded-2xl border border-brisk-borderStrong bg-brisk-bg1/70 px-4 py-3"
              accessibilityRole="button"
              accessibilityLabel="Share"
            >
              <Share2 color={theme.text} size={ICON.inlineAction} />
              <Text className="ml-2 font-inter-semibold text-brisk-text">Share</Text>
            </Pressable>
          </View>
        ) : null}
      </View>
    </View>
  );
}
