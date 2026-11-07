import { prisma } from "@invytra/db";
import { CHANNELS, canUseChannel, channelById } from "@invytra/shared";
import { AlertTriangle, ArrowUpRight, CheckCircle2, Clock, LogOut, Plug, Settings } from "lucide-react";
import { logout } from "@/app/(auth)/actions";
import { ChannelLogo } from "@/components/ChannelLogo";
import { LogoMark } from "@/components/LogoMark";
import { Avatar, cx } from "@/components/ui";
import { requireUser } from "@/lib/auth";
import { channelSetup, type ChannelSetup } from "@/lib/channel-status";
import { channelHref, hubHref } from "@/lib/domains";
import { CreditsChip } from "@/components/credits/CreditsChip";
import { getAiBalance } from "@/lib/ai-credits";

export const metadata = { title: "Your workspace" };
export const dynamic = "force-dynamic";

const SETUP_TONE: Record<ChannelSetup["state"], { cls: string; icon: typeof Clock }> = {
  ready: { cls: "bg-emerald-50 text-emerald-800 ring-emerald-600/20", icon: CheckCircle2 },
  attention: { cls: "bg-rose-50 text-rose-800 ring-rose-600/20", icon: AlertTriangle },
  setup: { cls: "bg-stone-100 text-stone-700 ring-stone-500/20", icon: Plug },
};

/**
 * The workspace hub: where everyone lands after signing in. One card per outreach channel
 * (from CHANNELS in @invytra/shared), each opening its tool on its own subdomain.
 */
export default async function WorkspaceHub({ searchParams }: { searchParams: Promise<{ soon?: string; denied?: string }> }) {
  const me = await requireUser();
  const q = await searchParams;
  const cards = await Promise.all(
    CHANNELS.map(async (c) => {
      const usable = canUseChannel(c, me.workspace.channels);
      return { c, usable, setup: usable ? await channelSetup(prisma, me.workspace.id, c.id) : null };
    }),
  );
  const ai = await getAiBalance(prisma, me.workspace.id);
  const notice = q.soon ? channelById(q.soon) : q.denied ? channelById(q.denied) : undefined;
  const settingsHref = channelHref("linkedin", "/app/settings");

  return (
    <div className="min-h-screen">
      <header className="border-b border-stone-200/70 bg-white/80 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-3 px-4 py-3 sm:px-6">
          <div className="flex min-w-0 items-center gap-2.5">
            <LogoMark size={32} />
            <span className="text-[18px] font-semibold tracking-tight text-stone-900">Invytra</span>
            <span className="hidden truncate rounded-full bg-stone-100 px-2.5 py-0.5 text-[13px] font-medium text-stone-600 sm:inline">{me.workspace.name}</span>
          </div>
          <div className="flex items-center gap-1.5">
            <CreditsChip left={ai.left} href={hubHref("/credits")} className="mr-1" />
            <a href={settingsHref} className="inline-flex items-center gap-1.5 rounded-lg px-2.5 py-2 text-[14px] font-medium text-stone-600 hover:bg-stone-100 hover:text-stone-900">
              <Settings className="h-4 w-4" aria-hidden /> <span className="hidden sm:inline">Settings</span>
            </a>
            <span className="mx-1 hidden items-center gap-2 sm:flex">
              <Avatar name={me.user.name} size="sm" />
              <span className="max-w-[160px] truncate text-[14px] font-medium text-stone-800">{me.user.name}</span>
            </span>
            <form action={logout}>
              <button className="inline-flex items-center gap-1.5 rounded-lg px-2.5 py-2 text-[14px] font-medium text-stone-600 hover:bg-stone-100 hover:text-stone-900" title="Sign out">
                <LogOut className="h-4 w-4" aria-hidden /> <span className="hidden sm:inline">Sign out</span>
              </button>
            </form>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-4 py-10 sm:px-6">
        <h1 className="text-[30px] font-semibold tracking-tight text-stone-900">Your workspace</h1>
        <p className="mt-1 text-[16px] text-stone-500">Every outreach channel in one place. One sign-in for all of them.</p>

        {notice && (
          <p role="status" className="mt-5 flex items-start gap-2 rounded-xl bg-amber-50 px-4 py-3 text-[15px] text-amber-900">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
            {notice.status !== "live"
              ? `${notice.name} is coming soon. We'll let you know when it opens.`
              : `${notice.name} isn't included in your workspace's plan yet.`}
          </p>
        )}

        <ul className="mt-8 grid gap-4 sm:grid-cols-2">
          {cards.map(({ c, usable, setup }) => {
            const soon = c.status !== "live";
            const tone = setup ? SETUP_TONE[setup.state] : null;
            return (
              <li key={c.id}>
                <article
                  className={cx(
                    "flex h-full flex-col rounded-2xl border p-5 transition",
                    usable ? "border-stone-200 bg-white shadow-sm hover:border-stone-300 hover:shadow-md" : "border-stone-200/70 bg-stone-50/80",
                  )}
                  aria-disabled={!usable}
                >
                  <div className="flex items-start gap-3.5">
                    <ChannelLogo id={c.id} muted={!usable} />
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <h2 className={cx("text-[18px] font-semibold", usable ? "text-stone-900" : "text-stone-500")}>{c.name}</h2>
                        {soon && <span className="rounded-full bg-sky-100 px-2 py-0.5 text-[12px] font-semibold text-sky-800">Coming soon</span>}
                      </div>
                      <p className={cx("mt-1 text-[14px] leading-relaxed", usable ? "text-stone-600" : "text-stone-500")}>{c.description}</p>
                    </div>
                  </div>
                  <div className="mt-5 flex flex-wrap items-center justify-between gap-3 pt-1">
                    {setup && tone ? (
                      <span className={cx("inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[13px] font-medium ring-1", tone.cls)}>
                        <tone.icon className="h-3.5 w-3.5" aria-hidden /> {setup.text}
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1.5 text-[13px] font-medium text-stone-500">
                        <Clock className="h-3.5 w-3.5" aria-hidden /> {soon ? "Not available yet" : "Not in your plan"}
                      </span>
                    )}
                    {usable ? (
                      <a
                        href={channelHref(c.id)}
                        className="inline-flex items-center gap-1.5 rounded-lg bg-stone-900 px-3.5 py-2 text-[14px] font-semibold text-white transition hover:bg-stone-700"
                      >
                        {c.open} <ArrowUpRight className="h-4 w-4" aria-hidden />
                      </a>
                    ) : (
                      <button disabled className="cursor-not-allowed rounded-lg border border-stone-200 bg-white px-3.5 py-2 text-[14px] font-semibold text-stone-400">
                        {c.open}
                      </button>
                    )}
                  </div>
                </article>
              </li>
            );
          })}
        </ul>
      </main>
    </div>
  );
}
