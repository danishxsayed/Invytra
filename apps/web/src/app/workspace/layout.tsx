import { channelById } from "@invytra/shared";
import { Onboarding } from "@/components/onboarding/Onboarding";
import { prisma } from "@invytra/db";
import { MainFrame } from "@/components/MainFrame";
import { PlanBanner } from "@/components/billing/PlanBanner";
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
  if (!me.user.onboarded) return <Onboarding firstName={me.user.name.split(" ")[0] || me.user.name} whatsappLive={channelById("whatsapp")?.status === "live"} trial={me.workspace.plan === "trial" && me.role === "OWNER"} />;
  const [ai, waiting] = await Promise.all([getAiBalance(prisma, me.workspace.id), unifiedNeedsCount(prisma, me.workspace.id, me.workspace.channels)]);
  return (
    <div className="min-h-screen lg:flex">
      <WorkspaceNav
        workspace={me.workspace.name}
        user={{ name: me.user.name, email: me.user.email }}
        overview={hubHref("/")}
        settings={hubHref("/settings")}
        dnc={hubHref("/do-not-contact")}
        invy={hubHref("/invy")}
        inbox={{ href: hubHref("/inbox"), waiting }}
        billing={canSeeBilling(me) ? hubHref("/billing") : null}
        credits={{ left: ai.left, href: creditsHref(me) }}
      />
      <main className="min-w-0 flex-1">
        <PlanBanner workspaceId={me.workspace.id} owner={me.role === "OWNER"} />
        <MainFrame>{children}</MainFrame>
      </main>
    </div>
  );
}
