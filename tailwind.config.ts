import type { Config } from "tailwindcss";

// Every colour is a CSS variable (see globals.css) so light and dark themes swap in one place.
const v = (name: string) => `rgb(var(--c-${name}) / <alpha-value>)`;

const config: Config = {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        white: v("surface"), // cards, inputs, panels
        ink: { DEFAULT: v("ink"), soft: v("ink-soft") },
        paper: v("paper"), // page background
        line: v("line"),
        slate: { DEFAULT: v("slate"), light: v("slate-light") },
        cobalt: { DEFAULT: v("cobalt"), deep: v("cobalt-deep"), tint: v("cobalt-tint") },
        marigold: { DEFAULT: v("marigold"), deep: v("marigold-deep"), tint: v("marigold-tint") },
        mint: { DEFAULT: v("mint"), tint: v("mint-tint"), ink: v("mint-ink") },
        rose: { DEFAULT: v("rose"), tint: v("rose-tint") },
        onink: v("onink"), // text placed on an ink background
      },
      fontFamily: {
        display: ['"Bricolage Grotesque Variable"', "system-ui", "sans-serif"],
        sans: ['"IBM Plex Sans"', "system-ui", "sans-serif"],
      },
      keyframes: {
        pulseDot: { "0%,100%": { opacity: "1" }, "50%": { opacity: ".35" } },
        shimmer: { "0%": { backgroundPosition: "-400px 0" }, "100%": { backgroundPosition: "400px 0" } },
      },
      animation: {
        pulseDot: "pulseDot 1.6s ease-in-out infinite",
        shimmer: "shimmer 1.4s linear infinite",
      },
    },
  },
  plugins: [],
};
export default config;
