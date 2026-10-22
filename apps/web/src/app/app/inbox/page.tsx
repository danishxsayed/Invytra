import { prisma } from "@invytra/db";
import { InboxList } from "@/components/InboxList";
import { Card, PageHeader } from "@/components/ui";
import { requireUser } from "@/lib/auth";
import { recentReplies } from "@/lib/data";
import { timeAgo } from "@/lib/format";

export const metadata = { title: "Inbox" };
export const dynamic = "force-dynamic";

export default async function InboxPage() {
  const me = await requireUser();
  const replies = await recentReplies(prisma, me.workspace.id, 200);
  const items = replies.map((m) => ({ id: m.id, fromName: m.fromName, text: m.text, when: timeAgo(m.fetchedAt), account: m.account.label }));
  return (
    <div className="space-y-6 animate-fade-up">
      <PageHeader title="Inbox" description="Replies from your LinkedIn conversations, checked about once an hour." />
      <Card className="overflow-hidden">
        <InboxList items={items} showAccount={new Set(items.map((i) => i.account)).size > 1} />
      </Card>
    </div>
  );
}
