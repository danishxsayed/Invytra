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
      <h1 className="text-2xl font-semibold">Create your account</h1>
      <p className="mb-8 mt-1 text-ink-soft">You'll connect your first LinkedIn account next.</p>
      <AuthForm
        action={signup}
        submit="Create account"
        pending="Creating account…"
        fields={[
          { name: "name", label: "Your name", autoComplete: "name" },
          { name: "company", label: "Company", autoComplete: "organization" },
          { name: "email", label: "Work email", type: "email", autoComplete: "email" },
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
