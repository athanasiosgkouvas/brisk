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
import { SafeAreaView } from "react-native-safe-area-context";
import Animated, { FadeInDown } from "react-native-reanimated";
import { useRouter } from "expo-router";
import * as Clipboard from "expo-clipboard";
import { Ban, Check, Copy, Share2, X } from "lucide-react-native";

import { AuroraBackground } from "@/components/ui/AuroraBackground";
import { useAuth } from "@/hooks/useAuth";
import { formatUsd } from "@/services/blockchain/paymentTx";
import { cancelPaymentLink, listPaymentLinks, type LinkSummary } from "@/services/api/backendApi";
import { BRISK } from "@/theme/tokens";

const STATUS_STYLE: Record<LinkSummary["status"], { label: string; color: string }> = {
  pending: { label: "Pending", color: BRISK.accent },
  paid: { label: "Paid", color: BRISK.accent },
  expired: { label: "Expired", color: BRISK.subtext },
  canceled: { label: "Canceled", color: BRISK.danger },
};

// Merchant "Payment links" manager: every link they've created with its status,
// plus copy / share / cancel actions. Reached from the Charge tab.
export default function LinksScreen() {
  const router = useRouter();
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
    <View className="flex-1 bg-brisk-bg0">
      <AuroraBackground>
        <SafeAreaView edges={["top"]} className="flex-1 px-5">
          <View className="flex-row items-center justify-between py-4">
            <Text className="text-lg font-inter-bold text-brisk-text">Payment links</Text>
            <Pressable onPress={() => router.back()} hitSlop={12} accessibilityLabel="Close">
              <X color={BRISK.subtext} size={24} />
            </Pressable>
          </View>

          {loading ? (
            <View className="flex-1 items-center justify-center">
              <ActivityIndicator color={BRISK.accent} />
            </View>
          ) : links.length === 0 ? (
            <View className="flex-1 items-center justify-center px-8">
              <Text className="text-center text-sm text-brisk-subtext">
                No payment links yet. Create one from the Charge tab.
              </Text>
            </View>
          ) : (
            <ScrollView
              showsVerticalScrollIndicator={false}
              refreshControl={
                <RefreshControl
                  refreshing={refreshing}
                  onRefresh={onRefresh}
                  tintColor={BRISK.accent}
                />
              }
              contentContainerStyle={{ paddingBottom: 32 }}
            >
              {links.map((l, i) => {
                const s = STATUS_STYLE[l.status];
                const cancelable = l.status === "pending";
                return (
                  <Animated.View
                    key={l.code}
                    entering={FadeInDown.duration(400).delay(Math.min(i * 40, 240))}
                    className="mb-3 rounded-2xl border border-brisk-borderStrong bg-brisk-bg1/70 p-4"
                  >
                    <View className="flex-row items-center justify-between">
                      <Text className="text-xl font-inter-bold text-brisk-text">
                        {formatUsd(l.amountMicros)}
                      </Text>
                      <View
                        className="rounded-full px-3 py-1"
                        style={{ backgroundColor: `${s.color}1A` }}
                      >
                        <Text className="text-xs font-inter-semibold" style={{ color: s.color }}>
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
                          <Check color={BRISK.accent} size={16} />
                        ) : (
                          <Copy color={BRISK.text} size={16} />
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
                        <Share2 color={BRISK.text} size={16} />
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
                            <ActivityIndicator color={BRISK.danger} size="small" />
                          ) : (
                            <Ban color={BRISK.danger} size={16} />
                          )}
                          <Text className="ml-1.5 text-xs font-inter-semibold text-brisk-danger">
                            Cancel
                          </Text>
                        </Pressable>
                      ) : null}
                    </View>
                  </Animated.View>
                );
              })}
            </ScrollView>
          )}
        </SafeAreaView>
      </AuroraBackground>
    </View>
  );
}
