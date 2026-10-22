"use server";

import { prisma } from "@invytra/db";
import { redirect } from "next/navigation";
import { endSession, startSession } from "@/lib/auth";
import { EmailTakenError, checkLogin, registerUser, signupSchema } from "@/lib/registration";
import { clearFailures, isThrottled, recordFailure } from "@/lib/throttle";

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
  redirect("/app");
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
  redirect("/app");
}

export async function logout(): Promise<void> {
  await endSession();
  redirect("/login");
}
