import { prisma } from "@invytra/db";
import Link from "next/link";
import { AuthForm } from "@/components/AuthForm";
import { currentUser } from "@/lib/auth";
import { hubHref } from "@/lib/domains";
import { MIN_PASSWORD_LENGTH } from "@/lib/password";
import { inviteInfo } from "@/lib/team";
import { acceptInvitation } from "../actions";

export const metadata = { title: "Join your team", robots: { index: false } };
export const dynamic = "force-dynamic";

/** The link in an invitation email: create your account and join the workspace. */
export default async function InvitePage({ searchParams }: { searchParams: Promise<{ token?: string }> }) {
  const token = (await searchParams).token ?? "";
  const [invite, me] = await Promise.all([inviteInfo(prisma, token), currentUser()]);
  if (!invite)
    return (
      <div className="text-center">
        <h1 className="text-xl font-semibold tracking-tight">This invitation has expired</h1>
        <p className="mt-2 text-[16px] text-stone-600">Invitations work once, for 7 days. Ask your teammate to send a new one.</p>
        <Link href="/login" className="mt-5 inline-block rounded-lg bg-stone-900 px-4 py-2.5 text-[15px] font-semibold text-white hover:bg-stone-800">
          Log in
        </Link>
      </div>
    );
  if (me)
    return (
      <div className="text-center">
        <h1 className="text-xl font-semibold tracking-tight">You&apos;re signed in as {me.user.email}</h1>
        <p className="mt-2 text-[16px] text-stone-600">
          This invitation is for {invite.email}. Log out first, then open the link again to join {invite.workspace}.
        </p>
        <Link href={hubHref("/")} className="mt-5 inline-block rounded-lg border border-stone-300 px-4 py-2.5 text-[15px] font-semibold text-stone-900 hover:bg-stone-50">
          Back to my workspace
        </Link>
      </div>
    );
  return (
    <>
      <h1 className="text-xl font-semibold tracking-tight">Join {invite.workspace}</h1>
      <p className="mb-6 mt-1 text-[16px] text-stone-500">
        {invite.inviter} invited you to their Invytra workspace. Create your account for <span className="font-medium text-stone-800">{invite.email}</span>.
      </p>
      <AuthForm
        hidden={{ token }}
        action={acceptInvitation}
        submit="Join the workspace"
        pending="Joining…"
        fields={[
          { name: "name", label: "Your name", autoComplete: "name", placeholder: "Alex Morgan" },
          { name: "password", label: "Choose a password", type: "password", autoComplete: "new-password", hint: `At least ${MIN_PASSWORD_LENGTH} characters.` },
        ]}
        footer={{ text: "Already have an account?", href: "/login", link: "Log in" }}
      />
    </>
  );
}
