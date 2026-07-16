/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],
  presets: [require("nativewind/preset")],
  theme: {
    extend: {
      colors: {
        // Brisk "Aurora" palette. Colors resolve to CSS variables set per-theme
        // by ThemeProvider via vars() (see theme/tokens.ts DARK_VARS/LIGHT_VARS).
        // The channel-based vars carry an <alpha-value> slot so `/80` etc. work;
        // the two glass tokens have baked alpha so reference the var directly.
        brisk: {
          bg0: "rgb(var(--brisk-bg0) / <alpha-value>)",
          bg1: "rgb(var(--brisk-bg1) / <alpha-value>)",
          bg2: "rgb(var(--brisk-bg2) / <alpha-value>)",
          accent: "rgb(var(--brisk-accent) / <alpha-value>)",
          danger: "rgb(var(--brisk-danger) / <alpha-value>)",
          text: "rgb(var(--brisk-text) / <alpha-value>)",
          subtext: "rgb(var(--brisk-subtext) / <alpha-value>)",
          border: "rgb(var(--brisk-border) / <alpha-value>)",
          borderStrong: "rgb(var(--brisk-borderStrong) / <alpha-value>)",
          borderSoft: "rgb(var(--brisk-borderSoft) / <alpha-value>)",
          placeholder: "rgb(var(--brisk-placeholder) / <alpha-value>)",
          aurora1: "rgb(var(--brisk-aurora1) / <alpha-value>)",
          aurora2: "rgb(var(--brisk-aurora2) / <alpha-value>)",
          aurora3: "rgb(var(--brisk-aurora3) / <alpha-value>)",
          glow: "rgb(var(--brisk-glow) / <alpha-value>)",
          glass: "var(--brisk-glass)",
          glassBorder: "var(--brisk-glassBorder)",
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
        // JetBrains Mono (loaded in app/_layout.tsx) for eyebrow/section labels —
        // the "precise" monospace accent that matches the site + deck.
        mono: ["JetBrainsMono_400Regular"],
        "mono-medium": ["JetBrainsMono_500Medium"],
        "mono-semibold": ["JetBrainsMono_600SemiBold"],
      },
    },
  },
  plugins: [],
};
