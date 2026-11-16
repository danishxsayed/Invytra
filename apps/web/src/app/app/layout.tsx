import { prisma } from "@invytra/db";
import { cookies } from "next/headers";
import { PlanBanner } from "@/components/billing/PlanBanner";
import { ChannelShell } from "@/components/channel/ChannelShell";
import { LinkedinAccounts } from "@/components/linkedin/AccountSwitcher";
import { getAiBalance } from "@/lib/ai-credits";
import { requireChannel } from "@/lib/auth";
import { sidebarAccounts } from "@/lib/data";
import { hubHref } from "@/lib/domains";
import { needsReplyCount } from "@/lib/inbox";
import { SIDEBAR_COOKIE } from "@/lib/ui-prefs";
import { canSeeBilling, creditsHref } from "@/lib/workspace-nav";

/** LinkedIn Outreach, in the same frame as every channel (plus the account switcher). */
export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const me = await requireChannel("linkedin");
  const [accounts, needsReply, jar, ai] = await Promise.all([sidebarAccounts(prisma, me.workspace.id), needsReplyCount(prisma, me.workspace.id), cookies(), getAiBalance(prisma, me.workspace.id)]);
  return (
    <ChannelShell
      channel="linkedin"
      workspace={me.workspace.name}
      user={{ name: me.user.name, role: me.role }}
      collapsed={jar.get(SIDEBAR_COOKIE)?.value === "collapsed"}
      credits={{ left: ai.left, href: creditsHref(me) }}
      links={{ hub: hubHref("/"), billing: canSeeBilling(me) ? hubHref("/billing") : null }}
      inboxCount={needsReply}
      extra={<LinkedinAccounts accounts={accounts} />}
      banner={<PlanBanner workspaceId={me.workspace.id} owner={me.role === "OWNER"} />}
    >
      {children}
    </ChannelShell>
  );
}
