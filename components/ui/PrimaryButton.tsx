import { ActivityIndicator, Pressable, Text } from "react-native";

type Props = {
  label: string;
  onPress: () => void;
  loading?: boolean;
  disabled?: boolean;
  variant?: "primary" | "secondary";
};

export function PrimaryButton({
  label,
  onPress,
  loading = false,
  disabled = false,
  variant = "primary",
}: Props) {
  const inactive = loading || disabled;
  const bgClass = inactive
    ? "bg-slate-700"
    : variant === "secondary"
      ? "bg-brisk-bg2 border border-[#2C3E55]"
      : "bg-brisk-accent";
  const textClass = variant === "secondary" ? "text-brisk-text" : "text-[#07111A]";

  return (
    <Pressable
      onPress={onPress}
      disabled={inactive}
      className={`items-center justify-center rounded-2xl px-4 py-3 ${bgClass}`}
    >
      {loading ? (
        <ActivityIndicator color={variant === "secondary" ? "#F5F7FA" : "#07111A"} />
      ) : (
        <Text className={`font-semibold ${textClass}`}>{label}</Text>
      )}
    </Pressable>
  );
}
