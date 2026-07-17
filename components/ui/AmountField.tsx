import { Text, TextInput, View } from "react-native";

import { useTheme } from "@/hooks/useTheme";
import { AMOUNT_FIELD } from "@/theme/scale";

/**
 * The `$`-prefixed USD amount input, shared by Charge (hero, centered) and Send
 * (compact, inline) so the two stop drifting in size. Numeric decimal-pad, themed
 * placeholder. Sizing comes from AMOUNT_FIELD.
 */
export function AmountField({
  value,
  onChangeText,
  tier = "hero",
  align = tier === "hero" ? "center" : "left",
  autoFocus = false,
}: {
  value: string;
  onChangeText: (next: string) => void;
  tier?: "hero" | "compact";
  align?: "center" | "left";
  autoFocus?: boolean;
}) {
  const theme = useTheme();
  const size = AMOUNT_FIELD[tier];
  const centered = align === "center";

  return (
    <View
      className="flex-row items-baseline"
      style={{ justifyContent: centered ? "center" : "flex-start" }}
    >
      <Text
        className="font-inter-extrabold text-brisk-subtext"
        style={{ fontSize: size.fontSize * 0.6, lineHeight: size.lineHeight }}
      >
        $
      </Text>
      <TextInput
        value={value}
        onChangeText={onChangeText}
        keyboardType="decimal-pad"
        placeholder="0.00"
        placeholderTextColor={theme.placeholder}
        autoFocus={autoFocus}
        selectionColor={theme.accent}
        className="ml-1 font-inter-extrabold text-brisk-text"
        style={{
          fontSize: size.fontSize,
          lineHeight: size.lineHeight,
          textAlign: centered ? "center" : "left",
          minWidth: centered ? 120 : 0,
          padding: 0,
        }}
      />
    </View>
  );
}
