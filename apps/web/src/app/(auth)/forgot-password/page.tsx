import { MailCheck } from "lucide-react";
import Link from "next/link";
import { AuthForm } from "@/components/AuthForm";
import { forgotPassword } from "../actions";

export const metadata = { title: "Forgot password" };

export default async function ForgotPasswordPage({ searchParams }: { searchParams: Promise<{ sent?: string }> }) {
  if ((await searchParams).sent === "1") {
    return (
      <div className="text-center">
        <MailCheck className="mx-auto h-10 w-10 text-emerald-600" aria-hidden />
        <h1 className="mt-3 text-xl font-semibold tracking-tight">Check your email</h1>
        <p className="mt-2 text-[16px] text-stone-600">If that address has an Invytra account, we've sent it a link to choose a new password. It works for 60 minutes. Check spam if it isn't there in a minute.</p>
        <Link href="/login" className="mt-5 inline-block text-[15px] font-medium text-brand-800 hover:text-stone-900">
          Back to log in
        </Link>
      </div>
    );
  }
  return (
    <>
      <h1 className="text-xl font-semibold tracking-tight">Forgot your password?</h1>
      <p className="mb-6 mt-1 text-[16px] text-stone-500">Enter the email you log in with and we'll send you a link to choose a new one.</p>
      <AuthForm
        action={forgotPassword}
        submit="Email me a link"
        pending="Sending…"
        fields={[{ name: "email", label: "Email", type: "email", autoComplete: "email", placeholder: "you@company.com" }]}
        footer={{ text: "Remembered it?", href: "/login", link: "Log in" }}
      />
    </>
  );
}
