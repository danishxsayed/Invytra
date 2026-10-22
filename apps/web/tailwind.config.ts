import type { Config } from "tailwindcss";

export default {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        paper: "#F6F7F9",
        ink: { DEFAULT: "#18212F", soft: "#4A5566", faint: "#8A93A3" },
        line: "#E2E5EA",
        pine: { DEFAULT: "#0E6B57", soft: "#E3F1EC" },
        amber: { DEFAULT: "#A86A12", soft: "#F7EEDD" },
        rose: { DEFAULT: "#A3243B", soft: "#F7E4E8" },
      },
      fontFamily: {
        sans: ['"Schibsted Grotesk"', "ui-sans-serif", "system-ui", "sans-serif"],
      },
      fontSize: {
        // Modular scale (1.2) — body 15px
        xs: ["12px", "16px"],
        sm: ["13px", "18px"],
        base: ["15px", "22px"],
        lg: ["18px", "26px"],
        xl: ["22px", "28px"],
        "2xl": ["26px", "32px"],
      },
    },
  },
  plugins: [],
} satisfies Config;
