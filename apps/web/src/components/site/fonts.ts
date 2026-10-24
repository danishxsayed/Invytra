import localFont from "next/font/local";

/** Headlines on the public site. SIL Open Font License (see src/fonts/BricolageGrotesque-OFL.txt). */
export const display = localFont({
  src: "../../fonts/BricolageGrotesque-latin.woff2",
  variable: "--font-display",
  weight: "200 800",
  display: "swap",
});
