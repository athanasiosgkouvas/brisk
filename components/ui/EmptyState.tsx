import type { ReactNode } from "react";
import { Text, View } from "react-native";
import type { LucideIcon } from "lucide-react-native";

import { useTheme } from "@/hooks/useTheme";

/**
 * Centered empty state: icon + optional headline + subtext + optional CTA.
 * Standardizes the "nothing here yet" moment across Activity, gift cards, tills,
 * links, so none of them are bare text.
 */
export function EmptyState({
  icon: Icon,
  title,
  subtitle,
  action,
}: {
  icon: LucideIcon;
  title?: string;
  subtitle: string;
  action?: ReactNode;
}) {
  const theme = useTheme();
  return (
    <View className="flex-1 items-center justify-center px-8 py-10">
      <Icon color={theme.subtext} size={48} />
      {title ? (
        <Text className="mt-4 text-center text-base font-inter-semibold text-brisk-text">
          {title}
        </Text>
      ) : null}
      <Text className="mt-2 text-center text-sm text-brisk-subtext">{subtitle}</Text>
      {action ? <View className="mt-5">{action}</View> : null}
    </View>
  );
}
