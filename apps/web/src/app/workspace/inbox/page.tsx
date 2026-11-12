import { prisma } from "@invytra/db";
import { ArrowLeft, CalendarCheck, ExternalLink, Inbox, Search } from "lucide-react";
import { ChannelLogo } from "@/components/ChannelLogo";
import { PersonPhoto } from "@/components/PersonPhoto";
import { ReplyBox, ThreadButtons } from "@/components/unified-inbox/ThreadControls";
import { Card, cx } from "@/components/ui";
import { requireUser } from "@/lib/auth";
import { channelHref, hubHref } from "@/lib/domains";
import { getConversation as emailThread } from "@/lib/email-inbox";
import { timeAgo } from "@/lib/format";
import { MEETING_TAG, getConversation as linkedinThread } from "@/lib/inbox";
import { UNIFIED_CHANNELS, UNIFIED_FILTERS, inboxChannels, parseKey, unifiedList, type UnifiedChannel, type UnifiedFilter } from "@/lib/unified-inbox";

export const metadata = { title: "Inbox" };
export const dynamic = "force-dynamic";

const FILTER_LABEL: Record<UnifiedFilter, string> = { needs: "Needs reply", all: "All", done: "Done" };
const CHANNEL_LABEL: Record<UnifiedChannel, string> = { all: "All channels", linkedin: "LinkedIn", email: "Email" };

/** Every reply from every channel in one list: LinkedIn and email now, WhatsApp next. */
export default async function UnifiedInbox({ searchParams }: { searchParams: Promise<{ f?: string; ch?: string; q?: string; c?: string }> }) {
  const me = await requireUser();
  const sp = await searchParams;
  const filter = (UNIFIED_FILTERS as readonly string[]).includes(sp.f ?? "") ? (sp.f as UnifiedFilter) : "all";
  const channel = (UNIFIED_CHANNELS as readonly string[]).includes(sp.ch ?? "") ? (sp.ch as UnifiedChannel) : "all";
  const usable = inboxChannels(me.workspace.channels);
  const [rows, needs] = await Promise.all([
    unifiedList(prisma, me.workspace.id, me.workspace.channels, { filter, channel, q: sp.q }),
    filter === "needs" && channel === "all" && !sp.q ? null : unifiedList(prisma, me.workspace.id, me.workspace.channels, { filter: "needs" }).then((r) => r.length),
  ]);
  const needsCount = needs ?? rows.length;
  const open = parseKey(sp.c);
  const href = (p: Record<string, string | undefined>) => {
    const u = new URLSearchParams();
    for (const [k, v] of Object.entries({ f: filter === "all" ? undefined : filter, ch: channel === "all" ? undefined : channel, q: sp.q, c: sp.c, ...p })) if (v) u.set(k, v);
    const s = u.toString();
    return hubHref(`/inbox${s ? `?${s}` : ""}`);
  };
  const thread = open && usable.includes(open.channel) ? await Thread({ workspaceId: me.workspace.id, convKey: sp.c!, channel: open.channel, id: open.id }) : null;

  return (
    <div className="lg:h-full">
      <h1 className="sr-only">Inbox</h1>
      <div className="grid gap-4 lg:h-full lg:grid-cols-[minmax(320px,400px)_1fr]">
        <Card className={cx("flex min-h-[520px] flex-col overflow-hidden lg:min-h-0", thread && "hidden lg:flex")}>
          <div className="space-y-2.5 border-b border-stone-100 p-3">
            <nav className="flex gap-1.5" aria-label="Show">
              {UNIFIED_FILTERS.map((f) => (
                <a key={f} href={href({ f: f === "all" ? undefined : f, c: undefined })} className={cx("rounded-full border px-3 py-1 text-[13px] transition", filter === f ? "border-stone-900 bg-stone-900 text-white" : "border-stone-200 bg-white text-stone-700 hover:border-stone-300")}>
                  {FILTER_LABEL[f]}
                  {f === "needs" && needsCount > 0 && <span className={filter === f ? "text-white/70" : "text-stone-400"}> {needsCount}</span>}
                </a>
              ))}
            </nav>
            <form action={hubHref("/inbox")} className="flex gap-2">
              {filter !== "all" && <input type="hidden" name="f" value={filter} />}
              <select name="ch" defaultValue={channel} aria-label="Channel" className="rounded-lg border border-stone-300 bg-white px-2 py-1.5 text-[13.5px]">
                {UNIFIED_CHANNELS.filter((c) => c === "all" || usable.includes(c)).map((c) => (
                  <option key={c} value={c}>
                    {CHANNEL_LABEL[c]}
                  </option>
                ))}
              </select>
              <label className="relative min-w-0 flex-1">
                <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-stone-400" aria-hidden />
                <input name="q" defaultValue={sp.q ?? ""} placeholder="Search" aria-label="Search conversations" className="w-full rounded-lg border border-stone-300 py-1.5 pl-8 pr-2 text-[13.5px] focus:border-stone-500 focus:outline-none" />
              </label>
            </form>
          </div>
          {rows.length ? (
            <ul className="max-h-[70vh] min-h-0 flex-1 divide-y divide-stone-100 overflow-y-auto lg:max-h-none">
              {rows.map((r) => {
                const on = sp.c === r.key;
                return (
                  <li key={r.key}>
                    <a href={href({ c: r.key })} aria-current={on ? "true" : undefined} className={cx("flex gap-3 px-3.5 py-3 transition", on ? "bg-[#f3fbd0]" : "hover:bg-stone-50")}>
                      <span className="relative h-8 w-8 shrink-0 self-start">
                        <PersonPhoto name={r.name} src={r.photo} />
                        <span className="absolute -bottom-1 -right-1 rounded-[6px] ring-2 ring-white">
                          <ChannelLogo id={r.channel} size="xs" />
                        </span>
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="flex items-baseline gap-2">
                          <span className={cx("truncate text-[14.5px]", r.unread || r.needsReply ? "font-semibold text-stone-900" : "font-medium text-stone-700")}>{r.name}</span>
                          <span className="ml-auto shrink-0 text-[12px] text-stone-400">{timeAgo(r.lastAt)}</span>
                        </span>
                        <span className="block truncate text-[12.5px] text-stone-500">{[r.company, r.campaign].filter(Boolean).join(" · ") || r.via}</span>
                        <span className={cx("mt-0.5 block truncate text-[13.5px]", r.needsReply ? "text-stone-800" : "text-stone-500")}>{r.preview}</span>
                        {r.meeting && (
                          <span className="mt-1 inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-[11.5px] font-medium text-emerald-800">
                            <CalendarCheck className="h-3 w-3" aria-hidden /> Meeting booked
                          </span>
                        )}
                      </span>
                    </a>
                  </li>
                );
              })}
            </ul>
          ) : (
            <div className="flex flex-1 flex-col items-center justify-center gap-2 p-8 text-center text-[14.5px] text-stone-500">
              <Inbox className="h-7 w-7 text-stone-300" aria-hidden />
              {filter === "needs" ? "Nothing waiting for a reply." : "No conversations here."}
            </div>
          )}
        </Card>

        <div className={cx("lg:min-h-0", !thread && "hidden lg:block")}>
          {thread ?? (
            <Card className="flex min-h-[520px] items-center justify-center p-8 lg:h-full text-center text-[15px] text-stone-500">Choose a conversation to read and reply.</Card>
          )}
          {thread && (
            <a href={href({ c: undefined })} className="mt-3 inline-flex items-center gap-1.5 text-[14px] font-medium text-stone-600 lg:hidden">
              <ArrowLeft className="h-4 w-4" aria-hidden /> All conversations
            </a>
          )}
        </div>
      </div>
    </div>
  );
}

function Bubble({ out, children, meta }: { out: boolean; children: React.ReactNode; meta: string }) {
  return (
    <div className={cx("flex", out ? "justify-end" : "justify-start")}>
      <div className={cx("max-w-[85%] rounded-2xl px-4 py-2.5", out ? "bg-stone-900 text-white" : "bg-stone-100 text-stone-900")}>
        <div className="whitespace-pre-wrap break-words text-[14.5px] leading-relaxed">{children}</div>
        <p className={cx("mt-1 text-[11.5px]", out ? "text-white/60" : "text-stone-400")}>{meta}</p>
      </div>
    </div>
  );
}

/** The open conversation: its messages, buttons and the reply box (through its own channel). */
async function Thread({ workspaceId, convKey, channel, id }: { workspaceId: string; convKey: string; channel: "linkedin" | "email"; id: string }) {
  if (channel === "linkedin") {
    const c = await linkedinThread(prisma, workspaceId, id);
    if (!c) return null;
    const lead = c.campaignLead;
    const pending = c.replies.filter((r) => r.status !== "SUCCEEDED");
    return (
      <Card className="flex min-h-[520px] flex-col lg:h-full lg:min-h-0">
        <header className="flex flex-wrap items-start gap-3 border-b border-stone-100 p-4">
          <PersonPhoto name={c.participantName} src={null} size="lg" />
          <div className="min-w-0 flex-1">
            <p className="flex items-center gap-2 text-[17px] font-semibold text-stone-900">
              {c.participantName} <ChannelLogo id="linkedin" size="xs" />
            </p>
            <p className="truncate text-[13.5px] text-stone-500">{[lead?.title, lead?.company].filter(Boolean).join(" at ") || "LinkedIn"} · via {c.account.label}{lead?.campaign ? ` · ${lead.campaign.name}` : ""}</p>
            {lead?.profileUrl && (
              <a href={lead.profileUrl} target="_blank" rel="noreferrer" className="mt-0.5 inline-flex items-center gap-1 text-[13px] text-stone-500 hover:text-stone-800">
                Profile <ExternalLink className="h-3 w-3" aria-hidden />
              </a>
            )}
          </div>
          <ThreadButtons convKey={convKey} done={!!c.doneAt || c.lastFromMe} meeting={c.tags.some((t) => t.toLowerCase() === MEETING_TAG.toLowerCase())} />
        </header>
        <div className="max-h-[55vh] min-h-0 flex-1 space-y-2.5 overflow-y-auto p-4 lg:max-h-none">
          {c.messages.map((m) => (
            <Bubble key={m.id} out={m.fromMe} meta={timeAgo(m.sentAt)}>
              {m.text}
            </Bubble>
          ))}
          {pending.map((r) => (
            <Bubble key={r.id} out meta={r.status === "FAILED" ? "Not sent" : "Sending…"}>
              {String((r.payload as { text?: string } | null)?.text ?? "")}
            </Bubble>
          ))}
        </div>
        <div className="border-t border-stone-100 p-4">
          <ReplyBox
            convKey={convKey}
            hint={`From ${c.account.label}. Cmd/Ctrl + Enter to send.`}
            disabled={c.account.status !== "ACTIVE" ? `“${c.account.label}” isn't connected right now, so replies can't go out. Reconnect it in LinkedIn → Accounts.` : null}
          />
          <a href={channelHref("linkedin", `/app/inbox?c=${c.id}`)} className="mt-2 inline-block text-[12.5px] text-stone-400 hover:text-stone-700">
            Open in the LinkedIn inbox (tags, pause the campaign for them)
          </a>
        </div>
      </Card>
    );
  }
  const t = await emailThread(prisma, workspaceId, id);
  if (!t) return null;
  const lead = await prisma.emailLead.findUnique({ where: { id }, select: { meetingAt: true } });
  return (
    <Card className="flex min-h-[520px] flex-col lg:h-full lg:min-h-0">
      <header className="flex flex-wrap items-start gap-3 border-b border-stone-100 p-4">
        <PersonPhoto name={t.lead.name ?? t.lead.email} src={null} size="lg" />
        <div className="min-w-0 flex-1">
          <p className="flex items-center gap-2 text-[17px] font-semibold text-stone-900">
            {t.lead.name ?? t.lead.email} <ChannelLogo id="email" size="xs" />
          </p>
          <p className="truncate text-[13.5px] text-stone-500">
            {[t.lead.email, t.lead.company].filter(Boolean).join(" · ")} · {t.campaign.name}
          </p>
        </div>
        <ThreadButtons convKey={convKey} done={t.done || !t.needsReply} meeting={!!lead?.meetingAt} />
      </header>
      <div className="max-h-[55vh] min-h-0 flex-1 space-y-2.5 overflow-y-auto p-4 lg:max-h-none">
        {t.items.map((m) => (
          <Bubble key={m.id} out={m.out} meta={`${m.kind === "CAMPAIGN" ? `Campaign email ${(m.step ?? 0) + 1}` : m.kind === "AUTO_REPLY" ? "Auto-reply" : m.kind === "BOUNCE" ? "Bounce" : m.out ? "Your reply" : "Reply"} · ${timeAgo(m.at)}`}>
            {m.subject && <span className="mb-1 block text-[12.5px] font-semibold opacity-70">{m.subject}</span>}
            {m.text}
          </Bubble>
        ))}
      </div>
      <div className="border-t border-stone-100 p-4">
        <ReplyBox
          convKey={convKey}
          hint={t.mailbox ? `From ${t.mailbox.email}, in the same thread. Cmd/Ctrl + Enter to send.` : ""}
          disabled={!t.mailbox ? "The mailbox that wrote to them was removed, so a reply can't go out in the same thread." : null}
        />
      </div>
    </Card>
  );
}
