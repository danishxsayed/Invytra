"use client";

import { CalendarCheck, Check, Loader2, RotateCcw, Send } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { replyAction, setDoneAction, setMeetingAction } from "@/app/workspace/inbox/actions";
import { btn } from "../AccountControls";
import { cx } from "../ui";

/** Done / not done and "Meeting booked" for one conversation. */
export function ThreadButtons({ convKey, done, meeting }: { convKey: string; done: boolean; meeting: boolean }) {
  const router = useRouter();
  const [busy, start] = useTransition();
  const run = (f: () => Promise<unknown>) => start(async () => (await f(), router.refresh()));
  return (
    <div className="flex flex-wrap gap-2">
      <button type="button" disabled={busy} onClick={() => run(() => setMeetingAction(convKey, !meeting))} className={cx(btn.secondary, meeting && "border-emerald-300 bg-emerald-50 text-emerald-800 hover:bg-emerald-50")} aria-pressed={meeting}>
        <CalendarCheck className="h-4 w-4" aria-hidden /> {meeting ? "Meeting booked" : "Mark meeting booked"}
      </button>
      <button type="button" disabled={busy} onClick={() => run(() => setDoneAction(convKey, !done))} className={btn.secondary}>
        {done ? <RotateCcw className="h-4 w-4" aria-hidden /> : <Check className="h-4 w-4" aria-hidden />} {done ? "Not done" : "Mark done"}
      </button>
    </div>
  );
}

/** Writing back, from the same LinkedIn account or mailbox. */
export function ReplyBox({ convKey, hint, disabled }: { convKey: string; hint: string; disabled?: string | null }) {
  const router = useRouter();
  const [text, setText] = useState("");
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, start] = useTransition();
  if (disabled) return <p className="rounded-xl bg-amber-50 px-4 py-3 text-[14px] text-amber-900">{disabled}</p>;
  return (
    <form
      className="space-y-2"
      onSubmit={(e) => {
        e.preventDefault();
        start(async () => {
          const r = await replyAction(convKey, text);
          if (!r.ok) return setMsg({ ok: false, text: r.error });
          setText("");
          setMsg({ ok: true, text: "Sent." });
          router.refresh();
        });
      }}
    >
      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) (e.currentTarget.form as HTMLFormElement).requestSubmit();
        }}
        rows={3}
        placeholder="Write your reply…"
        aria-label="Your reply"
        className="w-full rounded-xl border border-stone-300 bg-white px-3.5 py-2.5 text-[15px] leading-relaxed focus:border-stone-500 focus:outline-none"
      />
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className={cx("text-[13px]", msg ? (msg.ok ? "text-emerald-700" : "text-rose-700") : "text-stone-500")}>{msg?.text ?? hint}</p>
        <button type="submit" className={btn.primary} disabled={busy || !text.trim()}>
          {busy ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <Send className="h-4 w-4" aria-hidden />} Send
        </button>
      </div>
    </form>
  );
}
