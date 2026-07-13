import { Text, View } from "react-native";
import { LinearGradient } from "expo-linear-gradient";

// On-brand aurora gradient pairs. A counterparty address deterministically maps
// to one pair, so every address gets a stable, colorful identity in the feed —
// premium fintech feel, derived purely from the address (no new data).
const PAIRS: [string, string][] = [
  ["#00E5A0", "#2E8FFF"],
  ["#2E8FFF", "#8B5CF6"],
  ["#00E5A0", "#8B5CF6"],
  ["#00D0C0", "#2E8FFF"],
  ["#5B8DEF", "#8B5CF6"],
  ["#00E5A0", "#00B4D8"],
  ["#7C5CFF", "#2E8FFF"],
  ["#12C2A8", "#3AA0FF"],
];

function hashSeed(seed: string): number {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/**
 * A deterministic aurora gradient disc for an address/seed, with an optional
 * initial (e.g. the first letter of a resolved business name). Gives the
 * activity feed a stable per-counterparty identity without any new data.
 */
export function Identicon({
  seed,
  size = 44,
  label,
}: {
  seed: string;
  size?: number;
  label?: string;
}) {
  const pair = PAIRS[hashSeed(seed || "?") % PAIRS.length];
  // Rotate the gradient angle by the hash too, for extra per-seed variety.
  const flip = (hashSeed(seed) >> 3) % 2 === 0;
  return (
    <View style={{ width: size, height: size, borderRadius: size / 2, overflow: "hidden" }}>
      <LinearGradient
        colors={pair}
        start={{ x: flip ? 1 : 0, y: 0 }}
        end={{ x: flip ? 0 : 1, y: 1 }}
        style={{ flex: 1, alignItems: "center", justifyContent: "center" }}
      >
        {label ? (
          <Text className="font-inter-bold" style={{ color: "#060912", fontSize: size * 0.42 }}>
            {label.toUpperCase()}
          </Text>
        ) : null}
      </LinearGradient>
    </View>
  );
}
