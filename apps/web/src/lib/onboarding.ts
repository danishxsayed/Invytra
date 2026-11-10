import type { PrismaClient } from "@invytra/db";
import { onboardingSchema, readAnswers, type OnboardingAnswers, type SetupProgress } from "@invytra/shared";
import type { Result } from "./accounts";

/** Saves the answers after sign-up (any can be skipped) and marks the questions done. */
export async function saveOnboarding(prisma: PrismaClient, userId: string, input: unknown): Promise<Result> {
  const r = onboardingSchema.safeParse(input);
  if (!r.success) return { ok: false, error: "Some answers weren't understood. Please try again." };
  const answers: OnboardingAnswers = { ...r.data };
  if (answers.heardFrom !== "other") delete answers.heardOther;
  await prisma.user.update({ where: { id: userId }, data: { onboarding: answers, onboardedAt: new Date() } });
  return { ok: true, value: undefined };
}

export async function getAnswers(prisma: PrismaClient, userId: string): Promise<OnboardingAnswers> {
  const u = await prisma.user.findUnique({ where: { id: userId }, select: { onboarding: true } });
  return readAnswers(u?.onboarding);
}

/** Closes the setup plan on the overview (for this person). */
export async function hideSetupPlan(prisma: PrismaClient, userId: string): Promise<void> {
  const answers = await getAnswers(prisma, userId);
  await prisma.user.update({ where: { id: userId }, data: { onboarding: { ...answers, planHidden: true } } });
}

/** What this workspace has set up so far, from real data. */
export async function setupProgress(prisma: PrismaClient, workspaceId: string): Promise<SetupProgress> {
  const w = { workspaceId };
  const [linkedinAccounts, mailboxes, leads, contacts, campaigns, emailCampaigns, voices, doNotContact] = await Promise.all([
    prisma.linkedinAccount.count({ where: { ...w, status: "ACTIVE" } }),
    prisma.emailAccount.count({ where: w }),
    prisma.lead.count({ where: w }),
    prisma.emailContact.count({ where: w }),
    prisma.campaign.count({ where: { ...w, status: { not: "DRAFT" } } }),
    prisma.emailCampaign.count({ where: { ...w, status: { not: "DRAFT" } } }),
    prisma.voiceClone.count({ where: w }),
    prisma.doNotContact.count({ where: w }),
  ]);
  return { linkedinAccounts, mailboxes, people: leads + contacts, campaignsLive: campaigns + emailCampaigns, voices, doNotContact };
}
