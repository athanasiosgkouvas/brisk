import { useEffect, useState } from "react";

import { AuroraText } from "@/components/ui/AuroraText";
import { useCountUp } from "@/hooks/useCountUp";
import { formatUsd } from "@/services/blockchain/paymentTx";
import { HERO, type HeroTier } from "@/theme/scale";

/**
 * The hero USD numeral, filled with the aurora gradient and (by default) counting
 * up to its value. Standardizes hero sizing via the `tier` scale so the same
 * role is the same size everywhere (primary balance / focused review / confirm).
 *
 * `fromZero` animates 0 → value when the component first appears (the premium
 * "balance landing" / "Paid" moment, where the element mounts fresh). Without
 * it, the value only count-ups when it later changes (e.g. a balance refresh).
 */
export function HeroAmount({
  micros,
  tier = "primary",
  countUp = true,
  fromZero = false,
  className,
}: {
  micros: number;
  tier?: HeroTier;
  countUp?: boolean;
  fromZero?: boolean;
  className?: string;
}) {
  const [target, setTarget] = useState(fromZero ? 0 : micros);
  useEffect(() => {
    // Drive the count-up: starting at 0 (fromZero) animates 0 → value on first
    // appearance; otherwise this re-anchors when the value later changes.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setTarget(micros);
  }, [micros]);
  const shown = useCountUp(target);
  const value = countUp ? Math.round(shown) : micros;
  return (
    <AuroraText className={`font-inter-extrabold ${className ?? ""}`} style={HERO[tier]}>
      {formatUsd(value)}
    </AuroraText>
  );
}
