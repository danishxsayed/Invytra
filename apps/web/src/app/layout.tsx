import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: "Invytra", template: "%s · Invytra" },
  description: "LinkedIn outreach that runs itself — safely.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        <link
          rel="stylesheet"
          href="https://fonts.googleapis.com/css2?family=Schibsted+Grotesk:wght@400;500;600;700&display=swap"
        />
      </head>
      <body className="min-h-screen font-sans text-base">{children}</body>
    </html>
  );
}
