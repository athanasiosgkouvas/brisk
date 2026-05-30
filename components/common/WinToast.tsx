import { useEffect, useRef } from "react";
import { Dimensions, Pressable, Text, View } from "react-native";
import Animated, { FadeInDown, FadeOutUp } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Sparkles } from "lucide-react-native";
import ConfettiCannon from "react-native-confetti-cannon";

import { usePortfolioStore } from "@/store/portfolioStore";

const AUTO_DISMISS_MS = 5000;

/**
 * Global win banner: slides down from the top when the portfolio store
 * picks up a new `recentWin` event (settlement polling sets this), fires
 * a one-shot confetti burst, and auto-clears after 5s. Tapping it also
 * dismisses early so the user can keep swiping.
 */
export function WinToast() {
  const insets = useSafeAreaInsets();
  const recentWin = usePortfolioStore((state) => state.recentWin);
  const clearRecentWin = usePortfolioStore((state) => state.clearRecentWin);
  const lastShownIdRef = useRef<string | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!recentWin) {
      lastShownIdRef.current = null;
      return;
    }
    if (lastShownIdRef.current === recentWin.id) return;
    lastShownIdRef.current = recentWin.id;
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      clearRecentWin();
    }, AUTO_DISMISS_MS);
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [recentWin, clearRecentWin]);

  if (!recentWin) return null;

  const screen = Dimensions.get("window");
  const payoutLabel =
    typeof recentWin.payoutMicro === "number" && recentWin.payoutMicro > 0
      ? `+$${(recentWin.payoutMicro / 1_000_000).toFixed(2)}`
      : "Settled";

  return (
    <View
      pointerEvents="box-none"
      style={{ position: "absolute", top: 0, left: 0, right: 0, zIndex: 50 }}
    >
      <ConfettiCannon
        count={120}
        origin={{ x: screen.width / 2, y: -10 }}
        fallSpeed={2600}
        explosionSpeed={420}
        fadeOut
        colors={["#00D98B", "#FFC857", "#FF6FB5", "#5AB1FF", "#FFFFFF"]}
      />
      <Animated.View
        entering={FadeInDown.duration(280)}
        exiting={FadeOutUp.duration(220)}
        pointerEvents="auto"
        style={{ marginTop: insets.top + 8, marginHorizontal: 16 }}
      >
        <Pressable onPress={clearRecentWin}>
          <View className="flex-row items-center gap-3 rounded-2xl border border-fathom-bull/40 bg-fathom-bg1 px-4 py-3 shadow-lg">
            <View className="h-9 w-9 items-center justify-center rounded-full bg-fathom-bull/15">
              <Sparkles color="#00D98B" size={18} />
            </View>
            <View className="flex-1">
              <Text className="text-xs uppercase tracking-[1.4px] text-fathom-bull">You won</Text>
              <Text
                className="text-base font-semibold text-fathom-text"
                numberOfLines={1}
                ellipsizeMode="tail"
              >
                {recentWin.asset} · {payoutLabel}
              </Text>
              <Text className="text-[11px] text-fathom-subtext">Tap Settings to claim</Text>
            </View>
          </View>
        </Pressable>
      </Animated.View>
    </View>
  );
}
