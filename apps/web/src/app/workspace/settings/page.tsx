import { prisma } from "@invytra/db";
import { AudioLines, Building2, ChevronRight, KeyRound, ShieldCheck, Trash2, UserRound, Users, Video } from "lucide-react";
import { DeleteWorkspace } from "@/components/DeleteWorkspace";
import { TeamManager } from "@/components/settings/TeamManager";
import { listInvites } from "@/lib/team";
import { PasswordForm, ProfileForm, SignOutOthers, WorkspaceForm } from "@/components/SettingsForms";
import { PageTabs, pickTab } from "@/components/PageTabs";
import { Card } from "@/components/ui";
import { getAiBalance } from "@/lib/ai-credits";
import { requireUser } from "@/lib/auth";
import { hubHref } from "@/lib/domains";
import { timeAgo } from "@/lib/format";
import { teamMembers } from "@/lib/settings";

export const metadata = { title: "Workspace settings" };
export const dynamic = "force-dynamic";

function Section({ icon: Icon, title, hint, children }: { icon: typeof UserRound; title: string; hint: string; children: React.ReactNode }) {
  return (
    <Card className="grid gap-5 p-5 sm:p-6 lg:grid-cols-[240px_1fr]">
      <div>
        <div className="flex items-center gap-2">
          <Icon className="h-4 w-4 text-stone-400" aria-hidden />
          <h2 className="text-[17px] font-semibold text-stone-900">{title}</h2>
        </div>
        <p className="mt-1 text-[15px] text-stone-500">{hint}</p>
      </div>
      <div className="min-w-0">{children}</div>
    </Card>
  );
}

const TABS = [
  { id: "general", label: "General", icon: Building2 },
  { id: "team", label: "Team", icon: Users },
  { id: "account", label: "Your account", icon: UserRound },
];

/** Settings for the whole workspace (every channel), and the signed-in person's own account. */
export default async function WorkspaceSettingsPage({ searchParams }: { searchParams: Promise<{ tab?: string }> }) {
  const me = await requireUser();
  const tab = pickTab(TABS, (await searchParams).tab);
  const [members, invites] = await Promise.all([teamMembers(prisma, me.workspace.id), listInvites(prisma, me.workspace.id)]);
  const voices = await prisma.voiceClone.count({
    where: { workspaceId: me.workspace.id },
  });
  const videos = await prisma.videoRecording.count({
    where: { workspaceId: me.workspace.id },
  });
  const now = new Date();
  const owner = me.role === "OWNER";
  const ai = owner ? await getAiBalance(prisma, me.workspace.id) : null;
  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-[28px] font-semibold tracking-tight text-stone-900">Workspace settings</h1>
        <p className="mt-1 text-[15px] text-stone-500">These apply to every channel: LinkedIn, Email and the ones coming next.</p>
      </div>
      <PageTabs tabs={TABS} active={tab} label="Workspace settings" />

      {tab === "team" && (
        <div className="space-y-4">
          <Section icon={Users} title="Team" hint="Everyone here shares the same channels, accounts, lists, campaigns and inbox.">
            <TeamManager
              canManage={owner}
              members={members.map((m) => ({
                id: m.user.id,
                name: m.user.name,
                email: m.user.email,
                owner: m.role === "OWNER",
                you: m.user.id === me.user.id,
                lastLogin: m.user.lastLoginAt ? timeAgo(m.user.lastLoginAt, now) : null,
              }))}
              invites={invites.map((i) => ({
                id: i.id,
                email: i.email,
                sent: timeAgo(i.sentAt, now),
              }))}
            />
          </Section>
        </div>
      )}

      {tab === "general" && (
        <div className="space-y-4">
          <Section icon={Building2} title="General" hint={owner ? "The name everyone in this workspace sees." : "Only the workspace owner can rename it."}>
            <WorkspaceForm name={me.workspace.name} canEdit={owner} />
          </Section>

          <Section icon={AudioLines} title="Voices" hint="Copies of your voice for voice notes, used by every channel that sends them.">
            <a href={hubHref("/voices")} className="flex items-center gap-3 rounded-xl border border-stone-200 px-4 py-3 transition hover:border-stone-300 hover:bg-stone-50">
              <span className="flex-1 text-[15px] text-stone-800">{voices ? `${voices} voice${voices > 1 ? "s" : ""} ready` : "No voice yet: record yours in about a minute"}</span>
              <ChevronRight className="h-4 w-4 text-stone-400" aria-hidden />
            </a>
          </Section>

          <Section icon={Video} title="Videos" hint="Short videos you recorded once, sent as video notes with each person's name.">
            <a href={hubHref("/videos")} className="flex items-center gap-3 rounded-xl border border-stone-200 px-4 py-3 transition hover:border-stone-300 hover:bg-stone-50">
              <span className="flex-1 text-[15px] text-stone-800">{videos ? `${videos} video${videos > 1 ? "s" : ""} ready` : "No video yet: record one in a couple of minutes"}</span>
              <ChevronRight className="h-4 w-4 text-stone-400" aria-hidden />
            </a>
          </Section>

          {owner && (
            <div className="space-y-4 pt-4">
              <h2 className="text-[13px] font-semibold uppercase tracking-wider text-rose-400">Danger zone</h2>
              <Section icon={Trash2} title="Delete workspace" hint="Only you, the owner, can do this.">
                <DeleteWorkspace workspace={me.workspace.name} credits={ai?.left ?? 0} />
              </Section>
            </div>
          )}
        </div>
      )}

      {tab === "account" && (
        <div className="space-y-4">
          <Section icon={UserRound} title="Profile" hint="How you appear in Invytra, and the email you log in with.">
            <ProfileForm name={me.user.name} email={me.user.email} />
          </Section>
          <Section icon={KeyRound} title="Password" hint="Changing it signs you out on every other device.">
            <PasswordForm />
          </Section>
          <Section icon={ShieldCheck} title="Sessions" hint="You stay signed in for 14 days on each browser.">
            <SignOutOthers />
          </Section>
        </div>
      )}
    </div>
  );
}
