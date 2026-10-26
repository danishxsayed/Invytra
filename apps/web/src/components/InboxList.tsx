"use client";

import { Check, CornerUpLeft, ExternalLink, Inbox, Loader2, RotateCcw, Send } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import { sendReplyAction, setDoneAction } from "@/app/app/inbox/actions";
import { Avatar, EmptyState, cx } from "./ui";

export interface ReplyItem {
  id: string;
  fromName: string;
  text: string;
  when: string;
  account: string;
  done: boolean;
  /** Answered by you on LinkedIn (our message is the latest in the conversation). */
  answered: boolean;
  lead: { profileUrl: string; company: string | null; title: string | null; campaign: { id: string; name: string } } | null;
  /** The sending account is connected and active. */
  canReply: boolean;
  /** Replies sent (or being sent) from Invytra. */
  replies: { id: string; text: string; status: "QUEUED" | "RUNNING" | "SUCCEEDED" | "SKIPPED" | "FAILED"; error: string | null; when: string }[];
}

export function InboxList({ items, showAccount, emptyTitle, emptyBody }: { items: ReplyItem[]; showAccount: boolean; emptyTitle: string; emptyBody: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const mark = (id: string, done: boolean) =>
    start(async () => {
      await setDoneAction([id], done);
      router.refresh();
    });

  const [open, setOpen] = useState<string | null>(null);
  // While a reply is on its way, refresh every few seconds to show when it's sent.
  const sending = items.some((m) => m.replies.some((r) => r.status === "QUEUED" || r.status === "RUNNING"));
  useEffect(() => {
    if (!sending) return;
    const t = setInterval(() => router.refresh(), 4000);
    return () => clearInterval(t);
  }, [sending, router]);

  if (items.length === 0) return <EmptyState icon={Inbox} title={emptyTitle} body={emptyBody} />;
  return (
    <ul className="divide-y divide-stone-100">
      {items.map((m) => {
        const handled = m.done || m.answered;
        const who = m.lead ? [m.lead.title, m.lead.company].filter(Boolean).join(" · ") : "";
        return (
          <li key={m.id} className={cx("flex gap-3 px-5 py-4", handled ? "bg-stone-50/40" : "hover:bg-stone-50/60")}>
            <Avatar name={m.fromName} size="lg" />
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-baseline justify-between gap-x-3">
                <p className="min-w-0 truncate">
                  <span className={cx("text-[16px] font-semibold", handled ? "text-stone-500" : "text-stone-900")}>{m.fromName}</span>
                  {who && <span className="text-[14px] text-stone-500"> · {who}</span>}
                </p>
                <span className="shrink-0 text-[14px] text-stone-400">
                  {m.when}
                  {showAccount && ` · ${m.account}`}
                </span>
              </div>
              <p className={cx("mt-0.5 max-w-prose whitespace-pre-wrap text-[16px]", handled ? "text-stone-500" : "text-stone-700")}>{m.text}</p>
              {m.replies.length > 0 && (
                <ul className="mt-2.5 space-y-1.5">
                  {m.replies.map((r) => (
                    <li key={r.id} className="max-w-prose rounded-xl bg-brand-50 px-3.5 py-2 text-[15px] text-stone-800">
                      <p className="whitespace-pre-wrap">{r.text}</p>
                      <p className={cx("mt-0.5 text-[13px]", r.status === "FAILED" || r.status === "SKIPPED" ? "text-rose-700" : "text-stone-500")}>
                        You ·{" "}
                        {r.status === "SUCCEEDED"
                          ? `Sent ${r.when}`
                          : r.status === "FAILED" || r.status === "SKIPPED"
                            ? `Not sent: ${r.error ?? "something went wrong"}`
                            : "Sending…"}
                      </p>
                    </li>
                  ))}
                </ul>
              )}
              {open === m.id && <ReplyBox id={m.id} name={m.fromName} onClose={() => setOpen(null)} />}
              <div className="mt-2 flex flex-wrap items-center gap-2">
                {m.lead && (
                  <Link
                    href={`/app/campaigns/${m.lead.campaign.id}?filter=replied`}
                    className="rounded-full bg-brand-100 px-2.5 py-0.5 text-[13px] font-medium text-brand-800 hover:bg-brand-200"
                  >
                    {m.lead.campaign.name}
                  </Link>
                )}
                {m.canReply && open !== m.id && (
                  <button
                    onClick={() => setOpen(m.id)}
                    className="inline-flex items-center gap-1 rounded-lg border border-stone-200 bg-white px-2.5 py-1 text-[14px] font-medium text-stone-700 hover:border-stone-300 hover:bg-stone-50"
                  >
                    <CornerUpLeft className="h-3.5 w-3.5" aria-hidden /> Reply
                  </button>
                )}
                {m.answered && !m.done && <span className="rounded-full bg-stone-100 px-2.5 py-0.5 text-[13px] font-medium text-stone-600">You replied</span>}
                <a
                  href={m.lead?.profileUrl ?? "https://www.linkedin.com/messaging/"}
                  target="_blank"
                  rel="noreferrer noopener"
                  className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-[14px] font-medium text-stone-600 hover:bg-stone-100 hover:text-stone-900"
                >
                  <ExternalLink className="h-3.5 w-3.5" aria-hidden /> {m.lead ? "Profile" : "Open LinkedIn"}
                </a>
                {handled ? (
                  <button
                    disabled={pending}
                    onClick={() => mark(m.id, false)}
                    className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-[14px] font-medium text-stone-500 hover:bg-stone-100 hover:text-stone-900"
                  >
                    <RotateCcw className="h-3.5 w-3.5" aria-hidden /> Needs reply
                  </button>
                ) : (
                  <button
                    disabled={pending}
                    onClick={() => mark(m.id, true)}
                    className="inline-flex items-center gap-1 rounded-lg border border-stone-200 bg-white px-2.5 py-1 text-[14px] font-medium text-stone-700 hover:border-stone-300 hover:bg-stone-50"
                  >
                    <Check className="h-3.5 w-3.5" aria-hidden /> Mark done
                  </button>
                )}
              </div>
            </div>
          </li>
        );
      })}
    </ul>
  );
}

/** Write a reply; the worker sends it from that LinkedIn account within seconds. */
function ReplyBox({ id, name, onClose }: { id: string; name: string; onClose: () => void }) {
  const router = useRouter();
  const [text, setText] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const send = () =>
    start(async () => {
      setError(null);
      const r = await sendReplyAction(id, text);
      if (!r.ok) return setError(r.error);
      onClose();
      router.refresh();
    });
  return (
    <div className="mt-3 max-w-prose">
      <textarea
        autoFocus
        aria-label={`Reply to ${name}`}
        value={text}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && (e.metaKey || e.ctrlKey) && text.trim()) send();
        }}
        rows={3}
        maxLength={2000}
        placeholder={`Reply to ${name.split(" ")[0]}…`}
        className="w-full rounded-xl border border-stone-200 bg-white px-3.5 py-2.5 text-[15px] text-stone-900 placeholder:text-stone-400 focus:border-stone-400 focus:outline-none focus:ring-4 focus:ring-brand-200"
      />
      {error && <p role="alert" className="mt-1.5 text-[14px] text-rose-700">{error}</p>}
      <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
        <p className="text-[13px] text-stone-500">Sent from this LinkedIn account within a minute. ⌘/Ctrl + Enter to send.</p>
        <div className="flex gap-2">
          <button onClick={onClose} disabled={pending} className="rounded-lg px-3 py-1.5 text-[14px] font-medium text-stone-600 hover:bg-stone-100">
            Cancel
          </button>
          <button
            onClick={send}
            disabled={pending || !text.trim()}
            className="inline-flex items-center gap-1.5 rounded-lg bg-stone-900 px-3 py-1.5 text-[14px] font-medium text-white hover:bg-stone-700 disabled:opacity-50"
          >
            {pending ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden /> : <Send className="h-3.5 w-3.5" aria-hidden />} Send
          </button>
        </div>
      </div>
    </div>
  );
}
