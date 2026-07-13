import { Text, TextInput, View, type KeyboardTypeOptions } from "react-native";

import { useTheme } from "@/hooks/useTheme";

/**
 * A labeled text field matching the app's bordered input style. Used by the
 * business setup + edit forms so every field looks and behaves the same.
 */
export function LabeledInput({
  label,
  value,
  onChangeText,
  placeholder,
  required = false,
  keyboardType,
  autoCapitalize = "sentences",
  maxLength,
  autoFocus = false,
  className,
}: {
  label: string;
  value: string;
  onChangeText: (v: string) => void;
  placeholder?: string;
  required?: boolean;
  keyboardType?: KeyboardTypeOptions;
  autoCapitalize?: "none" | "sentences" | "words" | "characters";
  maxLength?: number;
  autoFocus?: boolean;
  className?: string;
}) {
  const theme = useTheme();
  return (
    <View className={className}>
      <Text className="mb-1.5 text-xs uppercase tracking-[2px] text-brisk-subtext">
        {label}
        {required ? <Text className="text-brisk-accent"> *</Text> : null}
      </Text>
      <View className="w-full flex-row items-center rounded-2xl border border-brisk-borderStrong bg-brisk-bg1/70 px-4 py-3">
        <TextInput
          className="flex-1 text-base font-inter-semibold text-brisk-text"
          style={{ padding: 0 }}
          value={value}
          onChangeText={onChangeText}
          placeholder={placeholder}
          placeholderTextColor={theme.placeholder}
          keyboardType={keyboardType}
          autoCapitalize={autoCapitalize}
          maxLength={maxLength}
          autoFocus={autoFocus}
          accessibilityLabel={label}
        />
      </View>
    </View>
  );
}
