import { MAILBOX_PRESETS, prisma } from "@invytra/db";
import { ConnectMailboxButton } from "@/components/email/ConnectMailbox";
import { MailboxList } from "@/components/email/MailboxList";
import { PageHeader } from "@/components/ui";
import { requireChannel } from "@/lib/auth";
import { listMailboxes } from "@/lib/mailboxes";

export const metadata = { title: "Mailboxes" };
export const dynamic = "force-dynamic";

export default async function MailboxesPage() {
  const me = await requireChannel("email");
  const mailboxes = await listMailboxes(prisma, me.workspace.id);
  const presets = Object.values(MAILBOX_PRESETS);
  return (
    <div className="space-y-6">
      <PageHeader
        title="Mailboxes"
        description="Mailboxes on your own domains that send your emails. Use a few per domain and keep each one's daily volume low: that's what keeps you out of spam."
        action={<ConnectMailboxButton presets={presets} />}
      />
      <MailboxList mailboxes={mailboxes} presets={presets} />
    </div>
  );
}
