"use client";

import { tagColor } from "@invytra/shared";
import { ArrowLeft, CheckCircle2, Clock, Loader2, PanelRight, Star, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import { deleteChatAction, pollInboxAction, updateChatAction } from "@/app/whatsapp/inbox/actions";
import type { WaContactDetail } from "@/lib/whatsapp-contact-detail";
import type { ChatMessage, ChatRow, InboxQuery } from "@/lib/whatsapp-inbox";
import { cx } from "../../ui";
import { WaChatBackground } from "../WaBubble";
import { ChatList, initials, type ListState } from "./ChatList";
import { ChatSide } from "./ChatSide";
import { Composer, type SavedReply } from "./Composer";
import type { FilterCounts } from "./FilterDialog";
import { Messages, type Note } from "./Messages";
import { TemplateSend, type InboxTemplate } from "./TemplateSend";

export interface OpenChat {
  id: string;
  name: string;
  firstName: string;
  phone: string;
  starred: boolean;
  assignedTo: string | null;
  done: boolean;
  optedOut: boolean;
  createdAt: string;
  windowEnds: string | null;
  messages: ChatMessage[];
  notes: Note[];
  detail: WaContactDetail;
}

const toQuery = (s: ListState): InboxQuery => ({
  tab: s.tab,
  assigned: s.assigned,
  q: s.q,
  campaigns: s.campaigns,
  tags: s.tags,
  window: s.window || undefined,
  reply: s.reply || undefined,
  read: s.read || undefined,
  since: s.since || undefined,
  sort: s.sort,
});
const toUrl = (s: ListState, c: string | null) => {
  const p = new URLSearchParams();
  if (c) p.set("c", c);
  if (s.tab !== "all") p.set("tab", s.tab);
  if (s.assigned) p.set("as", s.assigned);
  if (s.q) p.set("q", s.q);
  if (s.sort === "old") p.set("sort", "old");
  for (const x of s.campaigns) p.append("camp", x);
  for (const x of s.tags) p.append("tag", x);
  if (s.window) p.set("win", s.window);
  if (s.reply) p.set("rep", s.reply);
  if (s.read) p.set("read", s.read);
  if (s.since) p.set("since", s.since);
  return `/whatsapp/inbox${p.size ? `?${p}` : ""}`;
};
const left = (iso: string) => {
  const h = Math.max(0, (new Date(iso).getTime() - Date.now()) / 3_600_000);
  return h >= 1 ? `${Math.floor(h)}h left` : `${Math.max(1, Math.round(h * 60))}m left`;
};

/** The WhatsApp inbox: chats, the open conversation, and who you're talking to. */
export function InboxApp(p: { chats: ChatRow[]; counts: FilterCounts & { unread: number; priority: number }; state: ListState; members: { id: string; name: string }[]; me: string; chat: OpenChat | null; templates: InboxTemplate[]; saved: SavedReply[]; knownTags: string[] }) {
  const router = useRouter();
  const [chats, setChats] = useState(p.chats);
  const [msgs, setMsgs] = useState(p.chat?.messages ?? []);
  const [notes, setNotes] = useState(p.chat?.notes ?? []);
  const [windowEnds, setWindowEnds] = useState(p.chat?.windowEnds ?? null);
  const [replyTo, setReplyTo] = useState<ChatMessage | null>(null);
  const [tpl, setTpl] = useState(false);
  const [side, setSide] = useState(true);
  const [askDelete, setAskDelete] = useState(false);
  const [pending, start] = useTransition();
  const end = useRef<HTMLDivElement>(null);
  const openId = p.chat?.id ?? null;

  useEffect(() => setChats(p.chats), [p.chats]);
  useEffect(() => {
    setMsgs(p.chat?.messages ?? []);
    setNotes(p.chat?.notes ?? []);
    setWindowEnds(p.chat?.windowEnds ?? null);
    setReplyTo(null);
    setAskDelete(false);
  }, [p.chat]);

  const poll = useCallback(async () => {
    const r = await pollInboxAction(toQuery(p.state), openId);
    setChats(r.chats);
    if (r.chat) {
      setMsgs(r.chat.messages);
      setNotes(r.chat.notes);
      setWindowEnds(r.chat.windowEnds);
    }
  }, [p.state, openId]);
  useEffect(() => {
    const t = setInterval(() => document.visibilityState === "visible" && void poll(), 5000);
    return () => clearInterval(t);
  }, [poll]);
  const count = msgs.length + notes.length;
  useEffect(() => end.current?.scrollIntoView({ block: "end" }), [count, openId]);

  const go = (s: Partial<ListState>, c: string | null = openId) => router.push(toUrl({ ...p.state, ...s }, c), { scroll: false });
  const change = (ch: Parameters<typeof updateChatAction>[1]) => start(async () => void ((await updateChatAction(openId!, ch)).ok && router.refresh()));
  const refresh = () => {
    void poll();
    router.refresh();
  };

  const c = p.chat;
  const hue = c ? tagColor(c.name) : "#22c55e";
  return (
    <div className="grid h-[calc(100vh-140px)] min-h-[560px] overflow-hidden rounded-2xl bg-white ring-1 ring-stone-200 lg:grid-cols-[320px_minmax(0,1fr)] xl:grid-cols-[320px_minmax(0,1fr)_auto]">
      <aside className={cx("min-h-0 border-r border-stone-100", c && "hidden lg:block")}>
        <ChatList chats={chats} counts={p.counts} state={p.state} members={p.members} me={p.me} openId={openId} onState={(s) => go(s, null)} onOpen={(id) => go({}, id)} />
      </aside>

      {c ? (
        <section className="flex min-h-0 flex-col bg-[#f0ebe3]">
          <header className="flex items-center gap-2 border-b border-stone-200 bg-white px-4 py-3">
            <button type="button" onClick={() => go({}, null)} className="rounded-lg p-1.5 text-stone-500 hover:bg-stone-100 lg:hidden" aria-label="Back to chats">
              <ArrowLeft className="h-5 w-5" aria-hidden />
            </button>
            <span className="grid h-11 w-11 shrink-0 place-items-center rounded-full text-[14px] font-bold" style={{ background: `${hue}1f`, color: hue }}>
              {initials(c.name)}
            </span>
            <span className="min-w-[140px] flex-1">
              <span className="block truncate text-[17px] font-semibold text-stone-900">{c.name}</span>
              <span className="block truncate whitespace-nowrap text-[14px] tabular-nums text-stone-500">{c.phone}</span>
            </span>
            <span className={cx("inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full px-3 py-1.5 text-[13px] font-medium", windowEnds ? "bg-emerald-50 text-emerald-800" : "bg-stone-100 text-stone-500")} title="WhatsApp allows free-form replies for 24 hours after their last message">
              <Clock className="h-4 w-4" aria-hidden /> {windowEnds ? (
                <>
                  <span className="hidden 2xl:inline">Window open · </span>
                  {left(windowEnds)}
                </>
              ) : (
                "Window closed"
              )}
            </span>
            <button type="button" onClick={() => change({ starred: !c.starred })} className="rounded-lg p-2 hover:bg-stone-100" aria-label={c.starred ? "Remove from priority" : "Mark as priority"} title="Priority">
              <Star className={cx("h-5 w-5", c.starred ? "fill-emerald-500 text-emerald-500" : "text-stone-400")} aria-hidden />
            </button>
            <select value={c.assignedTo ?? ""} onChange={(e) => change({ assignedTo: e.target.value || null })} className="w-[130px] shrink-0 rounded-lg border border-stone-200 bg-white px-2 py-1.5 text-[13.5px]" aria-label="Assigned to">
              <option value="">Unassigned</option>
              {p.members.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.id === p.me ? `Me (${m.name.split(" ")[0]})` : m.name}
                </option>
              ))}
            </select>
            <button type="button" onClick={() => change({ done: !c.done })} className={cx("rounded-lg p-2 hover:bg-stone-100", c.done ? "text-emerald-600" : "text-stone-400")} aria-label={c.done ? "Reopen" : "Mark as done"} title={c.done ? "Done (click to reopen)" : "Mark as done"}>
              <CheckCircle2 className="h-5 w-5" aria-hidden />
            </button>
            <button type="button" onClick={() => setAskDelete(true)} className="rounded-lg p-2 text-stone-400 hover:bg-rose-50 hover:text-rose-600" aria-label="Delete chat" title="Delete chat">
              <Trash2 className="h-5 w-5" aria-hidden />
            </button>
            <button type="button" onClick={() => setSide(!side)} className={cx("hidden rounded-lg p-2 hover:bg-stone-100 xl:block", side ? "text-emerald-600" : "text-stone-400")} aria-label="Contact details" title="Contact details">
              <PanelRight className="h-5 w-5" aria-hidden />
            </button>
          </header>
          {askDelete && (
            <div className="flex flex-wrap items-center gap-3 bg-rose-50 px-4 py-2.5 text-[14px] text-rose-900">
              <span className="flex-1">Delete this chat from Invytra? Its messages and notes go (campaign results stay); the contact stays. It doesn&apos;t delete anything on their phone.</span>
              <button
                type="button"
                disabled={pending}
                onClick={() =>
                  start(async () => {
                    if ((await deleteChatAction(c.id)).ok) go({}, null);
                  })
                }
                className="inline-flex items-center gap-1.5 rounded-lg bg-rose-600 px-3 py-1.5 font-semibold text-white"
              >
                {pending && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />} Delete
              </button>
              <button type="button" onClick={() => setAskDelete(false)} className="font-medium underline">
                Cancel
              </button>
            </div>
          )}
          <WaChatBackground className="min-h-0 flex-1 overflow-y-auto px-4 py-5 sm:px-8">
            <Messages messages={msgs} notes={notes} onReply={(m) => setReplyTo(m)} />
            <div ref={end} />
          </WaChatBackground>
          <div className="border-t border-stone-200 bg-[#f7f4ef] px-4 py-3">
            <Composer chatId={c.id} firstName={c.firstName} windowOpen={!!windowEnds} optedOut={c.optedOut} replyTo={replyTo} saved={p.saved} onClearReply={() => setReplyTo(null)} onTemplate={() => setTpl(true)} onSent={refresh} />
          </div>
        </section>
      ) : (
        <section className="hidden place-items-center bg-stone-50 lg:grid xl:col-span-2">
          <div className="max-w-sm text-center">
            {/* eslint-disable-next-line @next/next/no-img-element -- static illustration */}
            <img src="/illustrations/inbox-message.svg" alt="" width={220} className="mx-auto" />
            <p className="mt-4 text-[16px] font-medium text-stone-800">Choose a chat to read and reply.</p>
            <p className="mt-1 text-[14px] text-stone-500">You can reply freely for 24 hours after someone&apos;s last message; after that, send a template.</p>
          </div>
        </section>
      )}

      {c && side && (
        <aside className="hidden min-h-0 w-[320px] overflow-y-auto border-l border-stone-100 xl:block">
          <ChatSide c={c.detail} notes={notes} createdAt={c.createdAt} knownTags={p.knownTags} me={p.me} onChanged={refresh} />
        </aside>
      )}
      {c && tpl && (
        <TemplateSend
          chatId={c.id}
          templates={p.templates}
          firstName={c.firstName}
          onClose={() => setTpl(false)}
          onSent={() => {
            setTpl(false);
            refresh();
          }}
        />
      )}
    </div>
  );
}
