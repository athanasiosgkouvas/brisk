import { useCallback, useState } from "react";
import { Pressable, Text, View } from "react-native";
import Animated, { FadeInDown } from "react-native-reanimated";
import * as Clipboard from "expo-clipboard";
import * as Haptics from "expo-haptics";
import { ArrowDownLeft, ArrowUpRight, Check, Copy } from "lucide-react-native";

import { GlassCard } from "@/components/ui/GlassCard";
import { BusinessAvatar } from "@/components/ui/BusinessAvatar";
import { useTheme } from "@/hooks/useTheme";
import { formatUsd } from "@/services/blockchain/paymentTx";
import { type ActivityItem } from "@/services/blockchain/receipts";
import { formatRelativeTime } from "@/utils/time";

function shortAddr(a: string): string {
  return a.length > 12 ? `${a.slice(0, 6)}…${a.slice(-4)}` : a;
}

/**
 * One on-chain USDC movement (sent/received) with a tap-to-copy tx digest.
 * Shared by the personal Wallet activity feed and the Pro dashboard history.
 */
export function ActivityRow({
  item,
  index,
  name,
  logoUrl,
}: {
  item: ActivityItem;
  index: number;
  /** Resolved business name for the counterparty; falls back to a short address. */
  name?: string;
  /** Resolved business logo for the counterparty; falls back to an identicon. */
  logoUrl?: string;
}) {
  const theme = useTheme();
  const received = item.direction === "received";
  const [copied, setCopied] = useState(false);

  const copyTx = useCallback(async () => {
    if (!item.digest) return;
    await Clipboard.setStringAsync(item.digest);
    void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }, [item.digest]);

  return (
    <Animated.View
      entering={FadeInDown.duration(400).delay(Math.min(index, 8) * 55)}
      className="mb-2"
    >
      {/* Translucent (no blur) — keeps the scrolling list smooth on Android. */}
      <GlassCard className="flex-row items-center px-4 py-3">
        {/* Aurora identicon for the counterparty + a small direction badge. */}
        <View style={{ width: 44, height: 44 }}>
          <BusinessAvatar
            logoUrl={logoUrl}
            seed={item.counterparty}
            size={44}
            label={name?.trim()?.[0]}
          />
          <View
            className="absolute items-center justify-center rounded-full border-2 border-brisk-bg1 bg-brisk-bg2"
            style={{ width: 20, height: 20, right: -2, bottom: -2 }}
          >
            {received ? (
              <ArrowDownLeft color={theme.accent} size={12} strokeWidth={3} />
            ) : (
              <ArrowUpRight color={theme.subtext} size={12} strokeWidth={3} />
            )}
          </View>
        </View>
        <View className="ml-3 flex-1">
          <View className="flex-row items-center">
            <Text className="text-sm text-brisk-text">{received ? "Received" : "Sent"}</Text>
            <Text className="ml-2 text-xs text-brisk-subtext">
              {formatRelativeTime(item.timestampMs)}
            </Text>
          </View>
          <Text className="text-xs text-brisk-subtext">
            {received ? "from" : "to"} {name ?? shortAddr(item.counterparty)}
          </Text>
          {item.digest ? (
            <Pressable
              onPress={copyTx}
              hitSlop={8}
              className="mt-1 flex-row items-center"
              accessibilityRole="button"
              accessibilityLabel={copied ? "Transaction digest copied" : "Copy transaction digest"}
            >
              {copied ? (
                <Check color={theme.accent} size={12} />
              ) : (
                <Copy color={theme.placeholder} size={12} />
              )}
              <Text
                className={`ml-1 text-[11px] ${copied ? "text-brisk-accent" : "text-brisk-subtext"}`}
              >
                {copied ? "Copied tx" : shortAddr(item.digest)}
              </Text>
            </Pressable>
          ) : null}
        </View>
        <Text
          className={`text-base font-inter-semibold ${received ? "text-brisk-accent" : "text-brisk-text"}`}
        >
          {received ? "+" : "−"}
          {formatUsd(item.amountMicros)}
        </Text>
      </GlassCard>
    </Animated.View>
  );
}
