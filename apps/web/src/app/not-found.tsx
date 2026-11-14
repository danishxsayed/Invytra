import { ArrowLeft, Home, LayoutGrid } from "lucide-react";
import type { Metadata } from "next";
import { LogoMark } from "@/components/LogoMark";
import { display } from "@/components/site/fonts";
import { hubHref, siteOrigin } from "@/lib/domains";
import { SITE } from "@/lib/site";

export const metadata: Metadata = { title: "Page not found", robots: { index: false } };

/** Any address that isn't a page, on the website, the workspace or a channel. */
export default function NotFound() {
  const site = siteOrigin() || "/";
  return (
    <div className={`${display.variable} flex min-h-screen flex-col`}>
      <header className="mx-auto flex w-full max-w-[1180px] items-center px-5 py-5">
        <a href={site} className="flex items-center gap-2.5" aria-label="Invytra home">
          <LogoMark size={34} />
          <span className="font-display text-[21px] font-semibold tracking-tight text-stone-900">Invytra</span>
        </a>
      </header>
      <main className="mx-auto grid w-full max-w-[1180px] flex-1 items-center gap-10 px-5 pb-16 md:grid-cols-[1fr_1.1fr]">
        <div className="order-2 md:order-1">
          <p className="font-display text-[15px] font-semibold uppercase tracking-[0.14em] text-stone-500">Error 404</p>
          <h1 className="mt-3 font-display text-[44px] font-bold leading-[1.05] tracking-[-0.025em] text-stone-900 sm:text-[58px]">This page wandered off.</h1>
          <p className="mt-5 max-w-[460px] text-[18px] leading-relaxed text-stone-600">
            The page you&apos;re looking for doesn&apos;t exist or has moved. Check the address, or head back to somewhere familiar.
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <a href={site} className="inline-flex items-center gap-2 rounded-xl bg-stone-900 px-5 py-3 text-[16px] font-semibold text-white hover:bg-stone-800">
              <Home className="h-4 w-4" aria-hidden /> Go to homepage
            </a>
            <a href={hubHref("/")} className="inline-flex items-center gap-2 rounded-xl border border-stone-900 bg-white px-5 py-3 text-[16px] font-semibold text-stone-900 hover:bg-stone-50">
              <LayoutGrid className="h-4 w-4" aria-hidden /> Open your workspace
            </a>
          </div>
          <p className="mt-8 flex items-center gap-1.5 text-[15px] text-stone-500">
            <ArrowLeft className="h-4 w-4" aria-hidden />
            Think something&apos;s broken? Write to{" "}
            <a href={`mailto:${SITE.email}`} className="font-medium text-stone-900 underline decoration-brand-500 decoration-2 underline-offset-4">
              {SITE.email}
            </a>
          </p>
        </div>
        <div className="order-1 flex justify-center md:order-2">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/illustrations/page-not-found.svg" alt="A sad puppy sitting on a torn-up page" width={645} height={750} className="h-auto w-[220px] sm:w-[300px] md:w-[400px]" />
        </div>
      </main>
    </div>
  );
}
