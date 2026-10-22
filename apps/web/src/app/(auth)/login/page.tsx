import { redirect } from "next/navigation";
import { AuthForm } from "@/components/AuthForm";
import { currentUser } from "@/lib/auth";
import { login } from "../actions";

export const metadata = { title: "Log in" };

export default async function LoginPage() {
  if (await currentUser()) redirect("/app");
  return (
    <>
      <h1 className="text-xl font-semibold tracking-tight">Welcome back</h1>
      <p className="mb-6 mt-1 text-[16px] text-stone-500">Log in to your Invytra workspace.</p>
      <AuthForm
        action={login}
        submit="Log in"
        pending="Logging in…"
        fields={[
          { name: "email", label: "Email", type: "email", autoComplete: "email", placeholder: "you@company.com" },
          { name: "password", label: "Password", type: "password", autoComplete: "current-password" },
        ]}
        footer={{ text: "New to Invytra?", href: "/signup", link: "Create an account" }}
      />
    </>
  );
}
