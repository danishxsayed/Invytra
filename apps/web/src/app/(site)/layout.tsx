import { SiteFooter } from "@/components/site/SiteFooter";
import { SiteHeader } from "@/components/site/SiteHeader";
import { display } from "@/components/site/fonts";

export default function SiteLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className={`${display.variable} flex min-h-screen flex-col`}>
      <SiteHeader />
      <main className="flex-1">{children}</main>
      <SiteFooter />
    </div>
  );
}
