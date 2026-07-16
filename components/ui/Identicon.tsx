import { Text, View } from "react-native";
import { LinearGradient } from "expo-linear-gradient";

// On-brand emerald/teal gradient pairs. A counterparty address deterministically
// maps to one pair, so every address gets a stable identity in the feed — still
// distinguishable per address, but kept within the emerald signature (no blue/violet).
const PAIRS: [string, string][] = [
  ["#00E5A0", "#17C79C"],
  ["#34E7C0", "#0FB88C"],
  ["#2FD3A6", "#00C48A"],
  ["#3BE8C4", "#14B893"],
  ["#00D98B", "#1EA97C"],
  ["#4DE3B0", "#0AA97E"],
  ["#22E0B8", "#0EC38F"],
  ["#5CEAC0", "#12B58E"],
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
