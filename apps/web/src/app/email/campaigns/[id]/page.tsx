import { prisma } from "@invytra/db";
import { emailWarmupDay } from "@invytra/shared";
import { AlertTriangle, ArrowLeft, CheckCircle2, Circle, Clock, Send } from "lucide-react";
import { notFound } from "next/navigation";
import { CampaignActions } from "@/components/email/campaign/CampaignActions";
import { LeadsImport } from "@/components/email/campaign/LeadsImport";
import { MailboxPicker } from "@/components/email/campaign/MailboxPicker";
import { SequenceEditor } from "@/components/email/campaign/SequenceEditor";
import { CAMPAIGN_STATUS, LEAD_STATUS, pct } from "@/components/email/campaign/status";
import { Card, cx } from "@/components/ui";
import { requireChannel } from "@/lib/auth";
import { LEAD_FILTERS, getEmailCampaign, type LeadFilter } from "@/lib/email-campaigns";

export const metadata = { title: "Email campaign" };
export const dynamic = "force-dynamic";

function Section({ n, title, done, children, description }: { n?: number; title: string; done?: boolean; description?: string; children: React.ReactNode }) {
  return (
    <Card className="p-5">
      <div className="mb-4 flex items-start gap-3">
        {n !== undefined &&
          (done ? <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-emerald-600" aria-hidden /> : <Circle className="mt-0.5 h-5 w-5 shrink-0 text-stone-300" aria-hidden />)}
        <div>
          <h2 className="text-[17px] font-semibold text-stone-900">
            {n !== undefined && <span className="text-stone-400">{n}. </span>}
            {title}
          </h2>
          {description && <p className="text-[14px] text-stone-500">{description}</p>}
        </div>
      </div>
      {children}
    </Card>
  );
}

function Stat({ label, value, sub }: { label: string; value: React.ReactNode; sub?: string }) {
  return (
    <div className="rounded-xl bg-white px-4 py-3 ring-1 ring-stone-200/70">
      <p className="text-[13px] font-medium text-stone-500">{label}</p>
      <p className="mt-0.5 text-[22px] font-semibold tracking-tight text-stone-900">{value}</p>
      {sub && <p className="text-[12px] text-stone-500">{sub}</p>}
    </div>
  );
}

/** Why a running campaign is or isn't sending right now. */
function SendingNote({ c, now }: { c: Awaited<ReturnType<typeof getEmailCampaign>> & object; now: Date }) {
  const ready = c.sending.filter((m) => !m.waiting);
  if (c.stats.active === 0) return null;
  if (!ready.length) {
    return (
      <div className="rounded-xl bg-amber-50 px-4 py-3 text-[14.5px] text-amber-900 ring-1 ring-amber-200">
        <p className="flex items-center gap-2 font-semibold">
          <Clock className="h-4 w-4" aria-hidden /> Not sending right now
        </p>
        <ul className="mt-1 space-y-0.5">
          {c.sending.map((m) => (
            <li key={m.email}>
              {m.email} is {m.waiting!.text}.
            </li>
          ))}
        </ul>
        <p className="mt-1 text-[13.5px] text-amber-800">To change sending days or hours: Mailboxes → Settings.</p>
      </div>
    );
  }
  // Ready with emails due, but nothing went out for a few minutes: the worker is probably not running.
  const quiet = c.due > 0 && (!c.lastSendAt || now.getTime() - c.lastSendAt.getTime() > 5 * 60_000) && (!c.launchedAt || now.getTime() - c.launchedAt.getTime() > 3 * 60_000);
  return (
    <div className={cx("rounded-xl px-4 py-3 text-[14.5px] ring-1", quiet ? "bg-amber-50 text-amber-900 ring-amber-200" : "bg-emerald-50 text-emerald-900 ring-emerald-200")}>
      <p className="flex items-center gap-2 font-semibold">
        <Send className="h-4 w-4" aria-hidden /> Sending from {ready.map((m) => m.email).join(", ")}
        {c.due > 0 ? ` · ${c.due} email${c.due === 1 ? "" : "s"} due now` : " · next emails are scheduled"}
      </p>
      {quiet && <p className="mt-1">Nothing has gone out for a few minutes. Check that the worker is running (pnpm worker); emails go out within a minute of it starting.</p>}
      {c.sending.some((m) => m.waiting) && (
        <p className="mt-1 text-[13.5px] opacity-80">
          {c.sending
            .filter((m) => m.waiting)
            .map((m) => `${m.email} is ${m.waiting!.text}.`)
            .join(" ")}
        </p>
      )}
    </div>
  );
}

const when = (d: Date | null) => (d ? new Date(d).toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }) : "—");

export default async function EmailCampaignPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ leads?: string }> }) {
  const me = await requireChannel("email");
  const { id } = await params;
  const q = await searchParams;
  const filter = (LEAD_FILTERS as readonly string[]).includes(q.leads ?? "") ? (q.leads as LeadFilter) : "ALL";
  const c = await getEmailCampaign(prisma, me.workspace.id, id, filter);
  if (!c) notFound();
  const boxes = await prisma.emailAccount.findMany({
    where: { workspaceId: me.workspace.id },
    orderBy: { createdAt: "asc" },
    select: { id: true, email: true, status: true, dailyLimit: true, warmupEnabled: true, warmupStartedAt: true, timeZone: true },
  });
  const now = new Date();
  const s = CAMPAIGN_STATUS[c.status]!;
  const draft = c.status === "DRAFT";
  const editable = c.status === "DRAFT" || c.status === "PAUSED";

  return (
    <div className="space-y-6">
      <a href="/email/campaigns" className="inline-flex items-center gap-1 text-[14px] text-stone-500 hover:text-stone-800">
        <ArrowLeft className="h-4 w-4" aria-hidden /> Campaigns
      </a>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="flex flex-wrap items-center gap-2 text-[28px] font-semibold tracking-tight text-stone-900">
            {c.name}
            <span className={cx("rounded-full px-2.5 py-0.5 text-[13px] font-medium ring-1", s.cls)}>{s.text}</span>
          </h1>
          <p className="text-[15px] text-stone-500">{draft ? "Add leads, write the emails, choose mailboxes, then launch." : `Launched ${when(c.launchedAt)}. Emails go out within each mailbox's hours and daily limit.`}</p>
        </div>
        <CampaignActions id={c.id} status={c.status} ready={c.problems.length === 0} />
      </div>

      {!draft && (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
          <Stat label="Leads" value={c.stats.leads} sub={`${c.stats.active} still in sequence`} />
          <Stat label="Emails sent" value={c.stats.sent} />
          <Stat label="Replied" value={c.stats.replied} sub={`${pct(c.stats.replied, c.stats.contacted)} of contacted`} />
          <Stat label="Bounced" value={c.stats.bounced} sub={pct(c.stats.bounced, c.stats.contacted)} />
          <Stat label="Skipped" value={c.stats.skipped} sub="missing a variable" />
        </div>
      )}

      {c.status === "ACTIVE" && <SendingNote c={c} now={now} />}

      {draft && c.problems.length > 0 && (
        <p className="flex items-start gap-2 rounded-lg bg-stone-100 px-3 py-2 text-[14px] text-stone-700">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-stone-500" aria-hidden /> Before launching: {c.problems.join(" ")}
        </p>
      )}

      <Section n={draft ? 1 : undefined} title="Leads" done={c.stats.leads > 0} description={c.columns.length ? `Variables from your columns: ${c.columns.map((x) => `{${x}}`).join(", ")}` : undefined}>
        {c.status !== "COMPLETED" && <LeadsImport id={c.id} />}
        {c.stats.leads > 0 && (
          <div className="mt-5">
            <nav className="mb-2 flex flex-wrap gap-1" aria-label="Filter leads">
              {LEAD_FILTERS.map((f) => (
                <a
                  key={f}
                  href={`?leads=${f}`}
                  aria-current={f === filter ? "page" : undefined}
                  className={cx("rounded-lg px-2.5 py-1 text-[13px] font-medium", f === filter ? "bg-stone-900 text-white" : "text-stone-600 hover:bg-stone-100")}
                >
                  {f === "ALL" ? `All (${c.stats.leads})` : `${LEAD_STATUS[f]!.text} (${c.stats[f.toLowerCase() as "active"]})`}
                </a>
              ))}
            </nav>
            <div className="overflow-x-auto rounded-xl ring-1 ring-stone-200">
              <table className="w-full text-left text-[14px]">
                <thead className="bg-stone-50 text-[12.5px] text-stone-500">
                  <tr>
                    <th className="px-3 py-2 font-medium">Lead</th>
                    <th className="px-3 py-2 font-medium">Status</th>
                    <th className="px-3 py-2 font-medium">Sent</th>
                    <th className="hidden px-3 py-2 font-medium md:table-cell">From</th>
                    <th className="hidden px-3 py-2 font-medium md:table-cell">Next</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-stone-100">
                  {c.leads.map((l) => (
                    <tr key={l.id}>
                      <td className="px-3 py-2">
                        <span className="block font-medium text-stone-900">{l.email}</span>
                        <span className="block text-[12.5px] text-stone-500">{[[l.firstName, l.lastName].filter(Boolean).join(" "), l.company].filter(Boolean).join(" · ") || "—"}</span>
                      </td>
                      <td className="px-3 py-2">
                        <span className={cx("rounded-full px-2 py-0.5 text-[12.5px] font-medium", LEAD_STATUS[l.status]!.cls)}>{LEAD_STATUS[l.status]!.text}</span>
                        {l.reason && <span className="mt-0.5 block max-w-[280px] truncate text-[12px] text-stone-500" title={l.reason}>{l.reason}</span>}
                      </td>
                      <td className="px-3 py-2 tabular-nums text-stone-700">
                        {l.stepIndex} of {c.steps.length}
                        {l.lastSentAt && <span className="block text-[12px] text-stone-500">{when(l.lastSentAt)}</span>}
                      </td>
                      <td className="hidden px-3 py-2 text-stone-600 md:table-cell">{l.emailAccount?.email ?? "—"}</td>
                      <td className="hidden px-3 py-2 text-stone-600 md:table-cell">{l.status === "ACTIVE" && !draft ? (l.nextAt && l.nextAt > now ? when(l.nextAt) : "Next in line") : "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {c.leads.length === 200 && <p className="mt-2 text-[13px] text-stone-500">Showing the first 200.</p>}
          </div>
        )}
      </Section>

      <Section n={draft ? 2 : undefined} title="Emails" done={c.sequenceOk} description={c.status === "ACTIVE" ? "Pause the campaign to change its emails." : "Follow-ups go only to leads who haven't replied."}>
        <SequenceEditor id={c.id} initial={c.steps} columns={c.columns} sample={c.sample} editable={editable} />
      </Section>

      <Section n={draft ? 3 : undefined} title="Mailboxes" done={c.mailboxIds.length > 0} description="Each lead gets all their emails from one mailbox; new leads go to the mailbox with the most room that day.">
        <MailboxPicker
          id={c.id}
          chosen={c.mailboxIds}
          mailboxes={boxes.map((b) => ({ id: b.id, email: b.email, status: b.status, dailyLimit: b.dailyLimit, warmupDay: b.warmupEnabled && b.warmupStartedAt ? emailWarmupDay(b.warmupStartedAt, now, b.timeZone) : null }))}
        />
      </Section>
    </div>
  );
}
