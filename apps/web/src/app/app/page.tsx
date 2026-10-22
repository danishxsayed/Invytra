import { prisma } from "@invytra/db";
import Link from "next/link";
import { AccountRow } from "@/components/AccountRow";
import { ActivityList } from "@/components/ActivityList";
import { requireUser } from "@/lib/auth";
import { accountsOverview, recentActivity, recentReplies } from "@/lib/data";
import { timeAgo } from "@/lib/format";

export const metadata = { title: "Overview" };
export const dynamic = "force-dynamic";

export default async function Overview() {
  const me = await requireUser();
  const wid = me.workspace.id;
  const [accounts, activity, replies] = await Promise.all([
    accountsOverview(prisma, wid),
    recentActivity(prisma, wid, { take: 12 }),
    recentReplies(prisma, wid, 8),
  ]);

  return (
    <div className="space-y-10">
      <header>
        <h1 className="text-2xl font-semibold">Overview</h1>
        <p className="text-ink-soft">How your LinkedIn accounts are doing today.</p>
      </header>

      <section aria-labelledby="accounts-h" className="space-y-3">
        <h2 id="accounts-h" className="text-lg font-semibold">LinkedIn accounts</h2>
        {accounts.length === 0 ? (
          <div className="rounded-lg border border-dashed border-line bg-white px-5 py-8">
            <p className="font-medium">Connect your first LinkedIn account</p>
            <p className="mt-1 max-w-prose text-ink-soft">
              You'll log in to LinkedIn in a secure window here, and Invytra will keep that session to send invites
              and messages within safe daily limits. Account connection arrives in the next update.
            </p>
          </div>
        ) : (
          accounts.map((a) => <AccountRow key={a.id} a={a} />)
        )}
      </section>

      <div className="grid gap-10 xl:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
        <section aria-labelledby="activity-h">
          <div className="flex items-baseline justify-between">
            <h2 id="activity-h" className="text-lg font-semibold">Latest activity</h2>
            <Link href="/app/activity" className="text-sm text-pine underline-offset-2 hover:underline">
              All activity
            </Link>
          </div>
          <ActivityList rows={activity} showAccount={accounts.length > 1} />
        </section>
        <section aria-labelledby="replies-h">
          <div className="flex items-baseline justify-between">
            <h2 id="replies-h" className="text-lg font-semibold">Latest replies</h2>
            <Link href="/app/inbox" className="text-sm text-pine underline-offset-2 hover:underline">
              Inbox
            </Link>
          </div>
          {replies.length === 0 ? (
            <p className="py-6 text-ink-soft">No replies yet. Inboxes are checked about once an hour.</p>
          ) : (
            <ul className="divide-y divide-line">
              {replies.map((m) => (
                <li key={m.id} className="py-3">
                  <p className="flex justify-between gap-3">
                    <span className="truncate font-medium">{m.fromName}</span>
                    <span className="shrink-0 text-sm text-ink-faint">{timeAgo(m.fetchedAt)}</span>
                  </p>
                  <p className="line-clamp-2 text-sm text-ink-soft">{m.text}</p>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
}
