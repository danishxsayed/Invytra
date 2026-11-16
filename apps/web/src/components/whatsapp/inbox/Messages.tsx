"use client";

import { AlertCircle, Check, CheckCheck, Clock, Download, FileText, MapPin, MousePointerClick, Reply, StickyNote, User } from "lucide-react";
import { Fragment } from "react";
import type { ChatMessage } from "@/lib/whatsapp-inbox";
import { cx } from "../../ui";
import { Rich } from "../WaBubble";

export type Note = { id: string; body: string; by: string; userId: string | null; at: string };
type Item = { t: "msg"; m: ChatMessage } | { t: "note"; n: Note };

const time = (iso: string) => new Date(iso).toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", hour12: false });
function dayLabel(iso: string) {
  const d = new Date(iso);
  const today = new Date();
  const y = new Date(Date.now() - 86_400_000);
  if (d.toDateString() === today.toDateString()) return "Today";
  if (d.toDateString() === y.toDateString()) return "Yesterday";
  return d.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", ...(d.getFullYear() !== today.getFullYear() && { year: "numeric" }) });
}

function Ticks({ status, error }: { status: string; error: string | null }) {
  if (status === "FAILED")
    return (
      <span className="inline-flex items-center gap-1 text-rose-600" title={error ?? "Not delivered"}>
        <AlertCircle className="h-3.5 w-3.5" aria-hidden /> Not delivered
      </span>
    );
  if (status === "READ") return <CheckCheck className="h-4 w-4 text-sky-500" aria-label="Read" />;
  if (status === "DELIVERED") return <CheckCheck className="h-4 w-4 text-stone-400" aria-label="Delivered" />;
  if (status === "SENT") return <Check className="h-4 w-4 text-stone-400" aria-label="Sent" />;
  return <Clock className="h-3.5 w-3.5 text-stone-400" aria-label="Sending" />;
}

function Media({ m }: { m: ChatMessage }) {
  const src = `/whatsapp/media/${m.id}`;
  const type = m.media?.type ?? "";
  if (m.kind === "IMAGE" || m.kind === "STICKER")
    return (
      <a href={src} target="_blank" rel="noreferrer" className="block">
        {/* eslint-disable-next-line @next/next/no-img-element -- a chat file served by our own route */}
        <img src={src} alt={m.body || "Photo"} loading="lazy" className={cx("rounded-lg object-cover", m.kind === "STICKER" ? "h-28 w-28" : "max-h-72 w-full min-w-[200px] bg-stone-100")} />
      </a>
    );
  if (m.kind === "VIDEO") return <video src={src} controls preload="metadata" className="max-h-72 w-full rounded-lg bg-black" />;
  if (m.kind === "AUDIO") return <audio src={src} controls preload="none" className="w-64 max-w-full" />;
  return (
    <a href={src} target="_blank" rel="noreferrer" className="flex items-center gap-3 rounded-lg bg-black/5 px-3 py-2.5 hover:bg-black/10">
      <span className="grid h-9 w-8 shrink-0 place-items-center rounded bg-rose-500 text-[9px] font-bold text-white">{type.includes("pdf") ? "PDF" : <FileText className="h-4 w-4" aria-hidden />}</span>
      <span className="min-w-0 flex-1 truncate text-[14px] font-medium text-stone-800">{m.media?.fileName ?? "Document"}</span>
      <Download className="h-4 w-4 shrink-0 text-stone-500" aria-hidden />
    </a>
  );
}

/** The conversation: day separators, their messages left, ours right (templates with buttons), notes in yellow. */
export function Messages({ messages, notes, onReply }: { messages: ChatMessage[]; notes: Note[]; onReply: (m: ChatMessage) => void }) {
  const byWamid = new Map(messages.filter((m) => m.wamid).map((m) => [m.wamid!, m]));
  const reactions = new Map<string, string[]>();
  for (const m of messages) if (m.kind === "REACTION" && m.replyTo && m.body) reactions.set(m.replyTo, [...(reactions.get(m.replyTo) ?? []), m.body]);
  const items: Item[] = [...messages.filter((m) => m.kind !== "REACTION").map((m): Item => ({ t: "msg", m })), ...notes.map((n): Item => ({ t: "note", n }))].sort((a, b) => (a.t === "msg" ? a.m.at : a.n.at).localeCompare(b.t === "msg" ? b.m.at : b.n.at));
  let lastDay = "";

  return (
    <div className="space-y-3">
      {items.map((it) => {
        const at = it.t === "msg" ? it.m.at : it.n.at;
        const day = dayLabel(at);
        const sep = day !== lastDay;
        lastDay = day;
        return (
          <Fragment key={it.t === "msg" ? it.m.id : it.n.id}>
            {sep && <p className="mx-auto w-fit rounded-lg bg-white/80 px-3 py-1 text-[12.5px] font-medium text-stone-500 shadow-sm">{day}</p>}
            {it.t === "note" ? (
              <div className="ml-auto max-w-[75%] rounded-xl bg-amber-50 px-3.5 py-2.5 text-[14.5px] text-amber-950 ring-1 ring-amber-200">
                <p className="mb-1 flex items-center gap-1.5 text-[12px] font-semibold uppercase tracking-wide text-amber-700">
                  <StickyNote className="h-3.5 w-3.5" aria-hidden /> Note · {it.n.by}
                </p>
                <p className="whitespace-pre-wrap break-words">{it.n.body}</p>
                <p className="mt-1 text-right text-[12px] text-amber-700/80">{time(it.n.at)} · only your team sees this</p>
              </div>
            ) : (
              <Bubble m={it.m} quoted={it.m.replyTo ? byWamid.get(it.m.replyTo) : undefined} reacts={it.m.wamid ? reactions.get(it.m.wamid) : undefined} onReply={onReply} />
            )}
          </Fragment>
        );
      })}
    </div>
  );
}

function Bubble({ m, quoted, reacts, onReply }: { m: ChatMessage; quoted?: ChatMessage; reacts?: string[]; onReply: (m: ChatMessage) => void }) {
  const out = m.dir === "OUT";
  const isMedia = !!m.media;
  return (
    <div className={cx("group flex items-end gap-2", out ? "justify-end" : "justify-start")}>
      {out && m.wamid && (
        <button type="button" onClick={() => onReply(m)} className="mb-6 rounded-full p-1.5 text-stone-400 opacity-0 transition hover:bg-white hover:text-stone-700 group-hover:opacity-100" aria-label="Reply to this">
          <Reply className="h-4 w-4" aria-hidden />
        </button>
      )}
      <div className={cx("max-w-[75%] sm:max-w-[65%]", out && "flex flex-col items-end")}>
        {m.kind === "BUTTON" ? (
          <div className="rounded-xl bg-white px-3.5 py-2 ring-2 ring-emerald-500/70">
            <p className="flex items-center gap-1.5 text-[12.5px] text-stone-500">
              <MousePointerClick className="h-3.5 w-3.5" aria-hidden /> Button reply
            </p>
            <p className="text-[15px] text-stone-900">{m.body}</p>
          </div>
        ) : (
          <div className={cx("relative rounded-2xl text-[15px] shadow-[0_1px_1px_rgba(0,0,0,0.06)]", out ? "rounded-br-md bg-[#d9fdd3] text-stone-900" : "rounded-bl-md bg-white text-stone-900", isMedia ? "p-1.5" : "px-3.5 py-2.5")}>
            {m.kind === "TEMPLATE" && (
              <p className="mb-1.5 flex items-center gap-1.5 text-[12px] font-semibold uppercase tracking-wide text-emerald-700">
                <FileText className="h-3.5 w-3.5" aria-hidden /> Template{m.extra?.template && <span className="font-mono normal-case tracking-normal">· {m.extra.template}</span>}
                {m.campaign && <span className="normal-case tracking-normal text-emerald-700/70">· {m.campaign}</span>}
              </p>
            )}
            {quoted && (
              <div className={cx("mb-1.5 rounded-lg border-l-4 border-emerald-500 bg-black/5 px-2.5 py-1.5 text-[13px] text-stone-600", isMedia && "mx-1 mt-1")}>
                <p className="font-semibold text-emerald-700">{quoted.dir === "OUT" ? "You" : "Them"}</p>
                <p className="line-clamp-2">{quoted.body || quoted.kind.toLowerCase()}</p>
              </div>
            )}
            {m.extra?.header && !["IMAGE", "VIDEO", "DOCUMENT", "LOCATION"].includes(m.extra.header) && <p className="mb-1 font-semibold">{m.extra.header}</p>}
            {isMedia && <Media m={m} />}
            {m.kind === "LOCATION" ? (
              <a href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(m.body.split(" · ").at(-1) ?? "")}`} target="_blank" rel="noreferrer" className="flex items-center gap-1.5 text-emerald-800 underline">
                <MapPin className="h-4 w-4" aria-hidden /> {m.body}
              </a>
            ) : m.kind === "CONTACT" ? (
              <p className="flex items-center gap-1.5">
                <User className="h-4 w-4" aria-hidden /> {m.body}
              </p>
            ) : m.kind === "UNSUPPORTED" ? (
              <p className="italic text-stone-500">A message WhatsApp can&apos;t show here (open WhatsApp on the phone to see it).</p>
            ) : (
              m.body && (
                <p className={cx("whitespace-pre-wrap break-words", isMedia && "px-2 pb-1 pt-1.5")}>
                  <Rich text={m.body} />
                </p>
              )
            )}
            {m.extra?.footer && <p className="mt-1 text-[13px] text-stone-500">{m.extra.footer}</p>}
            {m.extra?.buttons?.length ? (
              <div className="-mx-3.5 -mb-2.5 mt-2.5 divide-y divide-emerald-900/10 border-t border-emerald-900/10">
                {m.extra.buttons.map((b, i) => (
                  <p key={i} className="flex items-center justify-center gap-1.5 py-2 text-[14.5px] font-medium text-emerald-700">
                    <Reply className="h-4 w-4" aria-hidden /> {b}
                  </p>
                ))}
              </div>
            ) : null}
            {reacts && <span className="absolute -bottom-3 left-3 rounded-full bg-white px-1.5 py-0.5 text-[14px] shadow ring-1 ring-stone-200">{reacts.join("")}</span>}
          </div>
        )}
        <p className={cx("mt-1 flex items-center gap-1.5 px-1 text-[12px] text-stone-500", reacts && "mt-3.5")}>
          {time(m.at)}
          {out && <Ticks status={m.status} error={m.error} />}
          {out && m.by && <span>· {m.by}</span>}
        </p>
        {out && m.status === "FAILED" && m.error && <p className="max-w-xs px-1 text-right text-[12px] text-rose-600">{m.error}</p>}
      </div>
      {!out && m.wamid && (
        <button type="button" onClick={() => onReply(m)} className="mb-6 rounded-full p-1.5 text-stone-400 opacity-0 transition hover:bg-white hover:text-stone-700 group-hover:opacity-100" aria-label="Reply to this">
          <Reply className="h-4 w-4" aria-hidden />
        </button>
      )}
    </div>
  );
}
