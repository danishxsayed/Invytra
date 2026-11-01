import { prisma } from "@invytra/db";
import { Flame } from "lucide-react";
import { WarmupCard } from "@/components/email/WarmupCard";
import { Card, EmptyState, PageHeader } from "@/components/ui";
import { requireChannel } from "@/lib/auth";
import { warmupOverview } from "@/lib/warmup";

export const metadata = { title: "Warm-up" };
export const dynamic = "force-dynamic";

export default async function WarmupPage() {
  const me = await requireChannel("email");
  const rows = await warmupOverview(prisma, me.workspace.id);
  return (
    <div className="space-y-6">
      <PageHeader
        title="Warm-up"
        description="Builds each mailbox's reputation before and while it sends cold email. Mailboxes in the Invytra warm-up pool email each other a few times a day (2 on day 1, then 2 more each day). Invytra opens each one, moves it out of spam if it landed there and replies to some. Warm-up emails are filed in an “Invytra Warmup” folder so your inbox stays clean."
      />
      {rows.length === 0 ? (
        <Card>
          <EmptyState icon={Flame} title="No mailboxes yet" body="Connect a mailbox on the Mailboxes tab first, then turn on warm-up here." />
        </Card>
      ) : (
        <div className="space-y-4">
          {rows.map((r) => (
            <WarmupCard key={r.id} r={r} />
          ))}
        </div>
      )}
    </div>
  );
}
