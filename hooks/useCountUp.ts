import { useEffect, useRef, useState } from "react";

/**
 * Smooth numeric count-up using requestAnimationFrame + easeOutCubic.
 * Animates from the previously-displayed target to `target` over
 * `durationMs` whenever `target` changes. Cheap, JS-only, no Reanimated
 * dependency.
 */
export function useCountUp(target: number, durationMs = 800): number {
  const [value, setValue] = useState(target);
  const prevTargetRef = useRef(target);
  const rafRef = useRef<number | null>(null);

  useEffect(() => {
    if (!Number.isFinite(target)) return;
    const from = prevTargetRef.current;
    prevTargetRef.current = target;
    if (target === from) return;

    let start: number | null = null;
    const tick = (ts: number) => {
      if (start === null) start = ts;
      const elapsed = ts - start;
      const t = Math.min(elapsed / durationMs, 1);
      const eased = 1 - Math.pow(1 - t, 3);
      setValue(from + (target - from) * eased);
      if (t < 1) rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);

    return () => {
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
    };
  }, [target, durationMs]);

  return value;
}
