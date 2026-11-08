import { prisma } from "@invytra/db";
import { WorkspaceNav } from "@/components/WorkspaceNav";
import { getAiBalance } from "@/lib/ai-credits";
import { requireUser } from "@/lib/auth";
import { hubHref } from "@/lib/domains";
import { canSeeBilling, creditsHref, navChannels } from "@/lib/workspace-nav";

/** Every workspace-level page (overview, settings, billing, voices) shares this menu. */
export default async function WorkspaceLayout({ children }: { children: React.ReactNode }) {
  const me = await requireUser();
  const ai = await getAiBalance(prisma, me.workspace.id);
  return (
    <div className="min-h-screen lg:flex">
      <WorkspaceNav
        workspace={me.workspace.name}
        user={{ name: me.user.name, email: me.user.email }}
        overview={hubHref("/")}
        channels={navChannels(me)}
        settings={hubHref("/settings")}
        billing={canSeeBilling(me) ? hubHref("/billing") : null}
        credits={{ left: ai.left, href: creditsHref(me) }}
      />
      <main className="min-w-0 flex-1">
        <div className="mx-auto max-w-5xl px-4 py-8 sm:px-8 lg:py-10 print:max-w-none print:p-0">{children}</div>
      </main>
    </div>
  );
}
