import { useState } from "react";
import { Pressable, Text, View } from "react-native";
import * as Clipboard from "expo-clipboard";

import { useSocialRetention } from "@/hooks/useSocialRetention";
import type { RetentionQuest } from "@/services/api/backendApi";
import { formatAddress, formatDusdc } from "@/utils/formatting";

type Bucket = "day" | "week" | "month" | "all";

const BUCKETS: { id: Bucket; label: string }[] = [
  { id: "day", label: "Day" },
  { id: "week", label: "Week" },
  { id: "month", label: "Month" },
  { id: "all", label: "All" },
];

export function SocialRetentionPanel({ address }: { address: string }) {
  const [bucket, setBucket] = useState<Bucket>("week");
  const [copiedInvite, setCopiedInvite] = useState(false);
  const { summary } = useSocialRetention(bucket);

  if (!summary) {
    return null;
  }

  return (
    <View className="mt-4 gap-4">
      <View className="rounded-3xl border border-[#27415A] bg-fathom-bg1 p-5">
        <Text className="text-[11px] uppercase tracking-wide text-fathom-subtext">Leaderboard</Text>
        <View className="mt-3 flex-row gap-2">
          {BUCKETS.map((item) => {
            const active = item.id === bucket;
            return (
              <Pressable
                key={item.id}
                onPress={() => setBucket(item.id)}
                className={`rounded-xl border px-3 py-1 ${
                  active ? "border-fathom-bull bg-[#0F231E]" : "border-[#315578] bg-fathom-bg2"
                }`}
              >
                <Text
                  className={`text-xs font-semibold ${active ? "text-fathom-bull" : "text-fathom-text"}`}
                >
                  {item.label}
                </Text>
              </Pressable>
            );
          })}
        </View>
        <Text className="mt-3 text-sm text-fathom-text">
          {summary.leaderboardRank
            ? `You're #${summary.leaderboardRank} of ${summary.leaderboardTotal}.`
            : "Start trading to enter the board."}
        </Text>
        <Text className="mt-1 text-xs text-fathom-subtext">{summary.coachingMessage}</Text>
        <View className="mt-3 gap-2">
          {summary.topLeaders.map((entry, idx) => (
            <View
              key={`${entry.sender}-${idx}`}
              className="flex-row items-center justify-between rounded-2xl border border-[#24415A] bg-fathom-bg2 px-3 py-2"
            >
              <Text className="text-xs text-fathom-text">
                #{idx + 1}{" "}
                {entry.sender.toLowerCase() === address.toLowerCase()
                  ? "You"
                  : formatAddress(entry.sender, 6, 4)}
              </Text>
              <Text className="text-xs text-fathom-subtext">
                {entry.wins}W · {formatDusdc(entry.totalPayoutMicro)}
              </Text>
            </View>
          ))}
        </View>
      </View>

      <View className="rounded-3xl border border-[#27415A] bg-fathom-bg1 p-5">
        <Text className="text-[11px] uppercase tracking-wide text-fathom-subtext">Quests</Text>
        <View className="mt-3 gap-3">
          {summary.quests.map((quest) => (
            <QuestRow key={quest.id} quest={quest} />
          ))}
        </View>
        <Text className="mt-3 text-xs text-fathom-subtext">{summary.responsibleReminder}</Text>
      </View>

      <View className="rounded-3xl border border-[#27415A] bg-fathom-bg1 p-5">
        <Text className="text-[11px] uppercase tracking-wide text-fathom-subtext">
          Referral loop
        </Text>
        <Text className="mt-2 text-sm text-fathom-text">Invite code: {summary.referralCode}</Text>
        <Text className="mt-1 text-xs text-fathom-subtext">
          Invite friends, compare streaks, and remind them to set a budget first.
        </Text>
        <Pressable
          className="mt-3 self-start rounded-xl bg-fathom-bull px-3 py-2"
          onPress={() => {
            void Clipboard.setStringAsync(summary.referralShareText);
            setCopiedInvite(true);
            setTimeout(() => setCopiedInvite(false), 1500);
          }}
        >
          <Text className="text-xs font-semibold text-[#07111A]">
            {copiedInvite ? "Invite copied" : "Copy invite message"}
          </Text>
        </Pressable>
        {summary.pendingClaimCount > 0 ? (
          <Text className="mt-2 text-xs text-fathom-subtext">
            Claim your settled wins before sharing updates.
          </Text>
        ) : null}
      </View>
    </View>
  );
}

function QuestRow({ quest }: { quest: RetentionQuest }) {
  const ratio = quest.target > 0 ? Math.min(quest.progress / quest.target, 1) : 0;
  return (
    <View className="rounded-2xl border border-[#24415A] bg-fathom-bg2 p-3">
      <View className="flex-row items-center justify-between">
        <Text className="text-sm font-semibold text-fathom-text">{quest.title}</Text>
        <Text
          className={`text-xs font-semibold ${quest.completed ? "text-fathom-bull" : "text-fathom-subtext"}`}
        >
          {quest.progress}/{quest.target}
        </Text>
      </View>
      <Text className="mt-1 text-xs text-fathom-subtext">{quest.description}</Text>
      <View className="mt-2 h-2 overflow-hidden rounded-full bg-[#1A2B3C]">
        <View
          className="h-full rounded-full bg-fathom-bull"
          style={{ width: `${Math.round(ratio * 100)}%` }}
        />
      </View>
      <Text className="mt-2 text-[11px] text-fathom-subtext">
        {quest.rewardLabel} · {quest.responsibleNote}
      </Text>
    </View>
  );
}
