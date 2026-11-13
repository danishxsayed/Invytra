"use server";

import { prisma } from "@invytra/db";
import { revalidatePath } from "next/cache";
import type { Result } from "@/lib/accounts";
import { requireUser } from "@/lib/auth";
import { hideSetupPlan, saveOnboarding } from "@/lib/onboarding";

/** The answers after sign-up (some or none); the workspace opens afterwards. */
export async function saveOnboardingAction(answers: unknown): Promise<Result> {
  const me = await requireUser();
  const r = await saveOnboarding(prisma, me.user.id, answers, me.role === "OWNER" ? me.workspace.id : undefined);
  if (r.ok) revalidatePath("/", "layout");
  return r;
}

export async function hideSetupPlanAction(): Promise<void> {
  const me = await requireUser();
  await hideSetupPlan(prisma, me.user.id);
  revalidatePath("/", "layout");
}
