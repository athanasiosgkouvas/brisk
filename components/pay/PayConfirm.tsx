import type { ReactNode } from "react";
import { ActivityIndicator, Pressable, Text, View } from "react-native";
import Animated, { FadeIn } from "react-native-reanimated";
import { XCircle } from "lucide-react-native";

import { HeroAmount } from "@/components/ui/HeroAmount";
import { SuccessSheet } from "@/components/ui/SuccessSheet";
import { PrimaryButton } from "@/components/ui/PrimaryButton";
import { useTheme } from "@/hooks/useTheme";
import type { PayFlowState } from "@/hooks/usePayFlow";

/**
 * The shared pay "tail" UI — review → authorizing/settling → done → error —
 * driven by `usePayFlow`'s `state`. Renders centered content only; the calling
 * screen supplies the surrounding scaffold (AuroraBackground / Screen). Every
 * pay entry point (Send, NFC Pay, pay-link) renders this so the money moment is
 * identical and tunable in one place.
 */
export function PayConfirm({
  state,
  amountMicros,
  eyebrow = "Pay",
  payeeLabel,
  reviewNote,
  reviewSlot,
  confirmLabel,
  onConfirm,
  onCancel,
  cancelLabel = "Cancel",
  settlingLabel = "Settling on Sui…",
  success,
  errorMessage,
  errorTitle = "That didn’t go through",
  errorHint,
  onRetry,
  retryLabel = "Try again",
  onErrorClose,
}: {
  state: PayFlowState;
  amountMicros: number;
  /** Uppercase label above the amount ("Pay" | "Send"). */
  eyebrow?: string;
  /** Line under the amount ("to Acme Coffee" | truncated address). */
  payeeLabel?: string;
  /** Optional note under the payee line, review only (e.g. "already paid"). */
  reviewNote?: ReactNode;
  /** Optional extra review controls, review only (e.g. gift-card toggle). */
  reviewSlot?: ReactNode;
  confirmLabel: string;
  onConfirm: () => void;
  onCancel: () => void;
  cancelLabel?: string;
  settlingLabel?: string;
  success: { title?: string; subtitle?: string; caption?: string; footer?: ReactNode };
  errorMessage?: string | null;
  errorTitle?: string;
  errorHint?: string;
  onRetry: () => void;
  retryLabel?: string;
  /** When provided, a secondary ghost "Close" under the retry on the error state. */
  onErrorClose?: () => void;
}) {
  const theme = useTheme();

  if (state === "review") {
    return (
      <Animated.View entering={FadeIn.duration(300)} className="w-full max-w-[360px] items-center">
        <Text numberOfLines={1} className="text-sm uppercase tracking-[2px] text-brisk-subtext">
          {eyebrow}
        </Text>
        <HeroAmount micros={amountMicros} tier="focused" countUp={false} className="mt-2" />
        {payeeLabel ? (
          <Text className="mt-2 text-base text-brisk-subtext">{payeeLabel}</Text>
        ) : null}
        {reviewNote}
        {reviewSlot}
        <View className="mt-8 w-full">
          <PrimaryButton label={confirmLabel} onPress={onConfirm} />
          <Pressable className="mt-3 py-3" onPress={onCancel}>
            <Text className="text-center text-sm text-brisk-subtext">{cancelLabel}</Text>
          </Pressable>
        </View>
      </Animated.View>
    );
  }

  if (state === "authorizing" || state === "settling") {
    return (
      <Animated.View entering={FadeIn.duration(300)} className="items-center">
        <ActivityIndicator color={theme.accent} size="large" />
        <Text className="mt-4 text-sm text-brisk-subtext">
          {state === "authorizing" ? "Authorizing…" : settlingLabel}
        </Text>
      </Animated.View>
    );
  }

  if (state === "done") {
    return (
      <SuccessSheet
        amountMicros={amountMicros}
        title={success.title}
        subtitle={success.subtitle}
        caption={success.caption}
        footer={success.footer}
      />
    );
  }

  // error
  return (
    <Animated.View entering={FadeIn.duration(300)} className="items-center">
      <XCircle color={theme.danger} size={64} />
      <Text className="mt-4 text-lg font-inter-semibold text-brisk-text">{errorTitle}</Text>
      {errorMessage ? (
        <Text className="mt-1 text-center text-sm text-brisk-subtext">{errorMessage}</Text>
      ) : null}
      {errorHint ? (
        <Text className="mt-1 text-center text-xs text-brisk-subtext">{errorHint}</Text>
      ) : null}
      <View className="mt-8 w-full max-w-[360px]">
        <PrimaryButton label={retryLabel} onPress={onRetry} />
        {onErrorClose ? (
          <Pressable className="mt-3 py-3" onPress={onErrorClose}>
            <Text className="text-center text-sm text-brisk-subtext">Close</Text>
          </Pressable>
        ) : null}
      </View>
    </Animated.View>
  );
}
