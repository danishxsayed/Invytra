"use server";

import { prisma } from "@invytra/db";
import { redirect } from "next/navigation";
import { endSession, startSession } from "@/lib/auth";
import { hubHref, safeNext } from "@/lib/domains";
import { EmailTakenError, checkLogin, registerUser, signupSchema } from "@/lib/registration";
import { clearFailures, isThrottled, recordFailure } from "@/lib/throttle";
import { newPasswordSchema, requestPasswordReset, resetPassword } from "@/lib/password-reset";
import { platformMailer } from "@/lib/platform-mail";

export interface FormState {
  error?: string;
  fields?: Record<string, string>;
}

export async function signup(_prev: FormState, form: FormData): Promise<FormState> {
  const raw = Object.fromEntries(["name", "company", "email", "password"].map((k) => [k, String(form.get(k) ?? "")]));
  const parsed = signupSchema.safeParse(raw);
  const keep = { name: raw.name!, company: raw.company!, email: raw.email! };
  if (!parsed.success) return { error: parsed.error.issues[0]!.message, fields: keep };
  try {
    const { userId, workspaceId } = await registerUser(prisma, parsed.data);
    await startSession(userId, workspaceId);
  } catch (e) {
    if (e instanceof EmailTakenError) return { error: e.message, fields: keep };
    throw e;
  }
  redirect(afterSignIn(form));
}

export async function login(_prev: FormState, form: FormData): Promise<FormState> {
  const email = String(form.get("email") ?? "").trim().toLowerCase();
  const password = String(form.get("password") ?? "");
  if (isThrottled(email)) {
    return { error: "Too many attempts. Wait 15 minutes, then try again.", fields: { email } };
  }
  const result = await checkLogin(prisma, email, password);
  if (!result) {
    recordFailure(email);
    return { error: "That email and password don't match.", fields: { email } };
  }
  clearFailures(email);
  await startSession(result.userId, result.workspaceId);
  redirect(afterSignIn(form));
}

export async function logout(): Promise<void> {
  await endSession();
  redirect(hubHref("/login"));
}

/** Back to the page that asked for a sign-in (only ours), or the workspace hub. */
function afterSignIn(form: FormData): string {
  return safeNext(String(form.get("next") ?? "")) ?? hubHref("/");
}

export async function forgotPassword(_prev: FormState, form: FormData): Promise<FormState> {
  const email = String(form.get("email") ?? "").trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[a-z]{2,}$/i.test(email)) return { error: "Enter the email you log in with.", fields: { email } };
  const send = platformMailer();
  if (!send) return { error: "Password reset emails aren't set up on this server yet. Ask the Invytra team to reset it for you.", fields: { email } };
  if (isThrottled(`reset:${email}`)) return { error: "Too many requests. Wait 15 minutes, then try again.", fields: { email } };
  recordFailure(`reset:${email}`);
  try {
    await requestPasswordReset(prisma, email, send);
  } catch (e) {
    console.error(`Password reset email failed: ${e instanceof Error ? e.message : e}`);
    return { error: "We couldn't send the email right now. Try again in a few minutes.", fields: { email } };
  }
  // Same answer whether or not the address has an account.
  redirect(hubHref("/forgot-password?sent=1"));
}

export async function chooseNewPassword(_prev: FormState, form: FormData): Promise<FormState> {
  const token = String(form.get("token") ?? "");
  const parsed = newPasswordSchema.safeParse({ password: String(form.get("password") ?? ""), confirm: String(form.get("confirm") ?? "") });
  if (!parsed.success) return { error: parsed.error.issues[0]!.message };
  const r = await resetPassword(prisma, token, parsed.data.password);
  if (!r.ok) return { error: r.error };
  redirect(hubHref("/login?reset=1"));
}
