import { useEffect, useState } from "react";
import { ActivityIndicator, FlatList, Linking, Pressable, Text, View } from "react-native";
import { ExternalLink } from "lucide-react-native";

import { formatTimeLeft } from "@/utils/formatting";
import { ENV } from "@/utils/constants";
import type { PositionHistoryItem } from "@/types/position";

function explorerUrl(digest: string): string {
  // Sui's official explorer follows the network name from env so a mainnet
  // switch keeps the link correct.
  return `https://suiscan.xyz/${ENV.suiNetwork}/tx/${digest}`;
}

type Props = {
  data: PositionHistoryItem[];
  onClaimPayout?: (position: PositionHistoryItem) => void;
};

function shouldShowClaimState(item: PositionHistoryItem): boolean {
  return item.outcome === "WIN";
}

function getClaimSupportCopy(item: PositionHistoryItem): string | null {
  if (item.claimStatus === "INDEXING" || item.claimStatus === "NOT_CLAIMABLE") {
    return "Settlement detected. Claim unlocks automatically after indexing.";
  }
  if (item.claimStatus === "CLAIMABLE") {
    return "Ready now — claiming transfers winnings to your wallet.";
  }
  if (item.claimStatus === "CLAIMING") {
    return "Submitting claim on-chain…";
  }
  if (item.claimStatus === "FAILED") {
    return item.claimError ?? "Claim failed. Retry now or check connection.";
  }
  return null;
}

function getClaimCtaLabel(status: PositionHistoryItem["claimStatus"]): string {
  if (status === "FAILED") return "Retry claim";
  if (status === "CLAIMING") return "Claiming…";
  return "Claim winnings";
}

function canClaim(status: PositionHistoryItem["claimStatus"]): boolean {
  return status === "CLAIMABLE" || status === "FAILED";
}

function PendingTimer({ expiryTimestamp }: { expiryTimestamp: number }) {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1_000);
    return () => clearInterval(timer);
  }, []);

  const expired = expiryTimestamp <= now;
  return (
    <Text className="mt-1 text-xs text-fathom-subtext">
      {expired ? "Awaiting settlement…" : `Expires in ${formatTimeLeft(expiryTimestamp, now)}`}
    </Text>
  );
}

export function PositionHistoryList({ data, onClaimPayout }: Props) {
  return (
    <FlatList
      data={data}
      keyExtractor={(item) => item.id}
      scrollEnabled={false}
      contentContainerStyle={{ gap: 10 }}
      renderItem={({ item }) => (
        <View className="rounded-2xl border border-[#27415A] bg-fathom-bg1 p-4">
          <View className="flex-row items-center justify-between">
            <Text className="text-sm font-semibold text-fathom-text">
              {item.asset} {item.direction}
            </Text>
            <Text
              className={`text-xs font-semibold ${
                item.outcome === "WIN"
                  ? "text-fathom-bull"
                  : item.outcome === "LOSS"
                    ? "text-fathom-bear"
                    : "text-fathom-subtext"
              }`}
            >
              {item.outcome}
            </Text>
          </View>
          <Text className="mt-2 text-xs uppercase tracking-wide text-fathom-subtext">
            Strike {item.strikePrice.toLocaleString()} · {new Date(item.timestamp).toLocaleString()}
          </Text>
          {item.txDigest && !item.txDigest.startsWith("demo-") ? (
            <Pressable
              onPress={() => void Linking.openURL(explorerUrl(item.txDigest!))}
              accessibilityRole="link"
              accessibilityLabel="View transaction on Suiscan"
              className="mt-2 flex-row items-center gap-1.5 self-start rounded-lg border border-[#27415A] bg-fathom-bg2 px-2 py-1"
            >
              <ExternalLink size={11} color="#56C2FF" />
              <Text className="text-[10px] font-semibold text-fathom-bull">
                {item.txDigest.slice(0, 8)}…{item.txDigest.slice(-6)} · View on explorer
              </Text>
            </Pressable>
          ) : null}
          {item.outcome === "PENDING" && item.expiryTimestamp ? (
            <PendingTimer expiryTimestamp={item.expiryTimestamp} />
          ) : null}
          {shouldShowClaimState(item) ? (
            <View className="mt-3">
              {item.claimStatus === "CLAIMED" ? (
                <View className="self-start rounded-xl border border-[#27415A] bg-fathom-bg2 px-3 py-2">
                  <Text className="text-xs font-semibold text-fathom-bull">Winnings claimed</Text>
                </View>
              ) : (
                <>
                  {canClaim(item.claimStatus) || item.claimStatus === "CLAIMING" ? (
                    <Pressable
                      disabled={
                        item.claimStatus === "CLAIMING" ||
                        !canClaim(item.claimStatus) ||
                        !onClaimPayout
                      }
                      onPress={() => onClaimPayout?.(item)}
                      className={`self-start rounded-xl px-3 py-2 ${
                        item.claimStatus === "CLAIMING" ||
                        !canClaim(item.claimStatus) ||
                        !onClaimPayout
                          ? "bg-slate-700"
                          : "bg-fathom-bull"
                      }`}
                    >
                      {item.claimStatus === "CLAIMING" ? (
                        <ActivityIndicator color="#07111A" size="small" />
                      ) : (
                        <Text className="text-xs font-semibold text-[#07111A]">
                          {getClaimCtaLabel(item.claimStatus)}
                        </Text>
                      )}
                    </Pressable>
                  ) : (
                    <View className="self-start rounded-xl border border-[#27415A] bg-fathom-bg2 px-3 py-2">
                      <Text className="text-xs font-semibold text-fathom-subtext">
                        Indexing payout…
                      </Text>
                    </View>
                  )}
                  {getClaimSupportCopy(item) ? (
                    <Text
                      className={`mt-2 text-xs ${
                        item.claimStatus === "FAILED" ? "text-[#FF9CB0]" : "text-fathom-subtext"
                      }`}
                    >
                      {getClaimSupportCopy(item)}
                    </Text>
                  ) : null}
                </>
              )}
            </View>
          ) : null}
        </View>
      )}
    />
  );
}
