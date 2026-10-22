import type { Config } from "tailwindcss";

export default {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        brand: {
          50: "#F9FEE6",
          100: "#F0FDC4",
          200: "#E3FC8C",
          300: "#D3FB4F",
          400: "#C4FA13", // brand
          500: "#A8D90A",
          600: "#82A804",
          700: "#5E7A06",
          800: "#47590A",
          900: "#2C370A",
        },
        canvas: "#F5F5EB",
      },
      fontFamily: {
        sans: ["var(--font-geist-sans)", "ui-sans-serif", "system-ui", "sans-serif"],
      },
      fontSize: {
        xs: ["13px", "18px"],
        sm: ["14px", "20px"],
        base: ["16px", "24px"],
        lg: ["19px", "27px"],
        xl: ["23px", "30px"],
        "2xl": ["28px", "34px"],
      },
      boxShadow: {
        card: "0 1px 2px rgba(16,24,40,0.04), 0 1px 3px rgba(16,24,40,0.06)",
        pop: "0 8px 24px -6px rgba(16,24,40,0.12), 0 2px 6px rgba(16,24,40,0.06)",
        glow: "0 0 0 1px rgba(130,168,4,0.25), 0 8px 28px -8px rgba(160,210,10,0.65)",
      },
      keyframes: {
        "fade-up": { from: { opacity: "0", transform: "translateY(6px)" }, to: { opacity: "1", transform: "none" } },
      },
      animation: { "fade-up": "fade-up .35s ease-out both" },
    },
  },
  plugins: [],
} satisfies Config;
