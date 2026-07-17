import type { ComponentType } from "react";
import { View } from "react-native";
import { XCircle, type LucideProps } from "lucide-react-native";

import { AnimatedCheck } from "@/components/ui/AnimatedCheck";
import { PulseRing } from "@/components/ui/PulseRing";
import { useTheme } from "@/hooks/useTheme";

export type StatusVariant = "neutral" | "pulse" | "error" | "success";

/**
 * The single glyph used at the top of every status screen (pay/charge/claim/…).
 * Owns the one canonical error mark and the "waiting" pulse so those aren't
 * re-implemented per screen.
 *
 *  - `neutral` — a plain icon (tint defaults to accent; pass `tone="subtext"`).
 *  - `pulse`   — the icon inside a live PulseRing (NFC waiting).
 *  - `error`   — the canonical XCircle in danger.
 *  - `success` — the aurora AnimatedCheck (Paid moment).
 */
export function StatusGlyph({
  variant,
  Icon,
  size = 64,
  tone = "accent",
}: {
  variant: StatusVariant;
  Icon?: ComponentType<LucideProps>;
  size?: number;
  tone?: "accent" | "subtext" | "warning";
}) {
  const theme = useTheme();

  if (variant === "success") return <AnimatedCheck size={size} />;
  if (variant === "error") return <XCircle color={theme.danger} size={size} />;

  const tint =
    tone === "subtext" ? theme.subtext : tone === "warning" ? theme.warning : theme.accent;

  if (variant === "pulse") {
    return (
      <PulseRing size={size} color={tint}>
        {Icon ? <Icon color={tint} size={size * 0.44} /> : null}
      </PulseRing>
    );
  }

  return (
    <View style={{ alignItems: "center", justifyContent: "center" }}>
      {Icon ? <Icon color={tint} size={size} /> : null}
    </View>
  );
}
