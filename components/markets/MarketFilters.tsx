import { Pressable, Text, View } from "react-native";

import type { MarketTimeframe } from "@/types/market";

export type MarketFilterValue = MarketTimeframe;

type Props = {
  selected: MarketFilterValue;
  counts: Record<MarketFilterValue, number>;
  onSelect: (value: MarketFilterValue) => void;
};

export const TIMEFRAME_FILTERS: MarketFilterValue[] = ["Quick", "Today", "Week", "Month"];

export const TIMEFRAME_WINDOW_MS: Record<MarketTimeframe, number> = {
  Quick: 60 * 60 * 1_000, // ≤1h
  Today: 24 * 60 * 60 * 1_000, // ≤24h
  Week: 7 * 24 * 60 * 60 * 1_000,
  Month: 30 * 24 * 60 * 60 * 1_000,
};

export function MarketFilters({ selected, counts, onSelect }: Props) {
  return (
    <View className="flex-row flex-wrap gap-2">
      {TIMEFRAME_FILTERS.map((filter) => {
        const active = filter === selected;
        return (
          <Pressable
            key={filter}
            onPress={() => onSelect(filter)}
            className={`rounded-full border px-3 py-2 ${
              active ? "border-fathom-bull bg-[#0F231E]" : "border-[#24415A] bg-fathom-bg1"
            }`}
          >
            <Text
              className={`text-xs font-semibold ${active ? "text-fathom-bull" : "text-fathom-text"}`}
            >
              {filter} · {counts[filter] ?? 0}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}
