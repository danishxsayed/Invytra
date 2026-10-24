import Link from "next/link";
import { SITE } from "@/lib/site";
import { Logo } from "./SiteHeader";

const COLUMNS = [
  { title: "Product", links: [["/#how", "How it works"], ["/#safety", "Safety"], ["/pricing", "Pricing"], ["/compare", "Compare"]] },
  { title: "Account", links: [["/signup", "Start free trial"], ["/login", "Log in"]] },
  { title: "Legal", links: [["/privacy", "Privacy policy"], ["/terms", "Terms of service"]] },
] as const;

export function SiteFooter() {
  return (
    <footer className="border-t border-stone-900/[0.08] bg-white/50">
      <div className="mx-auto grid max-w-[1180px] gap-10 px-5 py-14 md:grid-cols-[1.4fr_repeat(3,1fr)]">
        <div className="max-w-xs">
          <Logo />
          <p className="mt-4 text-[15px] leading-relaxed text-stone-600">LinkedIn outreach at a human pace. Made in India by {SITE.company}.</p>
          <a href={`mailto:${SITE.email}`} className="mt-3 inline-block text-[15px] font-medium text-stone-900 underline decoration-brand-500 decoration-2 underline-offset-4">
            {SITE.email}
          </a>
        </div>
        {COLUMNS.map((c) => (
          <div key={c.title}>
            <p className="text-[15px] font-semibold text-stone-900">{c.title}</p>
            <ul className="mt-3 space-y-2">
              {c.links.map(([href, label]) => (
                <li key={href}>
                  <Link href={href} className="text-[15px] text-stone-600 hover:text-stone-900">
                    {label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
      <div className="border-t border-stone-900/[0.06]">
        <div className="mx-auto flex max-w-[1180px] flex-col gap-2 px-5 py-6 text-[14px] text-stone-500 md:flex-row md:justify-between">
          <p>© {new Date().getFullYear()} {SITE.company}</p>
          <p>Invytra is not affiliated with or endorsed by LinkedIn. LinkedIn is a trademark of LinkedIn Corporation.</p>
        </div>
      </div>
    </footer>
  );
}
