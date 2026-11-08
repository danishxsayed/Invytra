import { prisma } from "@invytra/db";
import { AudioLines, Building2, ChevronRight, KeyRound, ShieldCheck, UserRound, Users, Video } from "lucide-react";
import { PasswordForm, ProfileForm, SignOutOthers, WorkspaceForm } from "@/components/SettingsForms";
import { Avatar, Card } from "@/components/ui";
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

/** Settings for the whole workspace (every channel), and the signed-in person's own account. */
export default async function WorkspaceSettingsPage() {
  const me = await requireUser();
  const members = await teamMembers(prisma, me.workspace.id);
  const voices = await prisma.voiceClone.count({ where: { workspaceId: me.workspace.id } });
  const videos = await prisma.videoRecording.count({ where: { workspaceId: me.workspace.id } });
  const now = new Date();
  const owner = me.role === "OWNER";
  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-[28px] font-semibold tracking-tight text-stone-900">Workspace settings</h1>
        <p className="mt-1 text-[15px] text-stone-500">These apply to every channel: LinkedIn, Email and the ones coming next.</p>
      </div>

      <div className="space-y-4">
        <h2 className="text-[13px] font-semibold uppercase tracking-wider text-stone-400">Workspace</h2>
        <Section icon={Building2} title="General" hint={owner ? "The name everyone in this workspace sees." : "Only the workspace owner can rename it."}>
          <WorkspaceForm name={me.workspace.name} canEdit={owner} />
        </Section>

        <Section icon={Users} title="Team" hint="Everyone here shares the same channels, accounts, lists, campaigns and inbox.">
          <ul className="divide-y divide-stone-100 rounded-xl border border-stone-200">
            {members.map((m) => (
              <li key={m.user.id} className="flex items-center gap-3 px-4 py-3">
                <Avatar name={m.user.name} />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[15px] font-medium text-stone-900">
                    {m.user.name}
                    {m.user.id === me.user.id && <span className="font-normal text-stone-400"> (you)</span>}
                  </p>
                  <p className="truncate text-[14px] text-stone-500">{m.user.email}</p>
                </div>
                <div className="text-right">
                  <p className="text-[14px] font-medium text-stone-700">{m.role === "OWNER" ? "Owner" : "Member"}</p>
                  {m.user.lastLoginAt && <p className="text-[13px] text-stone-400">Last login {timeAgo(m.user.lastLoginAt, now)}</p>}
                </div>
              </li>
            ))}
          </ul>
          <p className="mt-3 text-[14px] text-stone-500">Inviting teammates by email comes with the public launch (needs email sending on the server).</p>
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
      </div>

      <div className="space-y-4">
        <h2 className="text-[13px] font-semibold uppercase tracking-wider text-stone-400">Your account</h2>
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
    </div>
  );
}
