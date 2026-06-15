import type { ReactNode } from "react";
import { Pressable, ScrollView, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { X } from "lucide-react-native";

import { AuroraBackground } from "@/components/ui/AuroraBackground";
import { useTabBarClearance } from "@/hooks/useTabBarClearance";
import { useTheme } from "@/hooks/useTheme";
import { ICON } from "@/theme/scale";

/**
 * The universal screen scaffold: bg → AuroraBackground → SafeAreaView → a
 * standardized header. Every modal/screen uses this so chrome (title placement,
 * close-X, padding, background) is identical and can't drift.
 *
 * - `title` + `onClose` render the standard header (left title, right close X).
 *   Omit both for a full-bleed status screen (e.g. tap-to-pay).
 * - `headerLeft`/`headerRight` override either side (e.g. a mode pill + gear).
 * - `bottomInset="tabbar"` reserves floating-tab clearance so content can't hide
 *   behind the pill tab bar; or pass a number for a fixed bottom pad.
 */
export function Screen({
  children,
  title,
  onClose,
  headerLeft,
  headerRight,
  scroll = false,
  bottomInset,
  intensity = "subtle",
  contentClassName,
}: {
  children: ReactNode;
  title?: string;
  onClose?: () => void;
  headerLeft?: ReactNode;
  headerRight?: ReactNode;
  scroll?: boolean;
  bottomInset?: "tabbar" | number;
  intensity?: "subtle" | "vivid";
  contentClassName?: string;
}) {
  const theme = useTheme();
  const tabClearance = useTabBarClearance();
  const padBottom =
    bottomInset === "tabbar" ? tabClearance : typeof bottomInset === "number" ? bottomInset : 0;

  const hasHeader = title != null || onClose != null || headerLeft != null || headerRight != null;

  const header = hasHeader ? (
    <View className="flex-row items-center justify-between py-4">
      {headerLeft ??
        (title ? (
          <Text className="text-lg font-inter-bold text-brisk-text">{title}</Text>
        ) : (
          <View />
        ))}
      {headerRight ??
        (onClose ? (
          <Pressable
            onPress={onClose}
            hitSlop={12}
            accessibilityRole="button"
            accessibilityLabel="Close"
          >
            <X color={theme.subtext} size={ICON.header} />
          </Pressable>
        ) : null)}
    </View>
  ) : null;

  return (
    <View className="flex-1 bg-brisk-bg0">
      <AuroraBackground intensity={intensity}>
        <SafeAreaView edges={["top"]} className="flex-1 px-5">
          {header}
          {scroll ? (
            <ScrollView
              showsVerticalScrollIndicator={false}
              contentContainerStyle={{ paddingBottom: padBottom }}
              className={contentClassName}
            >
              {children}
            </ScrollView>
          ) : (
            <View
              className={`flex-1 ${contentClassName ?? ""}`}
              style={padBottom ? { paddingBottom: padBottom } : undefined}
            >
              {children}
            </View>
          )}
        </SafeAreaView>
      </AuroraBackground>
    </View>
  );
}
