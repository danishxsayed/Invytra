import { GeistSans } from "geist/font/sans";
import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: "Invytra", template: "%s · Invytra" },
  description: "LinkedIn outreach that runs itself — safely.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    // suppressHydrationWarning: browser extensions (e.g. ColorZilla's cz-shortcut-listen)
    // add attributes to <html>/<body> before React loads. Only affects these two tags.
    <html lang="en" className={GeistSans.variable} suppressHydrationWarning>
      <body className="min-h-screen font-sans text-base" suppressHydrationWarning>
        {children}
      </body>
    </html>
  );
}
