/** Campaign audience settings: connection levels, Premium only, other campaigns (only with TEST_DATABASE_URL). */
import { PrismaClient } from "@invytra/db";
import type { Queue } from "bullmq";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { campaignTick } from "../../src/campaigns/engine.js";
import type { ActionJob } from "../../src/queue/queue.js";

const url = process.env.TEST_DATABASE_URL;
const d = url ? describe : describe.skip;

d("campaign audience", () => {
  let prisma: PrismaClient;
  const queue = { add: async () => undefined } as unknown as Queue<ActionJob>;
  const clock = new Date("2026-10-27T06:00:00Z");
  const tick = () => campaignTick({ prisma, queue, now: () => clock, random: () => 0, maxPendingPerType: 50 });
  const WS = "ws-audience";
  const U = (s: string) => `https://www.linkedin.com/in/${s}/`;
  const lead = (campaignId: string, slug: string) => prisma.campaignLead.findFirstOrThrow({ where: { campaignId, profileUrl: U(slug) } });
  const actionFor = (campaignId: string, slug: string) =>
    prisma.action.findFirst({ where: { targetUrl: U(slug), campaignLead: { campaignId } }, orderBy: { createdAt: "desc" } });
  const campaign = (id: string, listId: string, settings: object, steps: object[] = [{ type: "INVITE", delayDays: 0, note: "" }]) =>
    prisma.campaign.create({ data: { id, workspaceId: WS, name: id, senders: { create: { accountId: "acc-aud" } }, listId, status: "ACTIVE", steps, settings } });

  beforeAll(async () => {
    prisma = new PrismaClient({ datasources: { db: { url } } });
    await prisma.workspace.deleteMany({ where: { id: WS } });
    await prisma.workspace.create({ data: { id: WS, name: "Audience" } });
    await prisma.linkedinAccount.create({ data: { id: "acc-aud", workspaceId: WS, label: "a", proxyUrl: "", workingHours: {}, limits: {}, status: "ACTIVE" } });
    await prisma.leadList.create({ data: { id: "list-aud", workspaceId: WS, name: "Imported" } });
    await prisma.lead.createMany({
      data: [
        { workspaceId: WS, listId: "list-aud", profileUrl: U("first"), firstName: "First", degree: 1, premium: false },
        { workspaceId: WS, listId: "list-aud", profileUrl: U("second"), firstName: "Second", degree: 2 },
        { workspaceId: WS, listId: "list-aud", profileUrl: U("third"), firstName: "Third", degree: 3, premium: true },
        { workspaceId: WS, listId: "list-aud", profileUrl: U("unknown"), firstName: "Unknown" },
      ],
    });
  });
  afterAll(async () => {
    await prisma.workspace.deleteMany({ where: { id: WS } });
    await prisma.$disconnect();
  });

  it("skips known people outside the connection levels, and lets the profile decide for the rest", async () => {
    await campaign("aud-1", "list-aud", { degrees: [2, 3] });
    await tick();
    expect(await lead("aud-1", "first")).toMatchObject({ state: "SKIPPED", reason: "AUDIENCE:DEGREE_1", degree: 1 });
    expect(await lead("aud-1", "second")).toMatchObject({ state: "IN_PROGRESS", degree: 2 });
    // Unknown degree: the invite carries the audience, so the worker checks the profile before inviting.
    expect((await actionFor("aud-1", "unknown"))?.payload).toMatchObject({ audience: { degrees: [2, 3], premiumOnly: false } });

    // The worker found them to be 1st-degree: the lead stops, and the list remembers it.
    const a = (await actionFor("aud-1", "unknown"))!;
    await prisma.action.update({
      where: { id: a.id },
      data: { status: "SKIPPED", error: "AUDIENCE:DEGREE_1", executedAt: clock, payload: { ...(a.payload as object), result: { name: "Unknown Person", degree: 1, premium: false, photoUrl: "https://media.licdn.com/p.jpg" } } },
    });
    await tick();
    expect(await lead("aud-1", "unknown")).toMatchObject({ state: "SKIPPED", reason: "AUDIENCE:DEGREE_1", degree: 1, premium: false });
    expect(await prisma.lead.findFirst({ where: { profileUrl: U("unknown") } })).toMatchObject({ degree: 1, premium: false, photoUrl: "https://media.licdn.com/p.jpg" });
  });

  it("Premium only, and choosing to include people from other campaigns", async () => {
    await campaign("aud-2", "list-aud", { premiumOnly: true, skipOtherCampaigns: false });
    await tick();
    // Not skipped as IN_OTHER_CAMPAIGN even though aud-1 has them all.
    expect(await lead("aud-2", "third")).toMatchObject({ state: "IN_PROGRESS" });
    expect(await lead("aud-2", "first")).toMatchObject({ state: "SKIPPED", reason: "AUDIENCE:NOT_PREMIUM" }); // known to have no badge
    expect(await lead("aud-2", "second")).toMatchObject({ state: "IN_PROGRESS" }); // Premium unknown: the profile decides
  });

  it("campaigns without audience settings add nothing to the action", async () => {
    await prisma.leadList.create({ data: { id: "list-aud2", workspaceId: WS, name: "Other" } });
    await prisma.lead.create({ data: { workspaceId: WS, listId: "list-aud2", profileUrl: U("plain"), firstName: "Plain" } });
    await campaign("aud-3", "list-aud2", {});
    await tick();
    expect((await actionFor("aud-3", "plain"))?.payload).not.toHaveProperty("audience");
  });

  it("never contacts anyone on the workspace's do-not-contact list (profile, company or email domain)", async () => {
    await prisma.leadList.create({ data: { id: "list-dnc", workspaceId: WS, name: "DNC" } });
    await prisma.lead.createMany({
      data: [
        { workspaceId: WS, listId: "list-dnc", profileUrl: U("blocked-person"), firstName: "Blocked" },
        { workspaceId: WS, listId: "list-dnc", profileUrl: U("at-customer"), firstName: "Cust", company: "Acme, Inc." },
        { workspaceId: WS, listId: "list-dnc", profileUrl: U("by-domain"), firstName: "Dom", email: "dom@mail.globex.com" },
        { workspaceId: WS, listId: "list-dnc", profileUrl: U("fine"), firstName: "Fine", company: "Initech" },
      ],
    });
    await prisma.doNotContact.createMany({
      data: [
        { workspaceId: WS, kind: "LINKEDIN", value: "blocked-person", label: U("blocked-person") },
        { workspaceId: WS, kind: "COMPANY", value: "acme", label: "Acme" },
        { workspaceId: WS, kind: "DOMAIN", value: "globex.com", label: "globex.com" },
      ],
    });
    await campaign("aud-dnc", "list-dnc", {});
    await tick();
    for (const slug of ["blocked-person", "at-customer", "by-domain"]) {
      expect(await lead("aud-dnc", slug)).toMatchObject({ state: "SKIPPED", reason: "On your do-not-contact list" });
      expect(await actionFor("aud-dnc", slug)).toBeNull();
    }
    expect(await lead("aud-dnc", "fine")).toMatchObject({ state: "IN_PROGRESS" });
  });
});
