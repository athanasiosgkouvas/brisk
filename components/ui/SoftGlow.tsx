import { useId } from "react";
import { View, type StyleProp, type ViewStyle } from "react-native";
import Svg, { Defs, RadialGradient, Rect, Stop } from "react-native-svg";

/**
 * A soft radial glow (opaque center → transparent edge) — the same ambient-light
 * language as AuroraBackground, for placing behind icons/cards. Drop it as an
 * absolutely-positioned layer; it's non-interactive.
 */
export function SoftGlow({
  color,
  size,
  opacity = 0.5,
  style,
}: {
  color: string;
  size: number;
  opacity?: number;
  style?: StyleProp<ViewStyle>;
}) {
  // Unique, SVG-safe gradient id per instance.
  const id = "sg" + useId().replace(/[^a-zA-Z0-9]/g, "");
  return (
    <View pointerEvents="none" style={[{ width: size, height: size }, style]}>
      <Svg width={size} height={size}>
        <Defs>
          <RadialGradient id={id} cx="50%" cy="50%" r="50%">
            <Stop offset="0%" stopColor={color} stopOpacity={opacity} />
            <Stop offset="55%" stopColor={color} stopOpacity={opacity * 0.35} />
            <Stop offset="100%" stopColor={color} stopOpacity={0} />
          </RadialGradient>
        </Defs>
        <Rect x="0" y="0" width={size} height={size} fill={`url(#${id})`} />
      </Svg>
    </View>
  );
}
