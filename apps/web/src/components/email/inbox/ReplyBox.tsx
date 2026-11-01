"use client";

import { Check, Loader2, RotateCcw, Send } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { sendEmailReplyAction, setConversationDoneAction } from "@/app/email/inbox/actions";
import { btn } from "../../AccountControls";
import { inputCls } from "../../fields";
import { cx } from "../../ui";

/** Reply in the thread from the lead's mailbox (Ctrl/⌘ + Enter sends), or mark the conversation done. */
export function ReplyBox({ leadId, from, done, canReply }: { leadId: string; from: string | null; done: boolean; canReply: boolean }) {
  const router = useRouter();
  const [text, setText] = useState("");
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const send = () =>
    text.trim() &&
    start(async () => {
      setError(null);
      const r = await sendEmailReplyAction(leadId, { text });
      if (!r.ok) return setError(r.error);
      setText("");
      router.refresh();
    });
  const toggleDone = () =>
    start(async () => {
      const r = await setConversationDoneAction(leadId, !done);
      if (!r.ok) return setError(r.error);
      router.refresh();
    });
  return (
    <div className="border-t border-stone-200 bg-white p-4">
      {canReply ? (
        <>
          <textarea
            className={cx(inputCls, "mt-0 min-h-[110px]")}
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
                e.preventDefault();
                send();
              }
            }}
            placeholder={`Reply from ${from ?? "your mailbox"}… The signature is added below.`}
            disabled={pending}
          />
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <button className={btn.primary} onClick={send} disabled={pending || !text.trim()}>
              {pending ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <Send className="h-4 w-4" aria-hidden />} Send reply
            </button>
            <span className="text-[13px] text-stone-500">Ctrl / ⌘ + Enter sends. Goes out right away, in the same thread.</span>
            <button className={cx(btn.ghost, "ml-auto")} onClick={toggleDone} disabled={pending}>
              {done ? <RotateCcw className="h-4 w-4" aria-hidden /> : <Check className="h-4 w-4" aria-hidden />} {done ? "Mark not done" : "Mark done"}
            </button>
          </div>
        </>
      ) : (
        <p className="text-[14px] text-stone-500">The mailbox that wrote to this lead was removed, so you can't reply here.</p>
      )}
      {error && <p role="alert" className="mt-2 text-[14px] text-rose-700">{error}</p>}
    </div>
  );
}
