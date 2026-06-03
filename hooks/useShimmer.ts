import { useEffect } from "react";
import {
  Easing,
  useSharedValue,
  withRepeat,
  withTiming,
  type SharedValue,
} from "react-native-reanimated";

/**
 * A looping 0→1 progress value for shimmer/sheen sweeps (success states,
 * loading skeletons). Drive a translateX off the returned shared value.
 */
export function useShimmer(durationMs = 1500): SharedValue<number> {
  const progress = useSharedValue(0);
  useEffect(() => {
    progress.value = withRepeat(
      withTiming(1, { duration: durationMs, easing: Easing.linear }),
      -1,
      false,
    );
  }, [progress, durationMs]);
  return progress;
}
