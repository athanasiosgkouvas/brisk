import { useEffect, useRef, useState } from "react";

import { ENV } from "@/utils/constants";
import { accruedMicros, netApyBps } from "@/services/blockchain/yieldMath";

type YieldState = {
  valueMicros: number;
  principalMicros: number;
  earnedMicros: number;
  apyBps: number;
};

/**
 * Drives the live-ticking Save value/earned counters. Between on-chain refreshes
 * it interpolates forward at the supplier-net APY (the rate the on-chain exchange
 * rate actually grows at), re-anchoring to the true on-chain value on every state
 * change — so it tracks `current_value` rather than drifting. A deposit/withdraw
 * just re-anchors to the new value. Pauses when there's no principal (nothing
 * accrues). Throttled to ~8fps to stay smooth without burning battery.
 *
 * Returns floats; callers round for whole-cent display and use formatUsdPrecise
 * for the fractional earned ticker.
 */
export function useLiveYield(state: YieldState): {
  liveValueMicros: number;
  liveEarnedMicros: number;
} {
  const net = netApyBps(state.apyBps, ENV.briskReserveFactorBps);
  // `at: 0` placeholder — the re-anchor effect sets the real timestamp on mount.
  const anchor = useRef({ value: state.valueMicros, earned: state.earnedMicros, at: 0 });
  const [live, setLive] = useState({
    liveValueMicros: state.valueMicros,
    liveEarnedMicros: state.earnedMicros,
  });

  // Re-anchor to the on-chain truth whenever it changes (refresh / deposit / withdraw).
  useEffect(() => {
    anchor.current = { value: state.valueMicros, earned: state.earnedMicros, at: Date.now() };
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLive({ liveValueMicros: state.valueMicros, liveEarnedMicros: state.earnedMicros });
  }, [state.valueMicros, state.earnedMicros]);

  useEffect(() => {
    if (state.principalMicros <= 0 || net <= 0) return; // nothing to tick
    let raf = 0;
    let lastTs = 0;
    const tick = (ts: number) => {
      raf = requestAnimationFrame(tick);
      if (ts - lastTs < 120) return; // ~8fps
      lastTs = ts;
      const a = anchor.current;
      const inc = accruedMicros(a.value, net, Date.now() - a.at);
      setLive({ liveValueMicros: a.value + inc, liveEarnedMicros: a.earned + inc });
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [state.principalMicros, net]);

  return live;
}
