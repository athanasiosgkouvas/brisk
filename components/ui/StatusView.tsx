import type { ComponentType, ReactNode } from "react";
import { Text, View } from "react-native";
import type { LucideProps } from "lucide-react-native";
import Animated, { FadeIn } from "react-native-reanimated";

import { HeroAmount } from "@/components/ui/HeroAmount";
import { StatusGlyph, type StatusVariant } from "@/components/ui/StatusGlyph";
import { CONTENT_MAX, DURATION, HERO_EYEBROW } from "@/theme/scale";

/**
 * The centered "status screen" scaffold shared by pay / charge / claim / pay-link
 * (preparing, awaiting, error, timeout, nfc-off, …). Standardizes the glyph +
 * eyebrow + optional amount + message + action stack that had been copy-pasted
 * ~11 times. Fades in as one block.
 */
export function StatusView({
  variant,
  Icon,
  glyphTone,
  eyebrow,
  title,
  amountMicros,
  message,
  actions,
}: {
  variant: StatusVariant;
  Icon?: ComponentType<LucideProps>;
  glyphTone?: "accent" | "subtext" | "warning";
  eyebrow?: string;
  title?: string;
  amountMicros?: number;
  message?: string;
  actions?: ReactNode;
}) {
  return (
    <Animated.View
      entering={FadeIn.duration(DURATION.fast)}
      className="flex-1 items-center justify-center px-6"
    >
      <StatusGlyph variant={variant} Icon={Icon} tone={glyphTone} />

      {eyebrow ? <Text className={`mt-6 ${HERO_EYEBROW}`}>{eyebrow}</Text> : null}

      {typeof amountMicros === "number" ? (
        <View className="mt-2">
          <HeroAmount micros={amountMicros} tier="focused" countUp={false} />
        </View>
      ) : null}

      {title ? (
        <Text className="mt-3 text-center font-inter-bold text-2xl text-brisk-text">{title}</Text>
      ) : null}

      {message ? (
        <Text className="mt-2 text-center text-base text-brisk-subtext">{message}</Text>
      ) : null}

      {actions ? (
        <View style={{ maxWidth: CONTENT_MAX, width: "100%" }} className="mt-8 gap-3">
          {actions}
        </View>
      ) : null}
    </Animated.View>
  );
}
