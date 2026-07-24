import { memo, type ReactNode } from "react";
import { Pressable, Text, View } from "react-native";
import Animated from "react-native-reanimated";
import { ChevronRight, type LucideIcon } from "lucide-react-native";

import { GlassCard } from "@/components/ui/GlassCard";
import { usePressScale } from "@/hooks/usePressScale";
import { useTheme } from "@/hooks/useTheme";
import { ICON } from "@/theme/scale";

/**
 * Standard money-list row: leading icon + title/subtitle + trailing value or
 * chevron, on a flat GlassCard (blur off for list scroll perf). `children`
 * renders below the row (e.g. an inline action button). Use everywhere an
 * icon+label+value row appears so they're pixel-identical.
 */
function ListRowImpl({
  icon: Icon,
  iconColor,
  leading,
  title,
  subtitle,
  value,
  valueClassName = "text-brisk-text",
  onPress,
  chevron = false,
  trailing,
  children,
}: {
  icon?: LucideIcon;
  iconColor?: string;
  /** Custom leading element (overrides `icon`) — e.g. an icon wrapped in PulseRing. */
  leading?: ReactNode;
  title: string;
  subtitle?: string;
  value?: string;
  valueClassName?: string;
  onPress?: () => void;
  chevron?: boolean;
  trailing?: ReactNode;
  children?: ReactNode;
}) {
  const theme = useTheme();
  const { animatedStyle, onPressIn, onPressOut } = usePressScale();
  const lead =
    leading ?? (Icon ? <Icon color={iconColor ?? theme.accent} size={ICON.row} /> : null);
  const body = (
    <GlassCard className="px-4 py-4" blur={false}>
      <View className="flex-row items-center">
        {lead}
        <View className={`flex-1 ${lead ? "ml-3" : ""}`}>
          <Text className="text-base font-inter-semibold text-brisk-text">{title}</Text>
          {subtitle ? <Text className="text-xs text-brisk-subtext">{subtitle}</Text> : null}
        </View>
        {value ? (
          <Text className={`text-base font-inter-bold ${valueClassName}`}>{value}</Text>
        ) : null}
        {trailing}
        {chevron ? <ChevronRight color={theme.subtext} size={ICON.inlineAction} /> : null}
      </View>
      {children}
    </GlassCard>
  );

  if (onPress) {
    return (
      <Animated.View style={animatedStyle}>
        <Pressable
          onPress={onPress}
          onPressIn={onPressIn}
          onPressOut={onPressOut}
          accessibilityRole="button"
          accessibilityLabel={title}
        >
          {body}
        </Pressable>
      </Animated.View>
    );
  }
  return body;
}

// Memoized so a ticking sibling (live-yield value) or a parent poll re-render
// doesn't repaint every static row. Rows with inline onPress/children props still
// re-render (new prop identity), which is fine — the win is the stable ones.
export const ListRow = memo(ListRowImpl);
