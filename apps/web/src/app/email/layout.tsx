import { prisma } from "@invytra/db";
import { cookies } from "next/headers";
import { PlanBanner } from "@/components/billing/PlanBanner";
import { ChannelShell } from "@/components/channel/ChannelShell";
import { getAiBalance } from "@/lib/ai-credits";
import { requireChannel } from "@/lib/auth";
import { hubHref } from "@/lib/domains";
import { inboxCounts } from "@/lib/email-inbox";
import { SIDEBAR_COOKIE } from "@/lib/ui-prefs";
import { canSeeBilling, creditsHref } from "@/lib/workspace-nav";

/** Email Outreach: its own tool on the platform, in the same frame as every channel. */
export default async function EmailLayout({ children }: { children: React.ReactNode }) {
  const me = await requireChannel("email");
  const [{ needs }, ai, jar] = await Promise.all([inboxCounts(prisma, me.workspace.id), getAiBalance(prisma, me.workspace.id), cookies()]);
  return (
    <ChannelShell
      channel="email"
      workspace={me.workspace.name}
      user={{ name: me.user.name, role: me.role }}
      collapsed={jar.get(SIDEBAR_COOKIE)?.value === "collapsed"}
      credits={{ left: ai.left, href: creditsHref(me) }}
      links={{ hub: hubHref("/"), billing: canSeeBilling(me) ? hubHref("/billing") : null }}
      inboxCount={needs}
      banner={<PlanBanner workspaceId={me.workspace.id} owner={me.role === "OWNER"} />}
    >
      {children}
    </ChannelShell>
  );
}
