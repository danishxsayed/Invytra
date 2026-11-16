"use client";

import { insertMention, mentionQuery } from "@invytra/shared";
import { AtSign, FileText, Image as ImageIcon, Loader2, Lock, Paperclip, Reply, Send, StickyNote, Trash2, X, Zap } from "lucide-react";
import { useRef, useState, useTransition } from "react";
import { addNoteAction, deleteSavedReplyAction, saveSavedReplyAction, sendFileAction, sendTextAction } from "@/app/whatsapp/inbox/actions";
import type { ChatMessage } from "@/lib/whatsapp-inbox";
import { btn } from "../../btn";
import { cx } from "../../ui";
import { exclusive } from "./busy";

export type SavedReply = { id: string; shortcut: string; body: string };

/** Reply / Note tabs, files, saved replies ("/"), template button; a closed window only allows templates. */
export function Composer({
  chatId,
  firstName,
  windowOpen,
  optedOut,
  replyTo,
  saved,
  members,
  onClearReply,
  onTemplate,
  onSent,
}: {
  chatId: string;
  firstName: string;
  windowOpen: boolean;
  optedOut: boolean;
  replyTo: ChatMessage | null;
  saved: SavedReply[];
  /** Teammates who can be @mentioned in a note (not you). */
  members: { id: string; name: string }[];
  onClearReply: () => void;
  onTemplate: () => void;
  onSent: () => void;
}) {
  const [mode, setMode] = useState<"reply" | "note">("reply");
  const [text, setText] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [showSaved, setShowSaved] = useState(false);
  const [newSaved, setNewSaved] = useState<{ shortcut: string; body: string } | null>(null);
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const photo = useRef<HTMLInputElement>(null);
  const attach = useRef<HTMLInputElement>(null);
  const slash = mode === "reply" && /^\/\S*$/.test(text) ? saved.filter((s) => s.shortcut.startsWith(text.slice(1).toLowerCase())) : [];
  const mq = mode === "note" ? mentionQuery(text) : null;
  const mentions = mq === null ? [] : members.filter((m) => m.name.toLowerCase().split(/\s+/).some((w) => w.startsWith(mq.toLowerCase()))).slice(0, 6);
  const mention = (name: string) => setText(insertMention(text, name));
  const fill = (body: string) => setText(body.replace(/\{\{\s*(first_?name|name)\s*\}\}/gi, firstName));

  const send = () =>
    start(async () => {
      setError(null);
      const r = await exclusive(() => {
        if (mode === "note") return addNoteAction(chatId, text);
        if (file) {
          const f = new FormData();
          f.set("id", chatId);
          f.set("file", file);
          f.set("caption", text);
          return sendFileAction(f);
        }
        return sendTextAction(chatId, text, replyTo?.wamid ?? undefined);
      }).catch(() => ({ ok: false as const, error: "Couldn't reach Invytra. Check your connection and try again." }));
      if (!r.ok) {
        setError(r.error);
        return;
      }
      setText("");
      setFile(null);
      onClearReply();
      onSent();
    });

  if (optedOut)
    return <p className="rounded-2xl bg-rose-50 px-4 py-3 text-[14.5px] text-rose-800 ring-1 ring-rose-200">This person opted out of WhatsApp messages, so nothing can be sent. Notes still work from the contact panel.</p>;

  const closed = mode === "reply" && !windowOpen;
  const tool = "grid h-9 w-9 place-items-center rounded-lg text-stone-500 hover:bg-stone-100 hover:text-stone-800 disabled:opacity-40";

  return (
    <div className="space-y-2">
      <div className="inline-flex rounded-xl bg-white/80 p-1 shadow-sm ring-1 ring-stone-200">
        {(
          [
            ["reply", "Reply", Reply],
            ["note", "Note", StickyNote],
          ] as const
        ).map(([k, l, Icon]) => (
          <button key={k} type="button" onClick={() => setMode(k)} className={cx("inline-flex items-center gap-1.5 rounded-lg px-3.5 py-1.5 text-[14.5px] font-medium", mode === k ? (k === "note" ? "bg-amber-100 text-amber-900" : "bg-stone-900 text-white") : "text-stone-500 hover:text-stone-800")}>
            <Icon className="h-4 w-4" aria-hidden /> {l}
          </button>
        ))}
      </div>

      {closed ? (
        <div className="flex flex-wrap items-center gap-3 rounded-2xl bg-white px-4 py-3 shadow-sm ring-1 ring-stone-200">
          <Lock className="h-5 w-5 text-stone-400" aria-hidden />
          <p className="flex-1 text-[14.5px] text-stone-600">More than 24 hours since their last message: WhatsApp only allows an approved template until they reply.</p>
          <button type="button" className={btn.primary} onClick={onTemplate}>
            <FileText className="h-4 w-4" aria-hidden /> Send template
          </button>
        </div>
      ) : (
        <div className={cx("relative rounded-2xl shadow-sm ring-1", mode === "note" ? "bg-amber-50 ring-amber-200" : "bg-white ring-stone-200")}>
          {replyTo && mode === "reply" && (
            <div className="mx-3 mt-3 flex items-start gap-2 rounded-lg border-l-4 border-emerald-500 bg-stone-50 px-3 py-2 text-[13.5px]">
              <span className="min-w-0 flex-1">
                <span className="block font-semibold text-emerald-700">Replying to {replyTo.dir === "OUT" ? "you" : firstName || "them"}</span>
                <span className="line-clamp-1 text-stone-600">{replyTo.body || replyTo.kind.toLowerCase()}</span>
              </span>
              <button type="button" onClick={onClearReply} aria-label="Cancel reply" className="text-stone-400 hover:text-stone-700">
                <X className="h-4 w-4" aria-hidden />
              </button>
            </div>
          )}
          {file && (
            <div className="mx-3 mt-3 flex items-center gap-2 rounded-lg bg-stone-50 px-3 py-2 text-[14px] ring-1 ring-stone-200">
              <Paperclip className="h-4 w-4 text-stone-500" aria-hidden />
              <span className="min-w-0 flex-1 truncate">{file.name}</span>
              <span className="text-[12.5px] text-stone-400">{(file.size / 1024 / 1024).toFixed(1)} MB · the text below becomes its caption</span>
              <button type="button" onClick={() => setFile(null)} aria-label="Remove file" className="text-stone-400 hover:text-rose-600">
                <X className="h-4 w-4" aria-hidden />
              </button>
            </div>
          )}
          {mentions.length > 0 && (
            <div className="absolute bottom-full left-0 z-20 mb-2 w-full max-w-xs rounded-xl bg-white p-1.5 shadow-xl ring-1 ring-stone-200" role="listbox" aria-label="Mention a teammate">
              <p className="px-2 pb-1 pt-0.5 text-[12px] font-semibold uppercase tracking-wider text-stone-400">Mention a teammate</p>
              {mentions.map((m, i) => (
                <button key={m.id} type="button" role="option" aria-selected={i === 0} onMouseDown={(e) => e.preventDefault()} onClick={() => mention(m.name)} className={cx("flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-[14.5px] hover:bg-amber-50", i === 0 && "bg-amber-50/60")}>
                  <AtSign className="h-4 w-4 text-amber-600" aria-hidden /> {m.name}
                </button>
              ))}
              <p className="px-2 pt-1 text-[12px] text-stone-400">They&apos;ll get it in their bell.</p>
            </div>
          )}
          {(slash.length > 0 || showSaved) && (
            <div className="absolute bottom-full left-0 z-20 mb-2 max-h-72 w-full max-w-md overflow-y-auto rounded-xl bg-white p-2 shadow-xl ring-1 ring-stone-200">
              <p className="flex items-center justify-between px-2 pb-1 text-[12px] font-semibold uppercase tracking-wider text-stone-400">
                Saved replies
                {showSaved && (
                  <button type="button" onClick={() => setShowSaved(false)} aria-label="Close" className="text-stone-400 hover:text-stone-700">
                    <X className="h-3.5 w-3.5" aria-hidden />
                  </button>
                )}
              </p>
              {(slash.length ? slash : saved).map((s) => (
                <div key={s.id} className="group flex items-start gap-2 rounded-lg px-2 py-1.5 hover:bg-stone-50">
                  <button type="button" className="min-w-0 flex-1 text-left" onClick={() => (fill(s.body), setShowSaved(false))}>
                    <span className="font-mono text-[13px] text-emerald-700">/{s.shortcut}</span>
                    <span className="line-clamp-2 block text-[14px] text-stone-700">{s.body}</span>
                  </button>
                  {showSaved && (
                    <button type="button" onClick={() => start(async () => void (await deleteSavedReplyAction(s.id), onSent()))} className="p-1 text-stone-300 opacity-0 hover:text-rose-600 group-hover:opacity-100" aria-label={`Delete /${s.shortcut}`}>
                      <Trash2 className="h-3.5 w-3.5" aria-hidden />
                    </button>
                  )}
                </div>
              ))}
              {!saved.length && <p className="px-2 py-2 text-[14px] text-stone-500">None yet. Save answers you type often, like delivery times or COD.</p>}
              {showSaved &&
                (newSaved ? (
                  <div className="mt-1 space-y-2 border-t border-stone-100 p-2">
                    <input className="w-full rounded-lg border border-stone-200 px-2.5 py-1.5 font-mono text-[13.5px]" value={newSaved.shortcut} onChange={(e) => setNewSaved({ ...newSaved, shortcut: e.target.value })} placeholder="shortcut, e.g. cod" aria-label="Shortcut" />
                    <textarea className="w-full rounded-lg border border-stone-200 px-2.5 py-1.5 text-[14px]" rows={3} value={newSaved.body} onChange={(e) => setNewSaved({ ...newSaved, body: e.target.value })} placeholder="Yes {{first_name}}, we do cash on delivery…" aria-label="Reply" />
                    <div className="flex justify-end gap-2">
                      <button type="button" className="text-[13.5px] text-stone-500" onClick={() => setNewSaved(null)}>
                        Cancel
                      </button>
                      <button type="button" className="rounded-lg bg-emerald-600 px-3 py-1.5 text-[13.5px] font-semibold text-white" onClick={() => start(async () => {
                        const r = await saveSavedReplyAction(newSaved);
                        if (!r.ok) return setError(r.error);
                        setNewSaved(null);
                        onSent();
                      })}>
                        Save
                      </button>
                    </div>
                  </div>
                ) : (
                  <button type="button" onClick={() => setNewSaved({ shortcut: "", body: text })} className="mt-1 w-full rounded-lg px-2 py-1.5 text-left text-[14px] font-medium text-emerald-700 hover:bg-emerald-50">
                    + New saved reply
                  </button>
                ))}
            </div>
          )}
          <div className="flex items-end gap-1 px-2 py-2">
            {mode === "reply" && (
              <>
                <button type="button" className={tool} onClick={onTemplate} title="Send a template" aria-label="Send a template">
                  <FileText className="h-5 w-5" aria-hidden />
                </button>
                <button type="button" className={tool} onClick={() => photo.current?.click()} title="Photo or video" aria-label="Photo or video">
                  <ImageIcon className="h-5 w-5" aria-hidden />
                </button>
                <button type="button" className={tool} onClick={() => attach.current?.click()} title="File" aria-label="File">
                  <Paperclip className="h-5 w-5" aria-hidden />
                </button>
                <button type="button" className={tool} onClick={() => setShowSaved(!showSaved)} title="Saved replies" aria-label="Saved replies">
                  <Zap className="h-5 w-5" aria-hidden />
                </button>
                <input ref={photo} type="file" accept="image/jpeg,image/png,video/mp4" className="hidden" onChange={(e) => (setFile(e.target.files?.[0] ?? null), (e.target.value = ""))} />
                <input ref={attach} type="file" className="hidden" onChange={(e) => (setFile(e.target.files?.[0] ?? null), (e.target.value = ""))} />
              </>
            )}
            <textarea
              value={text}
              onChange={(e) => setText(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  if (slash.length === 1) return fill(slash[0]!.body);
                  if (mentions.length) return mention(mentions[0]!.name);
                  if ((text.trim() || file) && !pending) send();
                }
              }}
              rows={Math.min(6, Math.max(1, text.split("\n").length))}
              placeholder={mode === "note" ? "Write a note for your team (they don't see it)… type @ to mention someone" : `Reply to ${firstName || "them"}… type / for saved replies`}
              className="min-h-[40px] flex-1 resize-none bg-transparent px-2 py-2 text-[15px] outline-none placeholder:text-stone-400"
              aria-label={mode === "note" ? "Note" : "Reply"}
            />
            <button type="button" onClick={send} disabled={pending || (!text.trim() && !file)} className={cx("grid h-10 w-10 shrink-0 place-items-center rounded-xl text-white disabled:opacity-40", mode === "note" ? "bg-amber-500" : "bg-emerald-600 hover:bg-emerald-700")} aria-label={mode === "note" ? "Add note" : "Send"}>
              {pending ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : mode === "note" ? <StickyNote className="h-4 w-4" aria-hidden /> : <Send className="h-4 w-4" aria-hidden />}
            </button>
          </div>
        </div>
      )}
      {error && (
        <p role="alert" className="rounded-lg bg-rose-50 px-3 py-2 text-[14px] text-rose-800">
          {error}
        </p>
      )}
    </div>
  );
}
