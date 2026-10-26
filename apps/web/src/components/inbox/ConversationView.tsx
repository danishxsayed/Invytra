"use client";

import { ArrowLeft, Check, CirclePause, CirclePlay, ExternalLink, Loader2, Plus, RotateCcw, Send, X } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";
import { sendReplyAction, setDoneAction, setLeadPausedAction, setTagsAction } from "@/app/app/inbox/actions";
import { Avatar, cx } from "../ui";

export interface ConversationViewData {
  id: string;
  name: string;
  account: { label: string; active: boolean };
  lead: {
    profileUrl: string;
    headline: string;
    campaign: { id: string; name: string };
    progress: string;
    paused: boolean;
    canPause: boolean;
  } | null;
  tags: string[];
  done: boolean;
  messages: { id: string; fromMe: boolean; text: string; time: string; day: string }[];
  pending: { id: string; text: string; failed: boolean; error: string | null }[];
}

const pill =
  "inline-flex items-center gap-1.5 rounded-lg border border-stone-200 bg-white px-2.5 py-1.5 text-[14px] font-medium text-stone-700 hover:border-stone-300 hover:bg-stone-50 disabled:opacity-50";

export function ConversationView({ c, suggestions, backHref }: { c: ConversationViewData; suggestions: string[]; backHref: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const bottom = useRef<HTMLDivElement>(null);

  const sending = c.pending.some((p) => !p.failed);
  useEffect(() => {
    if (!sending) return;
    const t = setInterval(() => router.refresh(), 4000);
    return () => clearInterval(t);
  }, [sending, router]);
  // Newer browsers return a promise from scrollIntoView; an effect must return nothing.
  useEffect(() => {
    bottom.current?.scrollIntoView({ block: "end" });
  }, [c.id, c.messages.length, c.pending.length]);

  const run = (fn: () => Promise<{ ok: boolean; error?: string }>) =>
    start(async () => {
      setError(null);
      const r = await fn();
      if (!r.ok) setError(r.error ?? "Something went wrong.");
      router.refresh();
    });

  return (
    <div className="flex h-full min-h-0 flex-col">
      {/* Header */}
      <div className="border-b border-stone-100 px-5 py-4">
        <Link href={backHref} className="mb-2 inline-flex items-center gap-1 text-[14px] font-medium text-stone-500 hover:text-stone-900 lg:hidden">
          <ArrowLeft className="h-4 w-4" aria-hidden /> Conversations
        </Link>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="flex min-w-0 items-center gap-3">
            <Avatar name={c.name} size="lg" />
            <div className="min-w-0">
              <p className="truncate text-[18px] font-semibold text-stone-900">{c.name}</p>
              <p className="truncate text-[14px] text-stone-500">
                {c.lead?.headline ? `${c.lead.headline} · ` : ""}via {c.account.label}
              </p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {c.lead && (
              <a href={c.lead.profileUrl} target="_blank" rel="noreferrer noopener" className={pill}>
                <ExternalLink className="h-3.5 w-3.5" aria-hidden /> Profile
              </a>
            )}
            {c.lead?.paused ? (
              <button className={pill} disabled={pending} onClick={() => run(() => setLeadPausedAction(c.id, false))}>
                <CirclePlay className="h-3.5 w-3.5" aria-hidden /> Resume campaign
              </button>
            ) : (
              c.lead?.canPause && (
                <button className={pill} disabled={pending} onClick={() => run(() => setLeadPausedAction(c.id, true))} title="Stop the campaign's next steps for this person">
                  <CirclePause className="h-3.5 w-3.5" aria-hidden /> Pause campaign
                </button>
              )
            )}
            {c.done ? (
              <button className={pill} disabled={pending} onClick={() => run(() => setDoneAction([c.id], false))}>
                <RotateCcw className="h-3.5 w-3.5" aria-hidden /> Needs reply
              </button>
            ) : (
              <button className={pill} disabled={pending} onClick={() => run(() => setDoneAction([c.id], true))}>
                <Check className="h-3.5 w-3.5" aria-hidden /> Mark done
              </button>
            )}
          </div>
        </div>
        {c.lead && (
          <p className="mt-2.5 text-[14px] text-stone-500">
            <Link href={`/app/campaigns/${c.lead.campaign.id}`} className="font-medium text-brand-800 hover:underline">
              {c.lead.campaign.name}
            </Link>{" "}
            · Progress {c.lead.progress}
          </p>
        )}
        <Tags id={c.id} tags={c.tags} suggestions={suggestions} />
        {error && <p className="mt-2 text-[14px] text-rose-700">{error}</p>}
      </div>

      {/* Messages */}
      <div className="min-h-0 flex-1 overflow-y-auto bg-stone-50/50 px-5 py-4">
        {c.messages.length === 0 && c.pending.length === 0 && (
          <p className="py-10 text-center text-[15px] text-stone-500">The messages show up after the next inbox check.</p>
        )}
        <ol className="space-y-2">
          {c.messages.map((m, i) => (
            <li key={m.id}>
              {(i === 0 || c.messages[i - 1]!.day !== m.day) && (
                <p className="my-3 text-center text-[13px] font-medium uppercase tracking-wide text-stone-400">{m.day}</p>
              )}
              <Bubble fromMe={m.fromMe} text={m.text} meta={`${m.fromMe ? "You" : c.name.split(" ")[0]} · ${m.time}`} />
            </li>
          ))}
          {c.pending.map((p) => (
            <li key={p.id}>
              <Bubble fromMe text={p.text} meta={p.failed ? `Not sent: ${p.error ?? "something went wrong"}` : "Sending…"} warn={p.failed} faint={!p.failed} />
            </li>
          ))}
        </ol>
        <div ref={bottom} />
      </div>

      <ReplyBox id={c.id} name={c.name} active={c.account.active} accountLabel={c.account.label} />
    </div>
  );
}

function Bubble({ fromMe, text, meta, warn, faint }: { fromMe: boolean; text: string; meta: string; warn?: boolean; faint?: boolean }) {
  return (
    <div className={cx("flex flex-col", fromMe ? "items-end" : "items-start")}>
      <div
        className={cx(
          "max-w-[85%] whitespace-pre-wrap rounded-2xl px-3.5 py-2 text-[15px] leading-relaxed sm:max-w-[70%]",
          fromMe ? "rounded-br-md bg-stone-900 text-white" : "rounded-bl-md border border-stone-200 bg-white text-stone-800",
          faint && "opacity-60",
        )}
      >
        {text}
      </div>
      <p className={cx("mt-1 px-1 text-[12px]", warn ? "text-rose-700" : "text-stone-400")}>{meta}</p>
    </div>
  );
}

function Tags({ id, tags, suggestions }: { id: string; tags: string[]; suggestions: string[] }) {
  const router = useRouter();
  const [adding, setAdding] = useState(false);
  const [value, setValue] = useState("");
  const [pending, start] = useTransition();
  const save = (next: string[]) =>
    start(async () => {
      await setTagsAction(id, next);
      router.refresh();
    });
  const add = (t: string) => {
    const tag = t.trim();
    setValue("");
    setAdding(false);
    if (tag && !tags.includes(tag)) save([...tags, tag]);
  };
  const offers = suggestions.filter((s) => !tags.includes(s));
  return (
    <div className="mt-3 flex flex-wrap items-center gap-1.5">
      {tags.map((t) => (
        <span key={t} className="inline-flex items-center gap-1 rounded-full bg-violet-50 px-2.5 py-0.5 text-[13px] font-medium text-violet-700">
          {t}
          <button aria-label={`Remove tag ${t}`} disabled={pending} onClick={() => save(tags.filter((x) => x !== t))} className="rounded-full hover:text-violet-950">
            <X className="h-3 w-3" />
          </button>
        </span>
      ))}
      {adding ? (
        <span className="inline-flex flex-wrap items-center gap-1.5">
          <input
            autoFocus
            aria-label="New tag"
            value={value}
            maxLength={30}
            onChange={(e) => setValue(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") add(value);
              if (e.key === "Escape") setAdding(false);
            }}
            placeholder="Tag name"
            className="w-36 rounded-full border border-stone-300 px-2.5 py-0.5 text-[13px] focus:outline-none focus:ring-2 focus:ring-brand-200"
          />
          {offers.slice(0, 6).map((s) => (
            <button key={s} onClick={() => add(s)} className="rounded-full border border-dashed border-stone-300 px-2.5 py-0.5 text-[13px] text-stone-600 hover:border-stone-400 hover:text-stone-900">
              {s}
            </button>
          ))}
        </span>
      ) : (
        <button onClick={() => setAdding(true)} className="inline-flex items-center gap-1 rounded-full border border-dashed border-stone-300 px-2.5 py-0.5 text-[13px] font-medium text-stone-500 hover:border-stone-400 hover:text-stone-800">
          <Plus className="h-3 w-3" aria-hidden /> Tag
        </button>
      )}
    </div>
  );
}

function ReplyBox({ id, name, active, accountLabel }: { id: string; name: string; active: boolean; accountLabel: string }) {
  const router = useRouter();
  const [text, setText] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  useEffect(() => {
    setText("");
    setError(null);
  }, [id]);
  const send = () =>
    start(async () => {
      setError(null);
      const r = await sendReplyAction(id, text);
      if (!r.ok) return setError(r.error);
      setText("");
      router.refresh();
    });
  if (!active) {
    return <p className="border-t border-stone-100 px-5 py-4 text-[14px] text-stone-500">Connect “{accountLabel}” again to reply from here.</p>;
  }
  return (
    <div className="border-t border-stone-100 bg-white px-5 py-3">
      <textarea
        aria-label={`Reply to ${name}`}
        value={text}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && (e.metaKey || e.ctrlKey) && text.trim()) send();
        }}
        rows={3}
        maxLength={2000}
        placeholder={`Write a reply to ${name.split(" ")[0]}…`}
        className="w-full resize-none rounded-xl border border-stone-200 bg-white px-3.5 py-2.5 text-[15px] text-stone-900 placeholder:text-stone-400 focus:border-stone-400 focus:outline-none focus:ring-4 focus:ring-brand-200"
      />
      {error && <p role="alert" className="mt-1 text-[14px] text-rose-700">{error}</p>}
      <div className="mt-2 flex items-center justify-between gap-2">
        <p className="text-[13px] text-stone-500">Sent from {accountLabel} within a minute · ⌘/Ctrl + Enter</p>
        <button
          onClick={send}
          disabled={pending || !text.trim()}
          className="inline-flex items-center gap-1.5 rounded-lg bg-stone-900 px-3.5 py-2 text-[14px] font-medium text-white hover:bg-stone-700 disabled:opacity-50"
        >
          {pending ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <Send className="h-4 w-4" aria-hidden />} Send
        </button>
      </div>
    </div>
  );
}
