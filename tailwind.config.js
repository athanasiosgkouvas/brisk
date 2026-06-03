/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],
  presets: [require("nativewind/preset")],
  theme: {
    extend: {
      colors: {
        // Brisk "Aurora" palette. Mirror any change in theme/tokens.ts (BRISK).
        brisk: {
          bg0: "#060912",
          bg1: "#0E1422",
          bg2: "#161E30",
          accent: "#00E5A0",
          danger: "#FF5D77",
          text: "#F4F8FB",
          subtext: "#8FA0B5",
          // Named tokens that replace scattered inline hex.
          border: "#1C2A3A",
          borderStrong: "#2C3E55",
          borderSoft: "#27415A",
          placeholder: "#5A6B7B",
          // Aurora gradient stops + glow/glass surfaces.
          aurora1: "#00E5A0",
          aurora2: "#2E8FFF",
          aurora3: "#8B5CF6",
          glow: "#2E8FFF",
          glass: "rgba(20,28,46,0.55)",
          glassBorder: "rgba(255,255,255,0.08)",
        },
      },
      // Inter weights (loaded in app/_layout.tsx). RN maps a font by family
      // NAME, not by fontWeight, so a single-weight TTF won't respond to the
      // `font-bold` weight utility. We use distinct family classes
      // (font-inter-bold → Inter_700Bold) to avoid colliding with Tailwind's
      // fontWeight utilities, and set Inter_400Regular as the global default
      // (Text defaultProps in AppProviders) so all body text is Inter.
      fontFamily: {
        inter: ["Inter_400Regular"],
        "inter-medium": ["Inter_500Medium"],
        "inter-semibold": ["Inter_600SemiBold"],
        "inter-bold": ["Inter_700Bold"],
        "inter-extrabold": ["Inter_800ExtraBold"],
      },
    },
  },
  plugins: [],
};
