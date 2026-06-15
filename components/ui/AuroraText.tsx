import type { ReactNode } from "react";
import { Text, type StyleProp, type TextStyle } from "react-native";
import MaskedView from "@react-native-masked-view/masked-view";
import { LinearGradient } from "expo-linear-gradient";

import { BRISK } from "@/theme/tokens";

/**
 * Renders text filled with the aurora gradient (emerald→blue→violet). Use for a
 * handful of HERO numerals/wordmarks only (balance, Paid amounts, BRISK logo) —
 * MaskedView is per-instance expensive, so never put this inside list rows.
 *
 * The visible mask is a real <Text>, so it keeps exact RN text metrics + Inter.
 */
export function AuroraText({
  children,
  className,
  style,
  colors = BRISK.aurora,
}: {
  children: ReactNode;
  className?: string;
  style?: StyleProp<TextStyle>;
  colors?: readonly [string, string, ...string[]];
}) {
  return (
    <MaskedView
      maskElement={
        <Text className={className} style={style}>
          {children}
        </Text>
      }
    >
      <LinearGradient colors={colors} start={{ x: 0, y: 0.5 }} end={{ x: 1, y: 0.5 }}>
        {/* Invisible copy sizes the gradient to the text bounds. */}
        <Text className={className} style={[style, { opacity: 0 }]}>
          {children}
        </Text>
      </LinearGradient>
    </MaskedView>
  );
}
