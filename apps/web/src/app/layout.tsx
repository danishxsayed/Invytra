import { GeistSans } from "geist/font/sans";
import type { Metadata } from "next";
import { SITE } from "@/lib/site";
import "./globals.css";

export const metadata: Metadata = {
  metadataBase: new URL(SITE.url),
  title: { default: "Invytra", template: "%s · Invytra" },
  description: "LinkedIn outreach at a human pace: invites, messages and follow-ups inside safe daily limits, stopping when someone replies.",
  openGraph: { siteName: "Invytra", type: "website" },
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
