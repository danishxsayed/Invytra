import { prisma } from "@invytra/db";
import { Eye, Inbox, MessageSquare, Plus, UserPlus, Users } from "lucide-react";
import Link from "next/link";
import { AccountPanel } from "@/components/AccountPanel";
import { Checklist } from "@/components/Checklist";
import { StatCard } from "@/components/StatCard";
import { WeekTable } from "@/components/WeekTable";
import { Card, EmptyState, PageHeader } from "@/components/ui";
import { requireUser } from "@/lib/auth";
import { isValidTimeZone } from "@/lib/accounts";
import { accountsOverview, weekTable, weeklyStats } from "@/lib/data";
import { leadCount } from "@/lib/leads";
import { launchedCampaignCount } from "@/lib/campaigns";

export const metadata = { title: "Dashboard" };
export const dynamic = "force-dynamic";

function greeting(): string {
  const h = new Date().getHours();
  return h < 12 ? "Good morning" : h < 17 ? "Good afternoon" : "Good evening";
}

export default async function Dashboard() {
  const me = await requireUser();
  const wid = me.workspace.id;
  const [accounts, stats, leads, launched] = await Promise.all([
    accountsOverview(prisma, wid),
    weeklyStats(prisma, wid),
    leadCount(prisma, wid),
    launchedCampaignCount(prisma, wid),
  ]);
  const timeZone = accounts.find((a) => isValidTimeZone(a.timezone))?.timezone ?? "Asia/Kolkata";
  const week = await weekTable(prisma, wid, timeZone);
  const connected = accounts.some((a) => a.status === "ACTIVE");

  return (
    <div className="space-y-6 animate-fade-up">
      <PageHeader title={`${greeting()}, ${me.user.name.split(" ")[0]}`} description="Here's how your LinkedIn outreach is going." />

      <Checklist
        steps={[
          { label: "Create your account", done: true, hint: "You're in." },
          { label: "Connect LinkedIn", done: connected, hint: "Log in through a secure window.", href: "/app/accounts?add=1" },
          { label: "Add leads", done: leads > 0, hint: "Upload a CSV or paste profile links.", href: "/app/leads" },
          { label: "Launch a campaign", done: launched > 0, hint: "Invite, wait, message, follow up.", href: "/app/campaigns/new" },
        ]}
      />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label="Invites sent" icon={UserPlus} tone="bg-brand-100 text-brand-800" {...stats.invites} />
        <StatCard label="Messages sent" icon={MessageSquare} tone="bg-sky-50 text-sky-600" {...stats.messages} />
        <StatCard label="Profiles visited" icon={Eye} tone="bg-teal-50 text-teal-600" {...stats.visits} />
        <StatCard label="Replies" icon={Inbox} tone="bg-amber-50 text-amber-600" {...stats.replies} />
      </div>

      <WeekTable data={week} timeZone={timeZone} />

      <section aria-label="LinkedIn accounts" className="space-y-3">
        {accounts.length === 0 ? (
          <Card>
            <EmptyState
              icon={Users}
              title="Connect your first LinkedIn account"
              body="You'll log in to LinkedIn in a secure window, and Invytra keeps the session to send invites and messages within safe daily limits."
              action={
                <Link href="/app/accounts?add=1" className="inline-flex items-center gap-1.5 rounded-lg bg-brand-400 px-3.5 py-2 text-[15px] font-semibold text-stone-900 shadow-glow hover:bg-brand-300">
                  <Plus className="h-4 w-4" aria-hidden /> Add LinkedIn account
                </Link>
              }
            />
          </Card>
        ) : (
          accounts.map((a) => <AccountPanel key={a.id} a={a} full={false} />)
        )}
      </section>
    </div>
  );
}
