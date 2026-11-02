import { prisma } from "@invytra/db";
import Link from "next/link";
import { AuthForm } from "@/components/AuthForm";
import { MIN_PASSWORD_LENGTH } from "@/lib/password";
import { resetTokenValid } from "@/lib/password-reset";
import { chooseNewPassword } from "../actions";

export const metadata = { title: "Choose a new password", robots: { index: false } };
export const dynamic = "force-dynamic";

export default async function ResetPasswordPage({ searchParams }: { searchParams: Promise<{ token?: string }> }) {
  const token = (await searchParams).token ?? "";
  if (!(await resetTokenValid(prisma, token))) {
    return (
      <div className="text-center">
        <h1 className="text-xl font-semibold tracking-tight">This link has expired</h1>
        <p className="mt-2 text-[16px] text-stone-600">Reset links work once, for 60 minutes. Ask for a new one.</p>
        <Link href="/forgot-password" className="mt-5 inline-block rounded-lg bg-brand-400 px-4 py-2.5 text-[15px] font-semibold text-stone-900 hover:bg-brand-300">
          Send a new link
        </Link>
      </div>
    );
  }
  return (
    <>
      <h1 className="text-xl font-semibold tracking-tight">Choose a new password</h1>
      <p className="mb-6 mt-1 text-[16px] text-stone-500">You'll be signed out on every other device.</p>
      <AuthForm
        hidden={{ token }}
        action={chooseNewPassword}
        submit="Save new password"
        pending="Saving…"
        fields={[
          { name: "password", label: "New password", type: "password", autoComplete: "new-password", hint: `At least ${MIN_PASSWORD_LENGTH} characters.` },
          { name: "confirm", label: "New password again", type: "password", autoComplete: "new-password" },
        ]}
        footer={{ text: "Remembered it?", href: "/login", link: "Log in" }}
      />
    </>
  );
}
