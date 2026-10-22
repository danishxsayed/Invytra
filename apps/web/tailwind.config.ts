import type { Config } from "tailwindcss";

export default {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        brand: {
          50: "#F3F1FF",
          100: "#E9E5FF",
          200: "#D4CCFF",
          400: "#9384FF",
          500: "#6D5BFF",
          600: "#5A45F0",
          700: "#4A36D1",
        },
      },
      fontFamily: {
        sans: ["var(--font-geist-sans)", "ui-sans-serif", "system-ui", "sans-serif"],
      },
      boxShadow: {
        card: "0 1px 2px rgba(16,24,40,0.04), 0 1px 3px rgba(16,24,40,0.06)",
        pop: "0 8px 24px -6px rgba(16,24,40,0.12), 0 2px 6px rgba(16,24,40,0.06)",
        glow: "0 0 0 1px rgba(109,91,255,0.15), 0 8px 30px -8px rgba(109,91,255,0.45)",
      },
      keyframes: {
        "fade-up": { from: { opacity: "0", transform: "translateY(6px)" }, to: { opacity: "1", transform: "none" } },
      },
      animation: { "fade-up": "fade-up .35s ease-out both" },
    },
  },
  plugins: [],
} satisfies Config;
