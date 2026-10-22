import { prisma } from "@invytra/db";
import { requireUser } from "@/lib/auth";
import { recentReplies } from "@/lib/data";
import { timeAgo } from "@/lib/format";

export const metadata = { title: "Inbox" };
export const dynamic = "force-dynamic";

export default async function InboxPage() {
  const me = await requireUser();
  const replies = await recentReplies(prisma, me.workspace.id, 200);
  const many = new Set(replies.map((r) => r.account.label)).size > 1;
  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-semibold">Inbox</h1>
        <p className="text-ink-soft">Replies found in your LinkedIn inboxes. Checked about once an hour during working hours.</p>
      </header>
      {replies.length === 0 ? (
        <p className="rounded-lg border border-dashed border-line bg-white px-5 py-8 text-ink-soft">
          No replies yet. When someone answers an invite or message, it shows up here.
        </p>
      ) : (
        <ul className="divide-y divide-line rounded-lg border border-line bg-white px-5">
          {replies.map((m) => (
            <li key={m.id} className="py-4">
              <p className="flex justify-between gap-3">
                <span className="font-medium">{m.fromName}</span>
                <span className="shrink-0 text-sm text-ink-faint">
                  {timeAgo(m.fetchedAt)}
                  {many && ` · ${m.account.label}`}
                </span>
              </p>
              <p className="mt-0.5 max-w-prose text-ink-soft">{m.text}</p>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
