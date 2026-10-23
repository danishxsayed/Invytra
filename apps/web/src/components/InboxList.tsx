"use client";

import { Check, ExternalLink, Inbox, RotateCcw } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { setDoneAction } from "@/app/app/inbox/actions";
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
}

export function InboxList({ items, showAccount, emptyTitle, emptyBody }: { items: ReplyItem[]; showAccount: boolean; emptyTitle: string; emptyBody: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const mark = (id: string, done: boolean) =>
    start(async () => {
      await setDoneAction([id], done);
      router.refresh();
    });

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
              <div className="mt-2 flex flex-wrap items-center gap-2">
                {m.lead && (
                  <Link
                    href={`/app/campaigns/${m.lead.campaign.id}?filter=replied`}
                    className="rounded-full bg-brand-100 px-2.5 py-0.5 text-[13px] font-medium text-brand-800 hover:bg-brand-200"
                  >
                    {m.lead.campaign.name}
                  </Link>
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
