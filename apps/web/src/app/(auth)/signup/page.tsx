import { redirect } from "next/navigation";
import { AuthForm } from "@/components/AuthForm";
import { currentUser } from "@/lib/auth";
import { MIN_PASSWORD_LENGTH } from "@/lib/password";
import { signup } from "../actions";

export const metadata = { title: "Create account" };

export default async function SignupPage() {
  if (await currentUser()) redirect("/app");
  return (
    <>
      <h1 className="text-xl font-semibold tracking-tight">Create your account</h1>
      <p className="mb-6 mt-1 text-[14px] text-stone-500">Start your free trial. No card needed.</p>
      <AuthForm
        action={signup}
        submit="Create account"
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
        footer={{ text: "Already have an account?", href: "/login", link: "Log in" }}
      />
    </>
  );
}
