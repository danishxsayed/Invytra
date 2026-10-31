import { prisma } from "@invytra/db";
import { cookies } from "next/headers";
import { MainFrame } from "@/components/MainFrame";
import { Sidebar } from "@/components/Sidebar";
import { SIDEBAR_COOKIE } from "@/lib/ui-prefs";
import { requireChannel } from "@/lib/auth";
import { sidebarAccounts } from "@/lib/data";
import { needsReplyCount } from "@/lib/inbox";
import { hubHref } from "@/lib/domains";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const me = await requireChannel("linkedin");
  const [accounts, needsReply, jar] = await Promise.all([sidebarAccounts(prisma, me.workspace.id), needsReplyCount(prisma, me.workspace.id), cookies()]);
  return (
    <div className="min-h-screen lg:flex">
      <Sidebar workspace={me.workspace.name} user={{ name: me.user.name, email: me.user.email }} accounts={accounts} needsReply={needsReply} collapsed={jar.get(SIDEBAR_COOKIE)?.value === "collapsed"} hubHref={hubHref("/")} />
      <main className="min-w-0 flex-1">
        <MainFrame>{children}</MainFrame>
      </main>
    </div>
  );
}
