import { useEffect, useState } from "react";
import { Modal, Pressable, Text, View } from "react-native";

import { getBinaryMarketSignals, getRangeMarketSignals } from "@/utils/marketSignals";
import type { MarketCard } from "@/types/market";
import { formatTimeLeft } from "@/utils/formatting";

type Props = {
  market: MarketCard | null;
  stake: number;
  onClose: () => void;
};

export function MarketPreviewModal({ market, stake, onClose }: Props) {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (!market) return;

    const timer = setInterval(() => setNow(Date.now()), 1_000);
    return () => clearInterval(timer);
  }, [market]);

  if (!market) return null;

  const binarySignals = getBinaryMarketSignals(market, stake);
  const rangeSignals = market.kind === "range" ? getRangeMarketSignals(market, stake) : null;
  const leftLabel = market.kind === "range" ? "BOUNDED" : "YES";
  const rightLabel = market.kind === "range" ? "OUTSIDE" : "NO";
  const leftProbability =
    market.kind === "range"
      ? (rangeSignals?.boundedProbability ?? binarySignals.yesProbability)
      : binarySignals.yesProbability;
  const rightProbability =
    market.kind === "range"
      ? (rangeSignals?.outsideProbability ?? binarySignals.noProbability)
      : binarySignals.noProbability;
  const leftNet =
    market.kind === "range"
      ? (rangeSignals?.boundedNet ?? binarySignals.yesNet)
      : binarySignals.yesNet;
  const rightNet = market.kind === "range" ? "N/A" : binarySignals.noNet;

  return (
    <Modal visible transparent animationType="fade" onRequestClose={onClose}>
      <View className="flex-1 items-center justify-center bg-black/60 px-5">
        <View className="w-full max-w-[420px] rounded-[28px] border border-[#315578] bg-fathom-bg1 p-5">
          <View className="flex-row items-center justify-between">
            <Text className="text-[11px] uppercase tracking-[2px] text-fathom-subtext">
              {market.category}
            </Text>
            <Pressable
              onPress={onClose}
              accessibilityRole="button"
              accessibilityLabel="Close preview"
            >
              <Text className="text-sm font-semibold text-fathom-bull">Close</Text>
            </Pressable>
          </View>

          <Text className="mt-3 text-2xl font-bold leading-8 text-fathom-text">
            {market.question}
          </Text>
          <Text className="mt-2 text-sm leading-6 text-fathom-subtext">{market.summary}</Text>

          <View className="mt-5 flex-row gap-3">
            <View className="flex-1 rounded-2xl border border-[#204A3B] bg-[#0F231E] p-4">
              <Text className="text-[11px] uppercase text-fathom-subtext">{leftLabel}</Text>
              <Text className="mt-2 text-2xl font-bold text-fathom-bull">{leftProbability}%</Text>
              <Text className="mt-1 text-xs text-fathom-subtext">Net +{leftNet} dUSDC</Text>
            </View>
            <View className="flex-1 rounded-2xl border border-[#5A2332] bg-[#2A151F] p-4">
              <Text className="text-[11px] uppercase text-fathom-subtext">{rightLabel}</Text>
              <Text className="mt-2 text-2xl font-bold text-fathom-bear">{rightProbability}%</Text>
              <Text className="mt-1 text-xs text-fathom-subtext">
                {market.kind === "range" ? "Not tradable in app" : `Net +${rightNet} dUSDC`}
              </Text>
            </View>
          </View>

          <View className="mt-4 rounded-2xl border border-[#24415A] bg-[#0A1A28] px-4 py-3">
            <Text className="text-xs font-semibold text-fathom-text">
              {binarySignals.confidenceLabel} · {binarySignals.uncertaintyLabel}
            </Text>
            <Text className="mt-1 text-xs text-fathom-subtext">
              Market leans {binarySignals.leadingSide}. Treat this as context, not certainty.
            </Text>
          </View>
          {rangeSignals ? (
            <View className="mt-3 rounded-2xl border border-[#24415A] bg-[#0A1A28] px-4 py-3">
              <Text className="text-xs font-semibold text-fathom-text">
                BOUNDED {rangeSignals.boundedProbability}% · OUTSIDE{" "}
                {rangeSignals.outsideProbability}%
              </Text>
              <Text className="mt-1 text-xs text-fathom-subtext">
                {rangeSignals.bandRiskLabel} · Band width ~{rangeSignals.bandPct}% around strike.
              </Text>
            </View>
          ) : null}

          <View className="mt-5 rounded-2xl border border-[#24415A] bg-[#0A1A28] px-4 py-3">
            <Text className="text-xs text-fathom-subtext">
              Expires in {formatTimeLeft(market.expiryTimestamp, now)} · Fixed stake {stake} dUSDC
            </Text>
            <Text className="mt-1 text-xs text-fathom-subtext">
              Est. payout context: {leftLabel}{" "}
              {market.kind === "range" ? rangeSignals?.boundedGross : binarySignals.yesGross} ·{" "}
              {rightLabel} {market.kind === "range" ? "N/A" : binarySignals.noGross} dUSDC gross.
            </Text>
          </View>
        </View>
      </View>
    </Modal>
  );
}
