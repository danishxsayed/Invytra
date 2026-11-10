import { redirect } from "next/navigation";
import { AuthForm } from "@/components/AuthForm";
import { currentUser } from "@/lib/auth";
import { hubHref, safeNext } from "@/lib/domains";
import { login } from "../actions";

export const metadata = { title: "Log in" };

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string; reset?: string; deleted?: string }> }) {
  const q = await searchParams;
  const next = safeNext(q.next);
  if (await currentUser()) redirect(next ?? hubHref("/"));
  return (
    <>
      <h1 className="text-xl font-semibold tracking-tight">Welcome back</h1>
      <p className="mb-6 mt-1 text-[16px] text-stone-500">Log in to your Invytra workspace.</p>
      {q.deleted === "1" && (
        <p className="mb-4 rounded-lg bg-stone-100 px-3 py-2 text-[15px] text-stone-700">Your workspace has been deleted. Thanks for trying Invytra.</p>
      )}
      {q.reset === "1" && <p className="mb-4 rounded-lg bg-emerald-50 px-3 py-2 text-[15px] text-emerald-800">Password changed. Log in with your new password.</p>}
      <AuthForm
        hidden={next ? { next } : undefined}
        action={login}
        submit="Log in"
        pending="Logging in…"
        fields={[
          { name: "email", label: "Email", type: "email", autoComplete: "email", placeholder: "you@company.com" },
          { name: "password", label: "Password", type: "password", autoComplete: "current-password" },
        ]}
        aside={{ href: "/forgot-password", text: "Forgot password?" }}
        footer={{ text: "New to Invytra?", href: next ? `/signup?next=${encodeURIComponent(next)}` : "/signup", link: "Create an account" }}
      />
    </>
  );
}
