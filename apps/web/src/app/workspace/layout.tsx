import { channelById } from "@invytra/shared";
import { Onboarding } from "@/components/onboarding/Onboarding";
import { prisma } from "@invytra/db";
import { WorkspaceNav } from "@/components/WorkspaceNav";
import { getAiBalance } from "@/lib/ai-credits";
import { requireUser } from "@/lib/auth";
import { hubHref } from "@/lib/domains";
import { unifiedNeedsCount } from "@/lib/unified-inbox";
import { canSeeBilling, creditsHref } from "@/lib/workspace-nav";

/** Every workspace-level page (overview, settings, billing, voices) shares this menu. */
export default async function WorkspaceLayout({ children }: { children: React.ReactNode }) {
  const me = await requireUser();
  // New here: the questions after sign-up first (once; they can skip).
  if (!me.user.onboarded) return <Onboarding firstName={me.user.name.split(" ")[0] || me.user.name} whatsappLive={channelById("whatsapp")?.status === "live"} />;
  const [ai, waiting] = await Promise.all([getAiBalance(prisma, me.workspace.id), unifiedNeedsCount(prisma, me.workspace.id, me.workspace.channels)]);
  return (
    <div className="min-h-screen lg:flex">
      <WorkspaceNav
        workspace={me.workspace.name}
        user={{ name: me.user.name, email: me.user.email }}
        overview={hubHref("/")}
        settings={hubHref("/settings")}
        dnc={hubHref("/do-not-contact")}
        inbox={{ href: hubHref("/inbox"), waiting }}
        billing={canSeeBilling(me) ? hubHref("/billing") : null}
        credits={{ left: ai.left, href: creditsHref(me) }}
      />
      <main className="min-w-0 flex-1">
        <div className="mx-auto max-w-5xl px-4 py-8 sm:px-8 lg:py-10 print:max-w-none print:p-0">{children}</div>
      </main>
    </div>
  );
}
