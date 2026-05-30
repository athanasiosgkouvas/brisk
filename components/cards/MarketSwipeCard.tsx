import { useEffect, useMemo, useState } from "react";
import { Pressable, Text, View } from "react-native";

import { formatTimeLeft } from "@/utils/formatting";
import { getBinaryMarketSignals } from "@/utils/marketSignals";
import { getAssetVisual } from "@/utils/assetVisuals";
import type { MarketCard } from "@/types/market";

type Props = {
  market: MarketCard;
  stake: number;
  swipeBias?: number;
  actionsDisabled?: boolean;
  onPressNo?: () => void;
  onPressYes?: () => void;
  onPressSkip?: () => void;
  onPressPreview?: () => void;
};

export function MarketSwipeCard({
  market,
  stake,
  swipeBias = 0,
  actionsDisabled = false,
  onPressNo,
  onPressYes,
  onPressSkip,
  onPressPreview,
}: Props) {
  const [now, setNow] = useState(() => Date.now());
  const yesActive = swipeBias > 12;
  const noActive = swipeBias < -12;
  const signals = useMemo(() => getBinaryMarketSignals(market, stake), [market, stake]);

  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1_000);
    return () => clearInterval(timer);
  }, []);

  const visual = getAssetVisual(market.asset);

  return (
    <View
      className="h-[420px] overflow-hidden rounded-3xl border border-[#2A3E54] bg-fathom-bg1 p-5"
      style={{ backgroundColor: "#0B1A28" }}
    >
      {/* Asset-tinted hero band — gives each card a recognisable identity
          without bundling image assets. The watermarked glyph sits behind
          content for depth. */}
      <View
        pointerEvents="none"
        style={{
          position: "absolute",
          top: 0,
          left: 0,
          right: 0,
          height: 140,
          backgroundColor: visual.tint,
        }}
      />
      <Text
        pointerEvents="none"
        style={{
          position: "absolute",
          right: -8,
          top: -10,
          fontSize: 170,
          fontWeight: "900",
          color: visual.accent,
          opacity: 0.08,
          letterSpacing: -4,
        }}
      >
        {visual.glyph}
      </Text>

      <View className="flex-row items-center justify-between">
        <View
          className="flex-row items-center gap-2 rounded-full border bg-fathom-bg2 px-3 py-1 self-start"
          style={{ borderColor: visual.accent }}
        >
          <View
            style={{
              width: 18,
              height: 18,
              borderRadius: 9,
              backgroundColor: visual.accent,
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <Text style={{ fontSize: 11, fontWeight: "700", color: "#07111A" }}>
              {visual.glyph}
            </Text>
          </View>
          <Text className="text-[11px] uppercase tracking-wide text-fathom-text">
            {market.asset} · {market.category}
          </Text>
        </View>
        <View className="flex-row gap-2">
          {onPressPreview ? (
            <Pressable
              onPress={onPressPreview}
              className="rounded-full border border-[#315578] px-3 py-1"
            >
              <Text className="text-[11px] font-semibold uppercase tracking-wide text-fathom-bull">
                Preview
              </Text>
            </Pressable>
          ) : null}
          {onPressSkip ? (
            // Skip just dismisses the top card — it mints nothing, so it stays
            // tappable even while a previous card's prediction is submitting
            // (unlike YES/NO, which are gated by `actionsDisabled`). Styled at
            // full strength so it doesn't read as disabled next to Preview.
            <Pressable
              onPress={onPressSkip}
              accessibilityRole="button"
              accessibilityLabel="Skip this market"
              className="rounded-full border border-[#4A6580] px-3 py-1"
            >
              <Text className="text-[11px] font-semibold uppercase tracking-wide text-fathom-text">
                Skip
              </Text>
            </Pressable>
          ) : null}
        </View>
      </View>

      <Text className="mt-5 text-[24px] font-bold leading-7 text-fathom-text">
        {market.question}
      </Text>
      <Text className="mt-2 text-sm leading-5 text-fathom-subtext" numberOfLines={2}>
        {market.summary}
      </Text>
      <Text className="mt-2 text-sm text-fathom-subtext">
        Expiry in {formatTimeLeft(market.expiryTimestamp, now)}
      </Text>
      <View className="mt-3 rounded-2xl border border-[#24415A] bg-[#0A1A28] px-3 py-2">
        <Text className="text-xs font-semibold text-fathom-text">
          YES {signals.yesProbability}% · NO {signals.noProbability}%
        </Text>
        <Text className="mt-1 text-[11px] text-fathom-subtext" numberOfLines={1}>
          {signals.confidenceLabel}. Net: YES +{signals.yesNet} · NO +{signals.noNet}
        </Text>
      </View>

      <View className="mt-auto items-center pb-1">
        <View className="flex-row items-center gap-6">
          <Pressable
            onPress={onPressNo}
            disabled={actionsDisabled}
            accessibilityRole="button"
            accessibilityLabel="Buy NO position"
            className={`h-16 w-16 items-center justify-center rounded-full border ${
              noActive ? "border-fathom-bear bg-[#3C1924]" : "border-[#5A2332] bg-[#2A151F]"
            } ${actionsDisabled ? "opacity-60" : ""}`}
          >
            <Text
              className={`text-base font-bold ${noActive ? "text-[#FFD3DD]" : "text-fathom-bear"}`}
            >
              NO
            </Text>
          </Pressable>
          <Pressable
            onPress={onPressYes}
            disabled={actionsDisabled}
            accessibilityRole="button"
            accessibilityLabel="Buy YES position"
            className={`h-16 w-16 items-center justify-center rounded-full border ${
              yesActive ? "border-fathom-bull bg-[#0F2E24]" : "border-[#204A3B] bg-[#0F231E]"
            } ${actionsDisabled ? "opacity-60" : ""}`}
          >
            <Text
              className={`text-base font-bold ${yesActive ? "text-[#CFFFEA]" : "text-fathom-bull"}`}
            >
              YES
            </Text>
          </Pressable>
        </View>
        <Text className="mt-2 text-[11px] uppercase tracking-wide text-fathom-subtext">
          Swipe · Stake {stake} dUSDC
        </Text>
      </View>
    </View>
  );
}
