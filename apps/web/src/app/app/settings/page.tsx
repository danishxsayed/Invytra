import { prisma } from "@invytra/db";
import { Building2, KeyRound, ShieldCheck, UserRound, Users } from "lucide-react";
import { PasswordForm, ProfileForm, SignOutOthers, WorkspaceForm } from "@/components/SettingsForms";
import { Avatar, Card, PageHeader } from "@/components/ui";
import { requireUser } from "@/lib/auth";
import { timeAgo } from "@/lib/format";
import { teamMembers } from "@/lib/settings";

export const metadata = { title: "Settings" };
export const dynamic = "force-dynamic";

function Section({ icon: Icon, title, hint, children }: { icon: typeof UserRound; title: string; hint: string; children: React.ReactNode }) {
  return (
    <Card className="grid gap-5 p-5 sm:p-6 lg:grid-cols-[280px_1fr]">
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

export default async function SettingsPage() {
  const me = await requireUser();
  const members = await teamMembers(prisma, me.workspace.id);
  const now = new Date();
  return (
    <div className="space-y-6 animate-fade-up">
      <PageHeader title="Settings" description="Your profile, password, workspace and team." />

      <Section icon={UserRound} title="Profile" hint="How you appear in Invytra, and the email you log in with.">
        <ProfileForm name={me.user.name} email={me.user.email} />
      </Section>

      <Section icon={KeyRound} title="Password" hint="Changing it signs you out on every other device.">
        <PasswordForm />
      </Section>

      <Section icon={ShieldCheck} title="Sessions" hint="You stay signed in for 14 days on each browser.">
        <SignOutOthers />
      </Section>

      <Section icon={Building2} title="Workspace" hint={`Plan: ${me.workspace.plan === "trial" ? "Trial" : me.workspace.plan}. Billing arrives with the public launch.`}>
        <WorkspaceForm name={me.workspace.name} canEdit={me.role === "OWNER"} />
      </Section>

      <Section icon={Users} title="Team" hint="Everyone here sees the same accounts, lists, campaigns and inbox.">
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
    </div>
  );
}
