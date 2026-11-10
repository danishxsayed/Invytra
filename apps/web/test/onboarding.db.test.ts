/**
 * Onboarding against a real database (only with TEST_DATABASE_URL — it is wiped).
 */
import { PrismaClient } from "@invytra/db";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { getAnswers, hideSetupPlan, saveOnboarding, setupProgress } from "../src/lib/onboarding";

const url = process.env.TEST_DATABASE_URL;
const d = url ? describe : describe.skip;

d("onboarding", () => {
  let prisma: PrismaClient;
  const WS = "ws-onb";
  const U = "u-onb";

  beforeAll(async () => {
    prisma = new PrismaClient({ datasources: { db: { url } } });
    await prisma.workspace.deleteMany({ where: { id: WS } });
    await prisma.user.deleteMany({ where: { id: U } });
    await prisma.workspace.create({ data: { id: WS, name: "Onb" } });
    await prisma.user.create({ data: { id: U, email: "onb@x.co", name: "Onb", passwordHash: "x", memberships: { create: { workspaceId: WS, role: "OWNER" } } } });
  });
  afterAll(async () => {
    await prisma.workspace.deleteMany({ where: { id: WS } });
    await prisma.user.deleteMany({ where: { id: U } });
    await prisma.$disconnect();
  });

  it("saves the answers (or none) and marks them done; bad answers are refused", async () => {
    expect(await saveOnboarding(prisma, U, { role: "wizard" })).toMatchObject({ ok: false });
    expect((await prisma.user.findUniqueOrThrow({ where: { id: U } })).onboardedAt).toBeNull();
    expect(await saveOnboarding(prisma, U, { role: "recruiter", goal: "hiring", channels: ["linkedin"], heardFrom: "ai", heardOther: "ignored" })).toEqual({ ok: true, value: undefined });
    const u = await prisma.user.findUniqueOrThrow({ where: { id: U } });
    expect(u.onboardedAt).toBeInstanceOf(Date);
    expect(await getAnswers(prisma, U)).toEqual({ role: "recruiter", goal: "hiring", channels: ["linkedin"], heardFrom: "ai" });
    await hideSetupPlan(prisma, U);
    expect(await getAnswers(prisma, U)).toMatchObject({ role: "recruiter", planHidden: true });
  });

  it("counts what the workspace has set up (drafts and disconnected accounts don't count)", async () => {
    expect(await setupProgress(prisma, WS)).toEqual({ linkedinAccounts: 0, mailboxes: 0, people: 0, campaignsLive: 0, voices: 0, doNotContact: 0 });
    await prisma.linkedinAccount.createMany({
      data: [
        { id: "onb-a1", workspaceId: WS, label: "a", proxyUrl: "", workingHours: {}, limits: {}, status: "DISCONNECTED" },
        { id: "onb-a2", workspaceId: WS, label: "b", proxyUrl: "", workingHours: {}, limits: {}, status: "ACTIVE" },
      ],
    });
    await prisma.leadList.create({ data: { id: "onb-l", workspaceId: WS, name: "L" } });
    await prisma.lead.create({ data: { workspaceId: WS, listId: "onb-l", profileUrl: "https://www.linkedin.com/in/x/" } });
    await prisma.campaign.create({ data: { workspaceId: WS, name: "Draft", listId: "onb-l", steps: [], settings: {} } });
    await prisma.voiceClone.create({ data: { workspaceId: WS, name: "Me", providerVoiceId: "v", consentAt: new Date(), consentByUserId: U } });
    expect(await setupProgress(prisma, WS)).toEqual({ linkedinAccounts: 1, mailboxes: 0, people: 1, campaignsLive: 0, voices: 1, doNotContact: 0 });
  });
});
