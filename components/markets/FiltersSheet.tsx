import { Modal, Pressable, ScrollView, Text, View } from "react-native";

import { MarketFilters, type MarketFilterValue } from "@/components/markets/MarketFilters";
import { ThemesStrip } from "@/components/markets/ThemesStrip";
import type { ThemeBlurb } from "@/services/api/backendApi";

type SwipeMode = "binary" | "range";

type Props = {
  visible: boolean;
  onClose: () => void;
  mode: SwipeMode;
  onSelectMode: (mode: SwipeMode) => void;
  timeframe: MarketFilterValue;
  onSelectTimeframe: (value: MarketFilterValue) => void;
  timeframeCounts: Record<MarketFilterValue, number>;
  themes: ThemeBlurb[];
  selectedThemeId: string | null;
  onSelectTheme: (themeId: string | null) => void;
};

/**
 * Modal sheet that hides the deck's filter chrome (mode toggle, timeframe
 * pills, themes strip) off-screen until the user taps the Filters button.
 * Keeps the swipe surface deck-first instead of buried under controls.
 */
export function FiltersSheet({
  visible,
  onClose,
  mode,
  onSelectMode,
  timeframe,
  onSelectTimeframe,
  timeframeCounts,
  themes,
  selectedThemeId,
  onSelectTheme,
}: Props) {
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable
        onPress={onClose}
        className="flex-1 justify-end bg-black/60"
        accessibilityRole="button"
        accessibilityLabel="Close filters"
      >
        <Pressable
          onPress={(e) => e.stopPropagation()}
          className="rounded-t-3xl border-t border-x border-[#27415A] bg-fathom-bg1 px-5 pt-4 pb-8"
        >
          <View className="mb-3 items-center">
            <View className="h-1 w-12 rounded-full bg-fathom-bg2" />
          </View>
          <Text className="text-[11px] uppercase tracking-[2px] text-fathom-subtext">Filters</Text>
          <ScrollView style={{ maxHeight: 480 }} contentContainerStyle={{ paddingTop: 12 }}>
            <Text className="text-[11px] uppercase text-fathom-subtext">Market type</Text>
            <View className="mt-2 flex-row gap-2">
              <ModeButton
                label="Binary"
                active={mode === "binary"}
                onPress={() => onSelectMode("binary")}
              />
              <ModeButton
                label="Range"
                active={mode === "range"}
                onPress={() => onSelectMode("range")}
              />
            </View>

            <Text className="mt-5 text-[11px] uppercase text-fathom-subtext">Timeframe</Text>
            <View className="mt-2">
              <MarketFilters
                selected={timeframe}
                counts={timeframeCounts}
                onSelect={onSelectTimeframe}
              />
            </View>

            {themes.length > 0 ? (
              <View className="mt-5">
                <ThemesStrip
                  themes={themes}
                  selectedThemeId={selectedThemeId}
                  onSelectTheme={onSelectTheme}
                />
              </View>
            ) : null}
          </ScrollView>

          <Pressable onPress={onClose} className="mt-4 rounded-2xl bg-fathom-bull px-4 py-3">
            <Text className="text-center text-sm font-semibold text-[#07111A]">Done</Text>
          </Pressable>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

function ModeButton({
  label,
  active,
  onPress,
}: {
  label: string;
  active: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      className={`flex-1 rounded-2xl border px-3 py-2 ${
        active ? "border-fathom-bull bg-[#0F231E]" : "border-[#24415A] bg-fathom-bg1"
      }`}
    >
      <Text
        className={`text-center text-sm font-semibold ${
          active ? "text-fathom-bull" : "text-fathom-text"
        }`}
      >
        {label}
      </Text>
    </Pressable>
  );
}
