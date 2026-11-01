import { LayoutGrid, Mail } from "lucide-react";
import { ChannelLogo } from "@/components/ChannelLogo";
import { requireChannel } from "@/lib/auth";
import { hubHref } from "@/lib/domains";

/** Email Outreach: its own tool on the platform, with a link back to every channel. */
export default async function EmailLayout({ children }: { children: React.ReactNode }) {
  const me = await requireChannel("email");
  const soon = ["Campaigns", "Inbox", "Warm-up"];
  return (
    <div className="min-h-screen">
      <header className="border-b border-stone-200/70 bg-white/80 backdrop-blur">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-x-6 gap-y-2 px-4 py-3 sm:px-6">
          <div className="flex items-center gap-2.5">
            <ChannelLogo id="email" size="sm" />
            <span className="text-[17px] font-semibold tracking-tight text-stone-900">Email Outreach</span>
            <span className="hidden truncate rounded-full bg-stone-100 px-2.5 py-0.5 text-[13px] font-medium text-stone-600 sm:inline">{me.workspace.name}</span>
          </div>
          <nav aria-label="Email" className="flex flex-wrap items-center gap-1">
            <span aria-current="page" className="inline-flex items-center gap-1.5 rounded-lg bg-brand-400 px-3 py-1.5 text-[14px] font-medium text-stone-900">
              <Mail className="h-4 w-4" aria-hidden /> Mailboxes
            </span>
            {soon.map((s) => (
              <span key={s} aria-disabled className="inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-[14px] text-stone-400">
                {s} <span className="rounded bg-stone-100 px-1 text-[11px] font-medium text-stone-500">Soon</span>
              </span>
            ))}
          </nav>
          <a href={hubHref("/")} className="ml-auto inline-flex items-center gap-1.5 rounded-lg border border-stone-200 px-3 py-1.5 text-[14px] font-medium text-stone-600 hover:border-stone-300 hover:bg-stone-50">
            <LayoutGrid className="h-4 w-4 text-stone-400" aria-hidden /> All channels
          </a>
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-4 py-8 sm:px-6">{children}</main>
    </div>
  );
}
