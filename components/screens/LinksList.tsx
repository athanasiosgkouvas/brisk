import { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  RefreshControl,
  ScrollView,
  Share,
  Text,
  View,
} from "react-native";
import Animated, { FadeInDown } from "react-native-reanimated";
import * as Clipboard from "expo-clipboard";
import { Ban, Check, Copy, Link2, Share2 } from "lucide-react-native";

import { Screen } from "@/components/ui/Screen";
import { GlassCard } from "@/components/ui/GlassCard";
import { EmptyState } from "@/components/ui/EmptyState";
import { useAuth } from "@/hooks/useAuth";
import { useTheme } from "@/hooks/useTheme";
import { STAGGER_MS, ICON } from "@/theme/scale";
import { formatUsd } from "@/services/blockchain/paymentTx";
import { cancelPaymentLink, listPaymentLinks, type LinkSummary } from "@/services/api/backendApi";

// Palette keys that carry a plain color string (excludes the aurora tuple).
type ColorTone = "accent" | "subtext" | "danger";

// Status tint resolves against the active palette at render (see LinksList).
const STATUS_STYLE: Record<LinkSummary["status"], { label: string; tone: ColorTone }> = {
  pending: { label: "Pending", tone: "accent" },
  paid: { label: "Paid", tone: "accent" },
  expired: { label: "Expired", tone: "subtext" },
  canceled: { label: "Canceled", tone: "danger" },
};

/**
 * The merchant's payment-link manager: every link with its status + copy / share
 * / cancel actions. Shared by the `/links` modal (reached from Charge, with a
 * close button) and the Pro `Links` tab (no close — pass no `onClose`).
 */
export function LinksList({ onClose }: { onClose?: () => void }) {
  const theme = useTheme();
  const { session } = useAuth();
  const [links, setLinks] = useState<LinkSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [copiedCode, setCopiedCode] = useState<string | null>(null);
  const [busyCode, setBusyCode] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!session) return;
    try {
      setLinks(await listPaymentLinks(session.address));
    } catch {
      // keep last known list
    } finally {
      setLoading(false);
    }
  }, [session]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
  }, [load]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }, [load]);

  const copy = async (l: LinkSummary) => {
    await Clipboard.setStringAsync(l.url);
    setCopiedCode(l.code);
    setTimeout(() => setCopiedCode((c) => (c === l.code ? null : c)), 1500);
  };

  const share = async (l: LinkSummary) => {
    await Share.share({ message: `Pay ${formatUsd(l.amountMicros)} with Brisk: ${l.url}` }).catch(
      () => {},
    );
  };

  const cancel = async (l: LinkSummary) => {
    if (!session) return;
    setBusyCode(l.code);
    try {
      await cancelPaymentLink(l.code, session.address);
      await load();
    } catch {
      // ignore; the row stays as-is
    } finally {
      setBusyCode(null);
    }
  };

  return (
    <Screen title="Payment links" onClose={onClose} bottomInset="tabbar">
      {loading ? (
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator color={theme.accent} />
        </View>
      ) : links.length === 0 ? (
        <EmptyState icon={Link2} subtitle="No payment links yet. Create one from the Charge tab." />
      ) : (
        <ScrollView
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={onRefresh}
              tintColor={theme.accent}
            />
          }
        >
          {links.map((l, i) => {
            const s = STATUS_STYLE[l.status];
            const sColor = theme[s.tone];
            const cancelable = l.status === "pending";
            return (
              <Animated.View
                key={l.code}
                entering={FadeInDown.duration(400).delay(Math.min(i, 8) * STAGGER_MS)}
                className="mb-3"
              >
                <GlassCard className="p-4" blur={false}>
                  <View className="flex-row items-center justify-between">
                    <Text className="text-xl font-inter-bold text-brisk-text">
                      {formatUsd(l.amountMicros)}
                    </Text>
                    <View
                      className="rounded-full px-3 py-1"
                      style={{ backgroundColor: `${sColor}1A` }}
                    >
                      <Text className="text-xs font-inter-semibold" style={{ color: sColor }}>
                        {s.label}
                      </Text>
                    </View>
                  </View>
                  <Text className="mt-1 text-xs text-brisk-subtext" numberOfLines={1}>
                    {l.url}
                  </Text>

                  <View className="mt-3 flex-row gap-2">
                    <Pressable
                      onPress={() => void copy(l)}
                      className="flex-row items-center rounded-xl border border-brisk-borderStrong px-3 py-2"
                      accessibilityLabel="Copy link"
                    >
                      {copiedCode === l.code ? (
                        <Check color={theme.accent} size={ICON.inlineAction} />
                      ) : (
                        <Copy color={theme.text} size={ICON.inlineAction} />
                      )}
                      <Text className="ml-1.5 text-xs font-inter-semibold text-brisk-text">
                        {copiedCode === l.code ? "Copied" : "Copy"}
                      </Text>
                    </Pressable>
                    <Pressable
                      onPress={() => void share(l)}
                      className="flex-row items-center rounded-xl border border-brisk-borderStrong px-3 py-2"
                      accessibilityLabel="Share link"
                    >
                      <Share2 color={theme.text} size={ICON.inlineAction} />
                      <Text className="ml-1.5 text-xs font-inter-semibold text-brisk-text">
                        Share
                      </Text>
                    </Pressable>
                    {cancelable ? (
                      <Pressable
                        onPress={() => void cancel(l)}
                        disabled={busyCode === l.code}
                        className="flex-row items-center rounded-xl border border-brisk-danger/40 px-3 py-2"
                        accessibilityLabel="Cancel link"
                      >
                        {busyCode === l.code ? (
                          <ActivityIndicator color={theme.danger} size="small" />
                        ) : (
                          <Ban color={theme.danger} size={ICON.inlineAction} />
                        )}
                        <Text className="ml-1.5 text-xs font-inter-semibold text-brisk-danger">
                          Cancel
                        </Text>
                      </Pressable>
                    ) : null}
                  </View>
                </GlassCard>
              </Animated.View>
            );
          })}
        </ScrollView>
      )}
    </Screen>
  );
}
