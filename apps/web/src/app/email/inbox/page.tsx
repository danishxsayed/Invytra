import { prisma } from "@invytra/db";
import { AlertTriangle, ArrowLeft, Inbox, MailWarning, Reply } from "lucide-react";
import { EmailInboxLive } from "@/components/email/inbox/EmailInboxLive";
import { ReplyBox } from "@/components/email/inbox/ReplyBox";
import { LEAD_STATUS } from "@/components/email/campaign/status";
import { Card, EmptyState, cx } from "@/components/ui";
import { requireChannel } from "@/lib/auth";
import { INBOX_VIEWS, getConversation, listConversations, type InboxView, type ThreadItem } from "@/lib/email-inbox";

export const metadata = { title: "Email inbox" };
export const dynamic = "force-dynamic";

const VIEW_LABEL: Record<InboxView, string> = { needs: "Needs reply", all: "All replies", auto: "Auto-replies", bounces: "Bounces" };

function when(d: Date): string {
  const now = new Date();
  const same = d.toDateString() === now.toDateString();
  return same ? d.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" }) : d.toLocaleDateString("en-GB", { day: "numeric", month: "short" });
}

function Message({ m }: { m: ThreadItem }) {
  const tag =
    m.kind === "CAMPAIGN" ? `Campaign email ${m.step !== null ? m.step + 1 : ""}` : m.kind === "SENT_REPLY" ? "Your reply" : m.kind === "AUTO_REPLY" ? "Auto-reply" : m.kind === "BOUNCE" ? "Bounce" : "Reply";
  return (
    <div className={cx("flex", m.out ? "justify-end" : "justify-start")}>
      <div
        className={cx(
          "max-w-[85%] rounded-2xl px-4 py-3",
          m.out ? "bg-brand-50 ring-1 ring-brand-200" : m.kind === "BOUNCE" ? "bg-rose-50 ring-1 ring-rose-200" : m.kind === "AUTO_REPLY" ? "bg-stone-100" : "bg-white ring-1 ring-stone-200",
        )}
      >
        <p className="flex flex-wrap items-baseline gap-x-2 text-[12.5px] text-stone-500">
          <span className="font-medium text-stone-700">{tag}</span>
          <span>{m.from}</span>
          <span>{m.at.toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}</span>
        </p>
        <p className="mt-0.5 text-[14px] font-semibold text-stone-900">{m.subject}</p>
        <p className="mt-1 whitespace-pre-wrap break-words text-[14.5px] leading-relaxed text-stone-800">{m.text || <span className="italic text-stone-400">(no text saved)</span>}</p>
      </div>
    </div>
  );
}

export default async function EmailInboxPage({ searchParams }: { searchParams: Promise<{ v?: string; c?: string }> }) {
  const me = await requireChannel("email");
  const q = await searchParams;
  const view = (INBOX_VIEWS as readonly string[]).includes(q.v ?? "") ? (q.v as InboxView) : "needs";
  // Open the chosen conversation first (it marks their messages read), then list.
  let convo = q.c ? await getConversation(prisma, me.workspace.id, q.c) : null;
  const rows = await listConversations(prisma, me.workspace.id, view);
  if (!convo && rows[0]) convo = await getConversation(prisma, me.workspace.id, rows[0].leadId);
  const openId = convo?.lead.id;
  for (const r of rows) if (r.leadId === openId) r.unread = 0;
  const unreadable = await prisma.emailAccount.findMany({ where: { workspaceId: me.workspace.id, replyError: { not: null } }, select: { email: true, replyError: true } });
  const href = (o: { v?: string; c?: string }) => `/email/inbox?${new URLSearchParams({ v: o.v ?? view, ...(o.c && { c: o.c }) })}`;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-[28px] font-semibold tracking-tight text-stone-900">Inbox</h1>
          <p className="text-[15px] text-stone-500">Replies to your campaigns, from every mailbox (including any that landed in its spam folder). Answer here and it goes out from the same mailbox, in the same thread.</p>
        </div>
        <EmailInboxLive />
      </div>
      {unreadable.map((m) => (
        <p key={m.email} className="flex items-start gap-2 rounded-lg bg-amber-50 px-3 py-2 text-[14px] text-amber-900 ring-1 ring-amber-200">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden /> Couldn't read replies in {m.email}: {m.replyError}
        </p>
      ))}
      <nav className="flex flex-wrap gap-1" aria-label="Inbox views">
        {INBOX_VIEWS.map((v) => (
          <a key={v} href={href({ v })} aria-current={v === view ? "page" : undefined} className={cx("rounded-lg px-3 py-1.5 text-[14px] font-medium", v === view ? "bg-stone-900 text-white" : "text-stone-600 hover:bg-stone-100")}>
            {VIEW_LABEL[v]}
            {v === view && ` (${rows.length})`}
          </a>
        ))}
      </nav>

      {rows.length === 0 && !convo ? (
        <Card>
          <EmptyState
            icon={view === "bounces" ? MailWarning : view === "needs" ? Reply : Inbox}
            title={view === "needs" ? "You're all caught up" : `No ${VIEW_LABEL[view].toLowerCase()} yet`}
            body={view === "needs" ? "Replies from leads show up here within a few minutes. Follow-ups to them stop automatically." : "They'll show up here as your campaigns run."}
          />
        </Card>
      ) : (
        <div className="grid overflow-hidden rounded-2xl bg-white ring-1 ring-stone-200 lg:h-[calc(100vh-260px)] lg:min-h-[520px] lg:grid-cols-[360px_1fr]">
          <ul className={cx("divide-y divide-stone-100 overflow-y-auto border-stone-200 lg:border-r", q.c && "hidden lg:block")}>
            {rows.map((r) => (
              <li key={r.leadId}>
                <a href={href({ c: r.leadId })} className={cx("block px-4 py-3 transition hover:bg-stone-50", r.leadId === openId && "bg-brand-50/70")}>
                  <p className="flex items-center gap-2">
                    {r.unread > 0 && <span className="h-2 w-2 shrink-0 rounded-full bg-brand-500" aria-label="Unread" />}
                    <span className={cx("min-w-0 flex-1 truncate text-[15px]", r.unread ? "font-semibold text-stone-900" : "font-medium text-stone-800")}>{r.name}</span>
                    <span className="shrink-0 text-[12.5px] text-stone-500">{when(r.lastAt)}</span>
                  </p>
                  <p className="truncate text-[13px] text-stone-500">{[r.company, r.campaign].filter(Boolean).join(" · ")}</p>
                  <p className="mt-0.5 line-clamp-2 text-[13.5px] text-stone-600">{r.preview}</p>
                </a>
              </li>
            ))}
            {rows.length === 0 && <li className="px-4 py-6 text-[14px] text-stone-500">Nothing here.</li>}
          </ul>

          {convo ? (
            <section className="flex min-h-0 flex-col">
              <header className="border-b border-stone-200 px-5 py-3">
                <a href={href({})} className="mb-1 inline-flex items-center gap-1 text-[13px] text-stone-500 lg:hidden">
                  <ArrowLeft className="h-4 w-4" aria-hidden /> All conversations
                </a>
                <p className="flex flex-wrap items-center gap-2">
                  <span className="text-[17px] font-semibold text-stone-900">{convo.lead.name ?? convo.lead.email}</span>
                  <span className={cx("rounded-full px-2 py-0.5 text-[12px] font-medium", LEAD_STATUS[convo.lead.status]!.cls)}>{LEAD_STATUS[convo.lead.status]!.text}</span>
                  {convo.done && <span className="rounded-full bg-stone-100 px-2 py-0.5 text-[12px] font-medium text-stone-600">Done</span>}
                </p>
                <p className="text-[13.5px] text-stone-500">
                  {convo.lead.email}
                  {convo.lead.company && ` · ${convo.lead.company}`} · campaign{" "}
                  <a className="underline-offset-2 hover:underline" href={`/email/campaigns/${convo.campaign.id}`}>
                    {convo.campaign.name}
                  </a>
                  {convo.mailbox && ` · via ${convo.mailbox.email}`}
                </p>
                {convo.mailbox && convo.mailbox.status !== "ACTIVE" && (
                  <p className="mt-1 flex items-center gap-1.5 text-[13px] text-amber-800">
                    <AlertTriangle className="h-3.5 w-3.5" aria-hidden /> This mailbox is {convo.mailbox.status === "PAUSED" ? "paused" : "marked needs attention"}; replies still try to go out.
                  </p>
                )}
              </header>
              {/* Reversed column: opens scrolled to the newest message. */}
              <div className="flex flex-1 flex-col-reverse gap-3 overflow-y-auto bg-stone-50/60 px-5 py-4">
                {[...convo.items].reverse().map((m) => (
                  <Message key={m.id} m={m} />
                ))}
              </div>
              <ReplyBox leadId={convo.lead.id} from={convo.mailbox?.email ?? null} done={convo.done} canReply={!!convo.mailbox} />
            </section>
          ) : (
            <div className="hidden items-center justify-center text-[15px] text-stone-500 lg:flex">Choose a conversation.</div>
          )}
        </div>
      )}
    </div>
  );
}
