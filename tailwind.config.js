/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],
  presets: [require("nativewind/preset")],
  theme: {
    extend: {
      colors: {
        // Brisk palette. `fathom` is kept as an alias so reused components
        // (AuthGateScreen, ErrorBanner, etc.) still resolve their classes.
        brisk: {
          bg0: "#07111A",
          bg1: "#0D1722",
          bg2: "#13202E",
          accent: "#00D98B",
          danger: "#FF5A76",
          text: "#F5F7FA",
          subtext: "#8B98A5",
        },
        fathom: {
          bg0: "#07111A",
          bg1: "#0D1722",
          bg2: "#13202E",
          bull: "#00D98B",
          bear: "#FF5A76",
          text: "#F5F7FA",
          subtext: "#8B98A5",
        },
      },
    },
  },
  plugins: [],
};
