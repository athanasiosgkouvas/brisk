import type { ReactNode } from "react";
import { Text, View } from "react-native";

import { SECTION_LABEL } from "@/theme/scale";

/**
 * Uppercase tracked section header (e.g. "ACTIVITY", "YOUR MONEY"). Pass `action`
 * to render a right-aligned affordance (e.g. a "Manage" link) on the same row.
 */
export function SectionLabel({
  children,
  action,
  className,
}: {
  children: ReactNode;
  action?: ReactNode;
  className?: string;
}) {
  if (action) {
    return (
      <View className={`flex-row items-center justify-between ${className ?? ""}`}>
        <Text className={SECTION_LABEL}>{children}</Text>
        {action}
      </View>
    );
  }
  return <Text className={`${SECTION_LABEL} ${className ?? ""}`}>{children}</Text>;
}
