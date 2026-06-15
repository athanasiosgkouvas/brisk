import type { ReactNode } from "react";
import { Text } from "react-native";

/**
 * Field-level error line in the danger tone. (For screen-level failures use the
 * full ErrorBanner.) Renders nothing when there's no message.
 */
export function ErrorText({ children, className }: { children?: ReactNode; className?: string }) {
  if (!children) return null;
  return <Text className={`text-sm text-brisk-danger ${className ?? ""}`}>{children}</Text>;
}
