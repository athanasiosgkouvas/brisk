import { useEffect } from "react";
import type { ReactNode } from "react";
import { Text, View } from "react-native";
import Animated, { FadeInDown } from "react-native-reanimated";

import { AnimatedCheck } from "@/components/ui/AnimatedCheck";
import { AuroraBurst } from "@/components/ui/AuroraBurst";
import { HeroAmount } from "@/components/ui/HeroAmount";
import { hapticSettleWin } from "@/utils/haptics";

/**
 * The shared "Paid ✓" celebration: an AnimatedCheck springs in, the amount
 * counts up beneath it, and a single success haptic fires on mount. Used by
 * every settlement success state (pay, charge, claim, pay-link) so the money
 * moment is identical and tunable in one place. Understated by design — one
 * spring, one haptic, no confetti.
 */
export function SuccessSheet({
  amountMicros,
  title = "Paid",
  subtitle,
  caption,
  footer,
}: {
  amountMicros: number;
  title?: string;
  /** Line directly under the amount (e.g. "to Acme Coffee"). */
  subtitle?: string;
  /** Muted note under the subtitle (e.g. "Settled on Sui in seconds — zero gas."). */
  caption?: string;
  footer?: ReactNode;
}) {
  useEffect(() => {
    void hapticSettleWin();
  }, []);

  return (
    <Animated.View entering={FadeInDown.duration(500).springify()} className="items-center">
      {/* Decorative celebratory burst behind the check (one-shot, on-brand). */}
      <View className="items-center justify-center">
        <AuroraBurst size={72} />
        <AnimatedCheck size={72} />
      </View>
      <Text className="mt-5 text-2xl font-inter-bold text-brisk-text">{title}</Text>
      <HeroAmount micros={amountMicros} tier="confirm" fromZero className="mt-1" />
      {subtitle ? <Text className="mt-1 text-base text-brisk-subtext">{subtitle}</Text> : null}
      {caption ? (
        <Text className="mt-2 text-center text-xs text-brisk-subtext">{caption}</Text>
      ) : null}
      {footer ? <View className="mt-8 w-full max-w-[360px]">{footer}</View> : null}
    </Animated.View>
  );
}
