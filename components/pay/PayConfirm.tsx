import type { ReactNode } from "react";
import { Pressable, Text, View } from "react-native";
import Animated, { FadeIn } from "react-native-reanimated";
import { Coins, ShieldCheck } from "lucide-react-native";

import { HeroAmount } from "@/components/ui/HeroAmount";
import { StatusGlyph } from "@/components/ui/StatusGlyph";
import { SuccessSheet } from "@/components/ui/SuccessSheet";
import { PrimaryButton } from "@/components/ui/PrimaryButton";
import { CONTENT_MAX, DURATION, HERO_EYEBROW } from "@/theme/scale";
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
  headerSlot,
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
  /** Optional element above the eyebrow, review only (e.g. a merchant avatar). */
  headerSlot?: ReactNode;
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
  if (state === "review") {
    return (
      <Animated.View
        entering={FadeIn.duration(DURATION.fast)}
        style={{ maxWidth: CONTENT_MAX }}
        className="w-full items-center"
      >
        {headerSlot ? <View className="mb-4">{headerSlot}</View> : null}
        <Text numberOfLines={1} className={HERO_EYEBROW}>
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
    const authorizing = state === "authorizing";
    return (
      <Animated.View entering={FadeIn.duration(DURATION.fast)} className="items-center">
        <StatusGlyph variant="pulse" Icon={authorizing ? ShieldCheck : Coins} />
        <Text className="mt-6 text-base text-brisk-subtext">
          {authorizing ? "Authorizing…" : settlingLabel}
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
    <Animated.View entering={FadeIn.duration(DURATION.fast)} className="items-center">
      <StatusGlyph variant="error" />
      <Text className="mt-4 text-lg font-inter-semibold text-brisk-text">{errorTitle}</Text>
      {errorMessage ? (
        <Text className="mt-1 text-center text-sm text-brisk-subtext">{errorMessage}</Text>
      ) : null}
      {errorHint ? (
        <Text className="mt-1 text-center text-xs text-brisk-subtext">{errorHint}</Text>
      ) : null}
      <View style={{ maxWidth: CONTENT_MAX }} className="mt-8 w-full">
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
