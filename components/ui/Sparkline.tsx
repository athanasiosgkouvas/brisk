import Svg, { Circle, Defs, LinearGradient, Path, Stop } from "react-native-svg";

import { BRISK } from "@/theme/tokens";

/**
 * A minimal growth sparkline: a stroked line over a soft aurora-gradient area
 * fill. Purely presentational — the caller supplies `points` (e.g. the accrual
 * curve). Scales to its container width via the viewBox. Set `endDot` to mark
 * the current value with a glowing terminal dot ("live, right now").
 */
export function Sparkline({
  points,
  width = 320,
  height = 64,
  color = BRISK.accent,
  endDot = false,
}: {
  points: number[];
  width?: number;
  height?: number;
  color?: string;
  endDot?: boolean;
}) {
  if (points.length < 2) return null;
  const min = Math.min(...points);
  const max = Math.max(...points);
  const range = max - min || 1;
  const stepX = width / (points.length - 1);
  // Leave 3px padding top/bottom so the stroke isn't clipped.
  const y = (p: number) => height - 3 - ((p - min) / range) * (height - 6);
  const line = points
    .map((p, i) => `${i === 0 ? "M" : "L"} ${(i * stepX).toFixed(1)} ${y(p).toFixed(1)}`)
    .join(" ");
  const area = `${line} L ${width} ${height} L 0 ${height} Z`;

  return (
    <Svg width="100%" height={height} viewBox={`0 0 ${width} ${height}`}>
      <Defs>
        <LinearGradient id="sparkfill" x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0" stopColor={color} stopOpacity="0.22" />
          <Stop offset="1" stopColor={color} stopOpacity="0" />
        </LinearGradient>
      </Defs>
      <Path d={area} fill="url(#sparkfill)" />
      <Path
        d={line}
        stroke={color}
        strokeWidth="2"
        fill="none"
        strokeLinejoin="round"
        strokeLinecap="round"
      />
      {endDot
        ? (() => {
            const cx = Math.min((points.length - 1) * stepX, width - 6);
            const cy = y(points[points.length - 1]);
            return (
              <>
                <Circle cx={cx} cy={cy} r={6} fill={color} fillOpacity={0.18} />
                <Circle cx={cx} cy={cy} r={3} fill={color} />
              </>
            );
          })()
        : null}
    </Svg>
  );
}
