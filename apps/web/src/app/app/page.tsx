import { prisma } from "@invytra/db";
import { Activity, ArrowRight, Eye, Inbox, MessageSquare, UserPlus, Users } from "lucide-react";
import Link from "next/link";
import { AccountCard } from "@/components/AccountCard";
import { ActivityList } from "@/components/ActivityList";
import { Checklist } from "@/components/Checklist";
import { StatCard } from "@/components/StatCard";
import { Avatar, Card, CardHeader, EmptyState, PageHeader } from "@/components/ui";
import { requireUser } from "@/lib/auth";
import { accountsOverview, recentActivity, recentReplies, weeklyStats } from "@/lib/data";
import { timeAgo } from "@/lib/format";

export const metadata = { title: "Dashboard" };
export const dynamic = "force-dynamic";

function greeting(): string {
  const h = new Date().getHours();
  return h < 12 ? "Good morning" : h < 17 ? "Good afternoon" : "Good evening";
}

export default async function Dashboard() {
  const me = await requireUser();
  const wid = me.workspace.id;
  const [accounts, activity, replies, stats] = await Promise.all([
    accountsOverview(prisma, wid),
    recentActivity(prisma, wid, { take: 8 }),
    recentReplies(prisma, wid, 6),
    weeklyStats(prisma, wid),
  ]);
  const connected = accounts.some((a) => a.status === "ACTIVE");
  const many = accounts.length > 1;
  const link = (href: string, text: string) => (
    <Link href={href} className="inline-flex items-center gap-1 text-[15px] font-medium text-brand-800 hover:text-stone-900">
      {text} <ArrowRight className="h-3.5 w-3.5" aria-hidden />
    </Link>
  );

  return (
    <div className="space-y-6 animate-fade-up">
      <PageHeader title={`${greeting()}, ${me.user.name.split(" ")[0]}`} description="Here's how your LinkedIn outreach is going." />

      <Checklist
        steps={[
          { label: "Create your account", done: true, hint: "You're in." },
          { label: "Connect LinkedIn", done: connected, hint: "Log in through a secure window." },
          { label: "Add leads", done: false, hint: "Upload a CSV or paste profile links.", soon: true },
          { label: "Launch a campaign", done: false, hint: "Invite, wait, message, follow up.", soon: true },
        ]}
      />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label="Invites sent" icon={UserPlus} tone="bg-brand-100 text-brand-800" {...stats.invites} />
        <StatCard label="Messages sent" icon={MessageSquare} tone="bg-sky-50 text-sky-600" {...stats.messages} />
        <StatCard label="Profiles visited" icon={Eye} tone="bg-teal-50 text-teal-600" {...stats.visits} />
        <StatCard label="Replies" icon={Inbox} tone="bg-amber-50 text-amber-600" {...stats.replies} />
      </div>

      <section aria-label="LinkedIn accounts" className="space-y-3">
        {accounts.length === 0 ? (
          <Card>
            <EmptyState
              icon={Users}
              title="Connect your first LinkedIn account"
              body="You'll log in to LinkedIn in a secure window, and Invytra keeps the session to send invites and messages within safe daily limits."
              action={<span className="rounded-lg bg-stone-100 px-3 py-1.5 text-[15px] font-medium text-stone-500">Coming in the next update</span>}
            />
          </Card>
        ) : (
          accounts.map((a) => <AccountCard key={a.id} a={a} />)
        )}
      </section>

      <div className="grid items-start gap-6 xl:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
        <Card>
          <CardHeader title="Recent activity" icon={Activity} action={link("/app/activity", "View all")} />
          {activity.length === 0 ? (
            <EmptyState icon={Activity} title="No activity yet" body="Invites, messages and inbox checks show up here as soon as they run." />
          ) : (
            <ActivityList rows={activity} showAccount={many} compact />
          )}
        </Card>
        <Card>
          <CardHeader title="Latest replies" icon={Inbox} action={link("/app/inbox", "Open inbox")} />
          {replies.length === 0 ? (
            <EmptyState icon={Inbox} title="No replies yet" body="Inboxes are checked about once an hour during working hours." />
          ) : (
            <ul className="divide-y divide-stone-100">
              {replies.map((m) => (
                <li key={m.id} className="flex gap-3 px-5 py-3">
                  <Avatar name={m.fromName} />
                  <div className="min-w-0 flex-1">
                    <p className="flex items-baseline justify-between gap-3">
                      <span className="truncate text-[16px] font-medium text-stone-900">{m.fromName}</span>
                      <span className="shrink-0 text-[14px] text-stone-400">{timeAgo(m.fetchedAt)}</span>
                    </p>
                    <p className="line-clamp-2 text-[15px] text-stone-500">{m.text}</p>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </div>
  );
}
