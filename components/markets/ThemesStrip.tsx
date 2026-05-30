import { Pressable, ScrollView, Text, View } from "react-native";

import type { ThemeBlurb } from "@/services/api/backendApi";

type Props = {
  themes: ThemeBlurb[];
  selectedThemeId: string | null;
  onSelectTheme: (themeId: string | null) => void;
};

/**
 * Compact horizontally-scrolling strip of theme chips. Tapping a chip filters
 * the deck to that theme's marketIds; tapping the active chip clears it.
 * Themes are sourced from /api/themes/active and refresh as the indexer
 * surfaces new oracles.
 */
export function ThemesStrip({ themes, selectedThemeId, onSelectTheme }: Props) {
  if (themes.length === 0) return null;

  return (
    <View>
      <Text className="mb-2 text-[11px] uppercase tracking-wide text-fathom-subtext">
        Themes · {themes.length}
      </Text>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={{ gap: 8, paddingRight: 4 }}
      >
        {themes.map((t) => {
          const active = t.id === selectedThemeId;
          return (
            <Pressable
              key={t.id}
              onPress={() => onSelectTheme(active ? null : t.id)}
              className={`min-w-[180px] max-w-[220px] rounded-2xl border px-3 py-2 ${
                active ? "border-fathom-bull bg-[#0F231E]" : "border-[#24415A] bg-fathom-bg1"
              }`}
            >
              <Text
                className={`text-sm font-semibold ${
                  active ? "text-fathom-bull" : "text-fathom-text"
                }`}
              >
                {t.emoji} {t.name}
              </Text>
              <Text className="mt-1 text-[11px] leading-4 text-fathom-subtext" numberOfLines={2}>
                {t.blurb}
              </Text>
              <Text className="mt-1 text-[10px] uppercase tracking-wide text-fathom-subtext">
                {t.marketCount} live
              </Text>
            </Pressable>
          );
        })}
      </ScrollView>
    </View>
  );
}
