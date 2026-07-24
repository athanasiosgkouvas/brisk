import { memo } from "react";

import { HeroAmount } from "@/components/ui/HeroAmount";
import { useLiveYield } from "@/hooks/useLiveYield";
import type { HeroTier } from "@/theme/scale";

type YieldState = Parameters<typeof useLiveYield>[0];

/**
 * A HeroAmount whose value ticks live with Save yield — isolated in its own leaf
 * so the ~8fps `useLiveYield` tick repaints ONLY this numeral, not the whole
 * screen tree it sits in (the ScrollView, mapped activity rows, buttons, etc.).
 *
 * `baseMicros` is any static balance added on top of the live Save value — e.g.
 * treasury + receiving accounts for the Pro "Total balance" hero. Count-up is off
 * by construction (see HeroAmount): the ticker already interpolates smoothly, and
 * a count-up on a value that changes every tick would never settle.
 */
export const LiveHeroAmount = memo(function LiveHeroAmount({
  save,
  baseMicros = 0,
  tier = "primary",
  className,
}: {
  save: YieldState;
  baseMicros?: number;
  tier?: HeroTier;
  className?: string;
}) {
  const { liveValueMicros } = useLiveYield(save);
  return (
    <HeroAmount
      micros={baseMicros + Math.round(liveValueMicros)}
      tier={tier}
      countUp={false}
      className={className}
    />
  );
});
