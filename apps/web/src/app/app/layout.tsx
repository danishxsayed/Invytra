import { prisma } from "@invytra/db";
import { Sidebar } from "@/components/Sidebar";
import { requireUser } from "@/lib/auth";
import { sidebarAccounts } from "@/lib/data";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const me = await requireUser();
  const accounts = await sidebarAccounts(prisma, me.workspace.id);
  return (
    <div className="min-h-screen lg:flex">
      <Sidebar workspace={me.workspace.name} user={{ name: me.user.name, email: me.user.email }} accounts={accounts} />
      <main className="min-w-0 flex-1">
        <div className="mx-auto max-w-[1180px] px-4 py-6 sm:px-6 lg:px-10 lg:py-9">{children}</div>
      </main>
    </div>
  );
}
