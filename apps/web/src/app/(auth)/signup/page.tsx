import { PLANS, choiceFromParams, formatMoney, quotePlan } from "@invytra/shared";
import { redirect } from "next/navigation";
import { AuthForm } from "@/components/AuthForm";
import { currentUser } from "@/lib/auth";
import { hubHref, safeNext } from "@/lib/domains";
import { MIN_PASSWORD_LENGTH } from "@/lib/password";
import { signup } from "../actions";

export const metadata = { title: "Create account" };

export default async function SignupPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const next = safeNext((await searchParams).next);
  if (await currentUser()) redirect(next ?? hubHref("/"));
  // Came from a paid plan's card: they pay right after creating the account.
  const chosen = next ? (() => {
    try {
      const u = new URL(next, "http://x");
      return u.searchParams.get("pay") === "1" ? choiceFromParams((k) => u.searchParams.get(k)) : null;
    } catch {
      return null;
    }
  })() : null;
  const q = chosen ? quotePlan(chosen) : null;
  return (
    <>
      <h1 className="text-xl font-semibold tracking-tight">Create your account</h1>
      {chosen && q ? (
        <p className="mb-6 mt-1 text-[16px] text-stone-500">
          You chose <strong className="font-semibold text-stone-800">{PLANS[chosen.plan].name}</strong> ({formatMoney(q.periodCents)} a {chosen.cycle === "yearly" ? "year" : "month"}). Create your account, then pay by card.
        </p>
      ) : (
        <p className="mb-6 mt-1 text-[16px] text-stone-500">Start your free trial. No card needed.</p>
      )}
      <AuthForm
        hidden={next ? { next } : undefined}
        action={signup}
        submit={chosen ? "Create account and pay" : "Create account"}
        pending="Creating account…"
        fields={[
          { name: "name", label: "Your name", autoComplete: "name", placeholder: "Alex Morgan" },
          { name: "company", label: "Company", autoComplete: "organization", placeholder: "Acme Inc." },
          { name: "email", label: "Work email", type: "email", autoComplete: "email", placeholder: "you@company.com" },
          {
            name: "password",
            label: "Password",
            type: "password",
            autoComplete: "new-password",
            hint: `At least ${MIN_PASSWORD_LENGTH} characters.`,
          },
        ]}
        footer={{ text: "Already have an account?", href: next ? `/login?next=${encodeURIComponent(next)}` : "/login", link: "Log in" }}
      />
    </>
  );
}
