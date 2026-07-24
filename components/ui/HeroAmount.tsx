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
 *
 * When `countUp` is false we render a plain (non-counting) numeral and DON'T mount
 * the count-up machinery — important for the live-ticking Save value, which
 * changes ~8fps: a count-up there would re-anchor every tick, firing needless
 * rAF work + re-renders for an animation that could never settle.
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
  const heroClassName = `font-inter-extrabold ${className ?? ""}`;
  if (!countUp) {
    return (
      <AuroraText className={heroClassName} style={HERO[tier]}>
        {formatUsd(micros)}
      </AuroraText>
    );
  }
  return (
    <CountingHeroAmount
      micros={micros}
      fromZero={fromZero}
      className={heroClassName}
      style={HERO[tier]}
    />
  );
}

/** The counting variant — isolates the count-up hooks so the static path above
 *  never mounts them. AuroraText is memoized, so the per-frame re-render here only
 *  repaints the MaskedView when the displayed (whole-cent) string actually changes. */
function CountingHeroAmount({
  micros,
  fromZero,
  className,
  style,
}: {
  micros: number;
  fromZero: boolean;
  className: string;
  style: (typeof HERO)[HeroTier];
}) {
  const [target, setTarget] = useState(fromZero ? 0 : micros);
  useEffect(() => {
    // Re-anchor the count-up: 0 → value on first appearance (fromZero), or to the
    // new value when it later changes (e.g. a balance refresh).
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setTarget(micros);
  }, [micros]);
  const shown = useCountUp(target);
  return (
    <AuroraText className={className} style={style}>
      {formatUsd(Math.round(shown))}
    </AuroraText>
  );
}
