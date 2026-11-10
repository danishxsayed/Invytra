import { prisma } from "@invytra/db";
import { CHANNELS, canUseChannel, channelById, planIntro, setupPlan, type SetupStepId } from "@invytra/shared";
import { AlertTriangle, ArrowUpRight, CheckCircle2, Clock, Plug, Sparkles } from "lucide-react";
import { ChannelLogo } from "@/components/ChannelLogo";
import { NeedsAttention } from "@/components/overview/NeedsAttention";
import { SetupPlan } from "@/components/overview/SetupPlan";
import { WeekStrip, type Stat } from "@/components/overview/WeekStrip";
import { cx } from "@/components/ui";
import { requireUser } from "@/lib/auth";
import { channelSetup, type ChannelSetup } from "@/lib/channel-status";
import { channelHref, hubHref } from "@/lib/domains";
import { getAnswers, setupProgress } from "@/lib/onboarding";
import { needsAttention, replyRate, weekNumbers } from "@/lib/overview";

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
  const [{ week, before }, attention] = await Promise.all([weekNumbers(prisma, me.workspace.id), needsAttention(prisma, me)]);
  const fmt = (v: number) => v.toLocaleString("en-US");
  const change = (now: number, then: number, unit = ""): Stat["change"] => {
    if (!now && !then) return null;
    const d = Math.round((now - then) * 10) / 10;
    return { text: d === 0 ? "Same as last week" : `${d > 0 ? "+" : "−"}${fmt(Math.abs(d))}${unit} vs last week`, dir: d > 0 ? "up" : d < 0 ? "down" : "same" };
  };
  const rate = replyRate(week);
  const rateBefore = replyRate(before);
  const split = (li: number, em: number) => `LinkedIn ${fmt(li)} · Email ${fmt(em)}`;
  const stats: Stat[] = [
    { label: "People contacted", value: fmt(week.contacted), change: change(week.contacted, before.contacted), split: split(week.byChannel.linkedin.contacted, week.byChannel.email.contacted) },
    { label: "Replies", value: fmt(week.replies), change: change(week.replies, before.replies), split: split(week.byChannel.linkedin.replies, week.byChannel.email.replies) },
    { label: "Reply rate", value: rate === null ? "—" : `${rate}%`, change: rate === null || rateBefore === null ? null : change(rate, rateBefore, " pts") },
    { label: "Meetings booked", value: fmt(week.meetings), change: change(week.meetings, before.meetings) },
  ];
  const answers = await getAnswers(prisma, me.user.id);
  const plan = answers.planHidden ? [] : setupPlan(answers, await setupProgress(prisma, me.workspace.id));
  // LinkedIn first when they use it; otherwise email.
  const li = canUseChannel(channelById("linkedin")!, me.workspace.channels) && (!answers.channels?.length || answers.channels.includes("linkedin"));
  const planHrefs: Record<SetupStepId, string> = {
    linkedin: channelHref("linkedin", "/app/accounts?add=1"),
    mailbox: channelHref("email", "/email/mailboxes"),
    people: li ? channelHref("linkedin", "/app/leads") : channelHref("email", "/email/contacts"),
    campaign: li ? channelHref("linkedin", "/app/campaigns/new") : channelHref("email", "/email/campaigns"),
    voice: hubHref("/voices"),
    dnc: hubHref("/do-not-contact"),
  };
  const notice = q.soon ? channelById(q.soon) : q.denied ? channelById(q.denied) : undefined;

  return (
    <div>
        <h1 className="text-[30px] font-semibold tracking-tight text-stone-900">Your workspace</h1>
        <p className="mt-1 text-[16px] text-stone-500">The last 7 days across every channel, what needs you, and your channels.</p>

        {notice && (
          <p role="status" className="mt-5 flex items-start gap-2 rounded-xl bg-amber-50 px-4 py-3 text-[15px] text-amber-900">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
            {notice.status !== "live"
              ? `${notice.name} is coming soon. We'll let you know when it opens.`
              : `${notice.name} isn't included in your workspace's plan yet.`}
          </p>
        )}

        <div className="mt-7 space-y-4">
          <SetupPlan steps={plan} intro={planIntro(answers)} hrefs={planHrefs} />
          <WeekStrip stats={stats} />
          <NeedsAttention items={attention} />
        </div>

        <h2 className="mt-10 text-[13px] font-semibold uppercase tracking-wider text-stone-400">Channels</h2>
        <ul className="mt-3 grid gap-4 sm:grid-cols-2">
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

        <h2 className="mt-10 text-[13px] font-semibold uppercase tracking-wider text-stone-400">Tools</h2>
        <a
          href={hubHref("/invy")}
          className="group mt-3 flex flex-wrap items-center gap-4 rounded-2xl border border-stone-200 bg-white p-5 shadow-sm transition hover:border-stone-300 hover:shadow-md"
        >
          <span className="grid h-11 w-11 place-items-center rounded-xl bg-stone-900 text-white">
            <Sparkles className="h-5 w-5" aria-hidden />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block text-[18px] font-semibold text-stone-900">Ask Invy</span>
            <span className="block text-[14px] text-stone-600">Find businesses to reach by asking, e.g. “20 dental clinics in Mumbai without online booking”. See them on a map with why each one fits.</span>
          </span>
          <span className="inline-flex items-center gap-1.5 rounded-lg bg-stone-900 px-3.5 py-2 text-[14px] font-semibold text-white transition group-hover:bg-stone-700">
            Ask Invy <ArrowUpRight className="h-4 w-4" aria-hidden />
          </span>
        </a>
    </div>
  );
}
